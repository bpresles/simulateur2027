import { defaultProjectionSettings, projectCampaign } from './campaignProjection'
import { runMonteCarlo } from './monteCarlo'
import type { MonteCarloInput } from './monteCarlo'
import { addDays, averageHypothesisPolls, daysBetween, normalize, pollWeight, weightedMeanByKey } from './pollAverage'
import { calibrationDates } from './sigmaCalibration'
import type { CalibrationYear } from './sigmaCalibration'
import { aggregatedProfileDropout, computeSecondRound, pollBiasGaps } from './secondRound'
import {
  DEFAULT_LFI_LEFT_TRANSFER_RANGE,
  applyRepublicanFrontRow,
  defaultRepublicanFront,
  fidelityFor,
  logitDelta,
  shiftTransferLogit,
} from './transfers'
import type { ProfileTable } from './transfers'
import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  PastElectionReference,
  ProfileId,
  Settings,
  SimulationData,
  TransferValues,
} from './types'

/** Élections du backtest : validation croisée « leave-one-out » sur ces trois scrutins. */
export type BacktestYear = 2012 | 2017 | 2022

export interface EveBacktestYear {
  year: BacktestYear
  pollCount: number
  /** RMSE des sondages bruts de la dernière semaine (pondérés fraîcheur/échantillon), en pts. */
  rawRmse: number
  /** Plus grand écart absolu d'un candidat sur la moyenne brute (pts). */
  rawMaxError: number
  /** RMSE hors échantillon avec correction par ratio issue de l'autre élection (candidats communs). */
  crossCorrectedRmse: number
}

export interface CampaignBacktestYear {
  year: BacktestYear
  /** Horizon cible demandé (distance actuelle J−d de 2027). */
  daysBefore: number
  /** Horizon effectif retenu (égal à `daysBefore` si ≥ 1 institut correspond, sinon 1re date à offre stabilisée). */
  effectiveDaysBefore: number
  /** Indique si la date cible a dû être avancée faute de sondage à offre stabilisée à J−d (ex. primaires 2017). */
  usedStabilizedHorizon: boolean
  targetDate: string
  institutesUsed: number
  /** RMSE au 1er tour à l'horizon effectif (tous candidats testés inclus). */
  rmse: number
  /** RMSE après projection avec les cibles moyennes 2017–2022 (contrôle en échantillon). */
  projectedRmse: number
  /** RMSE hors échantillon après projection avec les cibles de concentration mesurées sur l'autre élection uniquement. */
  crossProjectedRmse: number
  /** Écart-type logit empirique entre l'horizon effectif et le scrutin (candidats ≥ 3 %). */
  empiricalLogitRms: number
  /** Variation nette du total gauche entre l'horizon effectif et le scrutin, tous candidats inclus (pts). */
  leftShiftPts: number
}

export interface CoverageBacktestYear {
  year: BacktestYear
  effectiveDaysBefore: number
  targetDate: string
  usedStabilizedHorizon: boolean
  sigmaLogit: number
  /** Nombre de candidats (résultat officiel ≥ 2 % et présents en campagne) évalués. */
  evaluatedCount: number
  /** Candidats dont le résultat officiel tombe dans [P10, P90] (base sondages bruts). */
  coveredRaw: number
  /** Candidats dont le résultat officiel tombe dans [P10, P90] (base projection croisée hors échantillon). */
  coveredCrossProjected: number
  /** Contrôle sur le 2nd tour (duel Macron – Le Pen) : le résultat officiel tombe-t-il dans [P10, P90] ? `null` en 2012 (2nd tour sans RN, exclu). */
  secondRoundCovered: boolean | null
  secondRoundP10: number | null
  secondRoundP90: number | null
  secondRoundActual: number | null
}

export interface SecondRoundBacktestYear {
  year: 2017 | 2022
  actualAntiRn: number
  /** Prédiction hors échantillon en utilisant uniquement les reports des législatives 2024 (ancre 100 %). */
  predLeg2024: number
  /** Prédiction hors échantillon en utilisant les reports présidentiels de l'autre scrutin (2022→2017, 2017→2022). */
  predCrossPresidential: number
  /** Prédiction avec l'ancre présidentielle 2022 (0 %) : hors échantillon sur 2017, contrôle interne sur 2022. */
  predPres2022: number
  /** Leave-one-out R2.4 sur les ancres : ancres restantes hors année évaluée (`['2022','2024']` ou `['2017','2024']`). */
  looAnchors: ('2022' | '2017' | '2024')[]
  /** Prédiction hors échantillon R2.4 au milieu logit des deux ancres restantes (ancre de l'année retirée). */
  predLooUncertainMidpoint: number
  /** Moyenne des sondages directs de 2nd tour à la même distance J−d (null si absent). */
  directPollsAtDistance: number | null
}

export interface Coherence2024Row {
  profileId: ProfileId
  label: string
  constituenciesCount: number
  /** Score réel agrégé du finaliste non-RN (% des exprimés du 2nd tour). */
  actualFinalistPct: number
  /** Score prédit par l'enquête Ipsos-Talan brute + nouveaux votants sur les voix T1 agrégées. */
  predictedFinalistPct: number
  /** Écart (prédit − réel, en points). */
  gapPts: number
  /** Abandon net réel agrégé (%). */
  actualNetDropout: number
}

export interface BacktestReport {
  daysBefore: number
  firstRoundEve: EveBacktestYear[]
  firstRoundCampaign: CampaignBacktestYear[]
  coverage80: CoverageBacktestYear[]
  secondRoundPresidential: SecondRoundBacktestYear[]
  legislatives2024Coherence: Coherence2024Row[]
}

const LEFT_IDS = new Set([
  'arthaud',
  'poutou',
  'roussel',
  'melenchon',
  'hamon',
  'hidalgo',
  'jadot',
  'montebourg',
  'taubira',
  'valls',
  'duflot',
  'hollande',
  'peillon',
  'pinel',
  'joly',
])

const RIGHT_IDS = new Set(['fillon', 'pecresse', 'lassalle', 'bertrand', 'juppe', 'sarkozy'])
const ED_IDS = new Set(['lepen', 'zemmour', 'dupont-aignan', 'asselineau', 'philippot'])

const COVERAGE_MC_ITERATIONS = 600
const COVERAGE_MC_SEED = 2027

function actualScores(ref: PastElectionReference): Record<string, number> {
  return Object.fromEntries(ref.candidates.map((c) => [c.id, (100 * c.votes) / ref.expressed]))
}

function evePollAverage(ref: PastElectionReference): Record<string, number> {
  return normalize(
    weightedMeanByKey(
      ref.polls.map((p) => ({
        scores: normalize(p.scores),
        weight: pollWeight(p, ref.electionDate),
      })),
    ),
  )
}

function rmse(actual: Record<string, number>, predicted: Record<string, number>): number {
  const ids = Object.keys(actual)
  if (ids.length === 0) return 0
  const sq = ids.reduce((s, id) => s + ((predicted[id] ?? 0) - actual[id]!) ** 2, 0)
  return Math.sqrt(sq / ids.length)
}

function maxError(actual: Record<string, number>, predicted: Record<string, number>): number {
  return Math.max(...Object.keys(actual).map((id) => Math.abs((predicted[id] ?? 0) - actual[id]!)))
}

function logit(p: number): number {
  const c = Math.max(1e-4, Math.min(1 - 1e-4, p))
  return Math.log(c / (1 - c))
}

export function historicalBloc(id: string): Bloc {
  if (LEFT_IDS.has(id)) return 'gauche'
  if (ED_IDS.has(id)) return 'extreme_droite'
  if (RIGHT_IDS.has(id)) return 'droite'
  return 'centre'
}

/**
 * Part du candidat de tête de chaque bloc dans les résultats officiels d'une élection de référence.
 * Permet un test croisé strictement hors échantillon des cibles de concentration du vote utile.
 */
function observedBlocTargets(ref: PastElectionReference): Partial<Record<Bloc, number>> {
  const actual = actualScores(ref)
  const out: Partial<Record<Bloc, number>> = {}
  for (const bloc of BLOCS) {
    const scores = Object.entries(actual)
      .filter(([id]) => historicalBloc(id) === bloc)
      .map(([, v]) => v)
    const total = scores.reduce((s, v) => s + v, 0)
    if (scores.length > 0 && total > 0) {
      out[bloc] = Math.max(...scores) / total
    }
  }
  return out
}

/** Cibles de concentration moyennes mesurées sur les autres élections (leave-one-out). */
function pooledBlocTargets(others: PastElectionReference[]): Partial<Record<Bloc, number>> {
  const all = others.map(observedBlocTargets)
  const out: Partial<Record<Bloc, number>> = {}
  for (const bloc of BLOCS) {
    const vals = all.map((t) => t[bloc]).filter((v): v is number => v !== undefined)
    if (vals.length > 0) out[bloc] = vals.reduce((a, v) => a + v, 0) / vals.length
  }
  return out
}

const historicalCandidatesMap = (ref: PastElectionReference, extraIds: Iterable<string> = []): Map<string, Candidate> => {
  const map = new Map<string, Candidate>()
  for (const c of ref.candidates) {
    map.set(c.id, {
      id: c.id,
      name: c.name,
      shortName: c.name,
      party: '',
      bloc: historicalBloc(c.id),
      color: '#000000',
      colorDark: '#ffffff',
      duelProfile: c.id === 'macron' ? 'ensemble_rn' : null,
      isRN: c.id === 'lepen',
    })
  }
  for (const id of extraIds) {
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: id,
        shortName: id,
        party: '',
        bloc: historicalBloc(id),
        color: '#000000',
        colorDark: '#ffffff',
        duelProfile: id === 'macron' ? 'ensemble_rn' : null,
        isRN: id === 'lepen',
      })
    }
  }
  return map
}

function buildProfileTable(ensembleRows: Record<Bloc, TransferValues>): ProfileTable {
  const rows: Record<Bloc, TransferValues> = {
    gauche: ensembleRows.gauche,
    centre: ensembleRows.centre,
    droite: ensembleRows.droite,
    extreme_droite: ensembleRows.extreme_droite,
  }
  return {
    lfi_rn: rows,
    ecolo_ps_pcf_rn: rows,
    ensemble_rn: rows,
    lr_rn: rows,
  }
}

function evaluatePresidentialT2(
  ref: PastElectionReference,
  data: SimulationData,
  ensembleRows: Record<Bloc, TransferValues>,
): number {
  const electorate = actualScores(ref)
  const candidatesById = historicalCandidatesMap(ref)
  const fidMacron = fidelityFor('macron', data.transfers, null)
  const fidLePen = fidelityFor('lepen', data.transfers, null)
  const sr = computeSecondRound({
    electorate,
    a: 'macron',
    b: 'lepen',
    duel: {
      kind: 'rn-sourced',
      challengerId: 'macron',
      rnId: 'lepen',
      profileWeights: [{ profileId: 'ensemble_rn', weight: 1 }],
    },
    profiles: buildProfileTable(ensembleRows),
    nonRnPresidential: data.transfers.nonRnPresidential,
    fidelityA: fidMacron,
    fidelityB: fidLePen,
    candidatesById,
    firstRoundTurnout: (100 * ref.voters) / ref.registered,
    blankNullShare: (ref.voters - ref.expressed) / ref.voters,
    abstainerMobilization: 0.225,
    abstainerAntiRnShare: null,
    secondRoundPolls: [],
  })
  return sr.pct.a
}

function neutralBacktestSettings(): Settings {
  return {
    excludedPolls: [],
    alliances: {},
    offerProjectionEnabled: true,
    projection: defaultProjectionSettings(),
    transferSource: 'legislatives2024',
    declaredWeight: 0.5,
    republicanFront: defaultRepublicanFront(),
    lfiLeftTransferRange: [...DEFAULT_LFI_LEFT_TRANSFER_RANGE],
    candidacyUncertaintyEnabled: false,
    transferOverrides: {},
    minorTransfers: {},
    fidelity: null,
    firstRoundTurnout: 74,
    abstainerMobilization: 0.225,
    abstainerAntiRnShare: null,
    selectedDuel: null,
  }
}

/**
 * Validation historique automatisée sur 2017, 2022 et les 342 circonscriptions agrégées de 2024.
 * Distingue explicitement les évaluations hors échantillon (ratio croisé, cibles de l'autre élection,
 * présidentielle croisée, reports 2024 sur 2017/2022) des contrôles internes / de calibration historique
 * (cibles moyennes 2017–2022, ancre 2022 sur 2022, cohérence 2024, couverture 80 %).
 */
export function computeBacktest(
  data: SimulationData,
  pollsRef: { asOf: string; electionDate: string } = data.polls,
  options: { sigmaCampaignRef?: number } = {},
): BacktestReport {
  const daysBefore = Math.max(0, daysBetween(pollsRef.asOf, pollsRef.electionDate))
  const all = [
    { year: 2012 as const, ref: data.reference2012 as PastElectionReference },
    { year: 2017 as const, ref: data.reference2017 as PastElectionReference },
    { year: 2022 as const, ref: data.reference2022 as PastElectionReference },
  ]
  // Leave-one-out : chaque élection est évaluée avec les paramètres mesurés sur les deux autres.
  const refs = all.map(({ year, ref }) => ({ year, ref, others: all.filter((x) => x.year !== year).map((x) => x.ref) }))
  // Le 2nd tour 2012 (Hollande–Sarkozy, sans RN) est exclu du backtest du front républicain.
  const presidentialRefs = refs.filter((r) => r.year !== 2012) as {
    year: 2017 | 2022
    ref: PastElectionReference
    others: PastElectionReference[]
  }[]

  // 1. Sondages de la dernière semaine (2017 & 2022) : bruts vs correction par ratio croisée (hors échantillon)
  const firstRoundEve: EveBacktestYear[] = refs.map(({ year, ref, others }) => {
    const actual = actualScores(ref)
    const poll = evePollAverage(ref)
    const otherStats = others.map((o) => ({ actual: actualScores(o), poll: evePollAverage(o) }))
    const crossAdjusted = normalize(
      Object.fromEntries(
        Object.entries(poll).map(([id, score]) => {
          const factors = otherStats
            .filter((o) => o.actual[id] !== undefined && (o.poll[id] ?? 0) > 0)
            .map((o) => o.actual[id]! / o.poll[id]!)
          const factor = factors.length > 0 ? factors.reduce((a, v) => a + v, 0) / factors.length : 1
          return [id, score * factor]
        }),
      ),
    )
    return {
      year,
      pollCount: ref.polls.length,
      rawRmse: rmse(actual, poll),
      rawMaxError: maxError(actual, poll),
      crossCorrectedRmse: rmse(actual, crossAdjusted),
    }
  })

  // 2. Campagne 1er tour à J−d (ou 1re date à offre stabilisée ≥ 3 instituts si aucune vague stricte à J−d)
  //    + contrôle de couverture empirique des intervalles à 80 % (Monte-Carlo)
  const mcSettings = neutralBacktestSettings()
  const firstRoundCampaign: CampaignBacktestYear[] = []
  const coverage80: CoverageBacktestYear[] = []

  for (const { year, ref, others } of refs) {
    const requestedDate = addDays(ref.electionDate, -daysBefore)
    const actual = actualScores(ref)
    const allKnown = new Set([
      ...ref.candidates.map((c) => c.id),
      ...ref.campaignPolls.otherCandidates.map((c) => c.id),
    ])
    const runAvgAt = (dt: string) =>
      averageHypothesisPolls(
        ref.campaignPolls.polls,
        dt,
        ref.campaignPolls.windowDays,
        { require: ref.campaignPolls.require, exclude: ref.campaignPolls.exclude },
        allKnown,
        undefined,
        [],
        {},
        { weighted: true, offerProjection: false },
      )

    let targetDate = requestedDate
    let avg = runAvgAt(targetDate)
    let usedStabilizedHorizon = false

    // Si aucun sondage ne correspond au filtre strict à J−d (ex. primaires 2017 non tranchées en novembre 2016),
    // on avance à la première date disposant d'au moins 3 instituts distincts à offre stabilisée.
    if (avg.institutesUsed === 0) {
      const candidateDates = [
        ...new Set(
          ref.campaignPolls.polls
            .map((p) => p.fieldwork.end)
            .filter((d) => d >= requestedDate && d < ref.electionDate),
        ),
      ].sort()
      let fallbackDate: string | null = null
      let fallbackAvg = avg
      for (const dt of candidateDates) {
        const probe = runAvgAt(dt)
        if (probe.institutesUsed >= 3) {
          targetDate = dt
          avg = probe
          usedStabilizedHorizon = true
          break
        }
        if (probe.institutesUsed > fallbackAvg.institutesUsed) {
          fallbackDate = dt
          fallbackAvg = probe
        }
      }
      if (!usedStabilizedHorizon && fallbackDate !== null) {
        targetDate = fallbackDate
        avg = fallbackAvg
        usedStabilizedHorizon = true
      }
    }

    const effectiveDaysBefore = Math.max(0, daysBetween(targetDate, ref.electionDate))
    const logitDiffs = ref.candidates
      .filter((c) => actual[c.id]! >= 3 && (avg.average[c.id] ?? 0) >= 3)
      .map((c) => logit(actual[c.id]! / 100) - logit((avg.average[c.id] ?? 0) / 100))
    const empiricalLogitRms =
      logitDiffs.length > 0 ? Math.sqrt(logitDiffs.reduce((s, d) => s + d * d, 0) / logitDiffs.length) : 0
    const leftActual = Object.entries(actual)
      .filter(([id]) => LEFT_IDS.has(id))
      .reduce((s, [, v]) => s + v, 0)
    const leftAtHorizon = Object.entries(avg.average)
      .filter(([id]) => LEFT_IDS.has(id))
      .reduce((s, [, v]) => s + v, 0)

    const candMap = historicalCandidatesMap(ref, allKnown)
    const campaignCands = [...candMap.values()]
    const projSettings = { ...defaultProjectionSettings(), enabled: true, meanReversion: 0, dampedTrend: 0 }

    const projected =
      avg.institutesUsed > 0
        ? projectCampaign(avg.average, campaignCands, projSettings, [], targetDate, ref.electionDate).projectedScores
        : avg.average

    const crossTargets = pooledBlocTargets(others)
    const crossProjected =
      avg.institutesUsed > 0
        ? projectCampaign(avg.average, campaignCands, projSettings, [], targetDate, ref.electionDate, 1, crossTargets)
            .projectedScores
        : avg.average

    firstRoundCampaign.push({
      year,
      daysBefore,
      effectiveDaysBefore,
      usedStabilizedHorizon,
      targetDate,
      institutesUsed: avg.institutesUsed,
      rmse: avg.institutesUsed > 0 ? rmse(actual, avg.average) : 0,
      projectedRmse: avg.institutesUsed > 0 ? rmse(actual, projected) : 0,
      crossProjectedRmse: avg.institutesUsed > 0 ? rmse(actual, crossProjected) : 0,
      empiricalLogitRms,
      leftShiftPts: avg.institutesUsed > 0 ? leftActual - leftAtHorizon : 0,
    })

    // Couverture empirique des intervalles Monte-Carlo à 80 % ([P10, P90])
    const sr2 = year === 2022 ? data.reference2022.secondRound : year === 2017 ? data.reference2017.secondRound : null
    const actualAntiRn =
      sr2 === null ? null : (100 * sr2.candidates.find((c) => c.id === 'macron')!.votes) / sr2.expressed
    const duel: [string, string] = year === 2012 ? ['hollande', 'sarkozy'] : ['macron', 'lepen']

    if (avg.institutesUsed > 0) {
      const bnShare = (ref.voters - ref.expressed) / ref.voters
      const mcRaw = runMonteCarlo({
        data,
        settings: mcSettings,
        baseScores: avg.average,
        candidatesById: candMap,
        minorTransfers: {},
        blankNullShare: bnShare,
        displayedDuel: duel,
        sigmaCampaignRefOverride: options.sigmaCampaignRef,
        asOfOverride: targetDate,
        electionDateOverride: ref.electionDate,
        iterations: COVERAGE_MC_ITERATIONS,
        seed: COVERAGE_MC_SEED,
      })
      const mcCross = runMonteCarlo({
        data,
        settings: mcSettings,
        baseScores: crossProjected,
        candidatesById: candMap,
        minorTransfers: {},
        blankNullShare: bnShare,
        displayedDuel: duel,
        sigmaCampaignRefOverride: options.sigmaCampaignRef,
        asOfOverride: targetDate,
        electionDateOverride: ref.electionDate,
        iterations: COVERAGE_MC_ITERATIONS,
        seed: COVERAGE_MC_SEED,
      })
      const evaluated = ref.candidates.filter((c) => actual[c.id]! >= 2 && avg.average[c.id] !== undefined)
      const coveredRaw = evaluated.filter((c) => {
        const u = mcRaw.candidates[c.id]
        const act = actual[c.id]!
        return u !== undefined && act >= u.p10 && act <= u.p90
      }).length
      const coveredCrossProjected = evaluated.filter((c) => {
        const u = mcCross.candidates[c.id]
        const act = actual[c.id]!
        return u !== undefined && act >= u.p10 && act <= u.p90
      }).length
      const srP10 = mcRaw.displayedDuel.aScoreP10
      const srP90 = mcRaw.displayedDuel.aScoreP90
      coverage80.push({
        year,
        effectiveDaysBefore,
        targetDate,
        usedStabilizedHorizon,
        sigmaLogit: mcRaw.sigmaLogit,
        evaluatedCount: evaluated.length,
        coveredRaw,
        coveredCrossProjected,
        secondRoundCovered: actualAntiRn === null ? null : actualAntiRn >= srP10 && actualAntiRn <= srP90,
        secondRoundP10: actualAntiRn === null ? null : srP10,
        secondRoundP90: actualAntiRn === null ? null : srP90,
        secondRoundActual: actualAntiRn,
      })
    }
  }

  // 3. Second tour présidentiel 2017 & 2022 (en connaissant le 1er tour réel)
  const leg2024Ensemble = data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const pres2022Rows = Object.fromEntries(
    BLOCS.map((b) => [
      b,
      b === 'extreme_droite'
        ? data.transfers.presidentialCenterRn.elections['2022'].extreme_droite
        : applyRepublicanFrontRow('ensemble_rn', b, leg2024Ensemble[b], data.transfers, 0),
    ]),
  ) as Record<Bloc, TransferValues>
  const gaps = pollBiasGaps(data.secondRoundPollBias, pollsRef)
  const secondRoundPresidential: SecondRoundBacktestYear[] = presidentialRefs.map(({ year, ref }) => {
    const sr2 = year === 2022 ? data.reference2022.secondRound : data.reference2017.secondRound
    const actualAntiRn = (100 * sr2.candidates.find((c) => c.id === 'macron')!.votes) / sr2.expressed
    const otherPres = data.transfers.presidentialCenterRn.elections[year === 2017 ? '2022' : '2017']
    const looAnchors: ('2022' | '2017' | '2024')[] = year === 2017 ? ['2022', '2024'] : ['2017', '2024']
    // Leave-one-out R2.4 : milieu logit entre les deux ancres restantes (sans l'ancre de l'élection évaluée)
    const looMidRows: Record<Bloc, TransferValues> = Object.fromEntries(
      BLOCS.map((b) => {
        if (b === 'gauche' || b === 'droite') {
          const { df, dr } = logitDelta(otherPres[b], leg2024Ensemble[b])
          return [b, shiftTransferLogit(otherPres[b], df * 0.5, dr * 0.5)]
        }
        return [b, leg2024Ensemble[b]]
      }),
    ) as Record<Bloc, TransferValues>
    return {
      year,
      actualAntiRn,
      predLeg2024: evaluatePresidentialT2(ref, data, leg2024Ensemble),
      predCrossPresidential: evaluatePresidentialT2(ref, data, otherPres),
      predPres2022: evaluatePresidentialT2(ref, data, pres2022Rows),
      looAnchors,
      predLooUncertainMidpoint: evaluatePresidentialT2(ref, data, looMidRows),
      directPollsAtDistance: gaps.find((g) => g.year === year)?.estimate ?? null,
    }
  })

  // 4. Contrôle de cohérence agrégé sur les 342 duels des législatives 2024 (en échantillon)
  const fidDefault = data.transfers.fidelity.default
  const fidRn = fidelityFor('lepen', data.transfers, null)
  const legTurnout2024 = 66.7
  const legBnShare2024 =
    (data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound -
      data.secondRoundDropout.newVoters.legislatives2024.expressedFirstRound) /
    data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound

  const legislatives2024Coherence: Coherence2024Row[] = data.transfers.profiles.map((profile) => {
    const agg = data.secondRoundDropout.legislatives2024.profiles[profile.id]
    const total1 = Object.values(agg.firstRoundVotesByBloc).reduce((s, v) => s + v, 0)
    const finalistBloc = agg.finalistBlocs.find((b) => b !== 'extreme_droite')!
    const electorate: Record<string, number> = Object.fromEntries(
      Object.entries(agg.firstRoundVotesByBloc).map(([b, v]) => [b, total1 > 0 ? (100 * v) / total1 : 0]),
    )
    const syntheticCandidates = new Map<string, Candidate>(
      (['gauche', 'centre', 'droite', 'extreme_droite'] as const).map((b) => [
        b,
        {
          id: b,
          name: b,
          shortName: b,
          party: '',
          bloc: b,
          color: '#000000',
          colorDark: '#ffffff',
          duelProfile: b === finalistBloc ? profile.id : null,
          isRN: b === 'extreme_droite',
        },
      ]),
    )
    const table: ProfileTable = {
      lfi_rn: profile.rows,
      ecolo_ps_pcf_rn: profile.rows,
      ensemble_rn: profile.rows,
      lr_rn: profile.rows,
    }
    const pred = computeSecondRound({
      electorate,
      a: finalistBloc,
      b: 'extreme_droite',
      duel: {
        kind: 'rn-sourced',
        challengerId: finalistBloc,
        rnId: 'extreme_droite',
        profileWeights: [{ profileId: profile.id, weight: 1 }],
      },
      profiles: table,
      nonRnPresidential: data.transfers.nonRnPresidential,
      fidelityA: fidDefault,
      fidelityB: fidRn,
      candidatesById: syntheticCandidates,
      firstRoundTurnout: legTurnout2024,
      blankNullShare: legBnShare2024,
      abstainerMobilization: 0.225,
      abstainerAntiRnShare: null,
      secondRoundPolls: [],
    })
    const actualFinalistPct = (100 * agg.secondRoundVotes.finalist) / agg.secondRoundExpressed
    return {
      profileId: profile.id,
      label: agg.label,
      constituenciesCount: agg.constituenciesCount,
      actualFinalistPct,
      predictedFinalistPct: pred.pct.a,
      gapPts: pred.pct.a - actualFinalistPct,
      actualNetDropout: aggregatedProfileDropout(agg),
    }
  })

  return {
    daysBefore,
    firstRoundEve,
    firstRoundCampaign,
    coverage80,
    secondRoundPresidential,
    legislatives2024Coherence,
  }
}

/** Une date d'évaluation du calage de σ : entrées du Monte-Carlo et candidats à scorer. */
export interface SigmaCalibrationCase {
  year: CalibrationYear
  daysBefore: number
  date: string
  electionDate: string
  institutesUsed: number
  /** Prévision par défaut : projection de campagne activée, cibles recalculées hors échantillon (leave-one-out). */
  crossProjectedScores: Record<string, number>
  /** Contrôle : moyenne brute des sondages, sans projection. */
  rawScores: Record<string, number>
  candidatesById: Map<string, Candidate>
  blankNullShare: number
  /** Résultat officiel (% des exprimés) des candidats évalués : ≥ 2 % et présents dans la moyenne. */
  evaluated: Record<string, number>
}

/**
 * Dates d'évaluation du calage de σ (amendement du 23/11/2026 à la règle 3) : pour chaque élection, J−150 à J−24
 * tous les 14 jours, en ne gardant que les dates où la moyenne stricte (fenêtre, offre `require`/`exclude`,
 * sans projection d'offre) compte au moins un institut. Aucun repli sur une « offre stabilisée » : une date sans
 * moyenne calculable est écartée et listée dans `skipped`.
 */
export function buildSigmaCalibrationCases(data: SimulationData): {
  cases: SigmaCalibrationCase[]
  skipped: { year: CalibrationYear; daysBefore: number; date: string }[]
} {
  const all = [
    { year: 2012 as const, ref: data.reference2012 as PastElectionReference },
    { year: 2017 as const, ref: data.reference2017 as PastElectionReference },
    { year: 2022 as const, ref: data.reference2022 as PastElectionReference },
  ]
  const cases: SigmaCalibrationCase[] = []
  const skipped: { year: CalibrationYear; daysBefore: number; date: string }[] = []
  for (const { year, ref } of all) {
    const others = all.filter((x) => x.year !== year).map((x) => x.ref)
    const actual = actualScores(ref)
    const allKnown = new Set([
      ...ref.candidates.map((c) => c.id),
      ...ref.campaignPolls.otherCandidates.map((c) => c.id),
    ])
    const candMap = historicalCandidatesMap(ref, allKnown)
    const campaignCands = [...candMap.values()]
    const crossTargets = pooledBlocTargets(others)
    const projSettings = { ...defaultProjectionSettings(), enabled: true, meanReversion: 0, dampedTrend: 0 }
    for (const { daysBefore, date } of calibrationDates(ref.electionDate)) {
      const avg = averageHypothesisPolls(
        ref.campaignPolls.polls,
        date,
        ref.campaignPolls.windowDays,
        { require: ref.campaignPolls.require, exclude: ref.campaignPolls.exclude },
        allKnown,
        undefined,
        [],
        {},
        { weighted: true, offerProjection: false },
      )
      if (avg.institutesUsed === 0) {
        skipped.push({ year, daysBefore, date })
        continue
      }
      const crossProjected = projectCampaign(
        avg.average,
        campaignCands,
        projSettings,
        [],
        date,
        ref.electionDate,
        1,
        crossTargets,
      ).projectedScores
      const evaluated = Object.fromEntries(
        ref.candidates.filter((c) => actual[c.id]! >= 2 && avg.average[c.id] !== undefined).map((c) => [c.id, actual[c.id]!]),
      )
      cases.push({
        year,
        daysBefore,
        date,
        electionDate: ref.electionDate,
        institutesUsed: avg.institutesUsed,
        crossProjectedScores: crossProjected,
        rawScores: avg.average,
        candidatesById: candMap,
        blankNullShare: (ref.voters - ref.expressed) / ref.voters,
        evaluated,
      })
    }
  }
  return { cases, skipped }
}

/** Entrées Monte-Carlo d'une date de calage (mêmes réglages neutres que le contrôle de couverture existant). */
export function sigmaCalibrationMcInput(
  data: SimulationData,
  c: SigmaCalibrationCase,
  baseScores: Record<string, number>,
  sigma: number,
  iterations: number,
  seed: number,
): MonteCarloInput {
  return {
    data,
    settings: neutralBacktestSettings(),
    baseScores,
    candidatesById: c.candidatesById,
    minorTransfers: {},
    blankNullShare: c.blankNullShare,
    displayedDuel: c.year === 2012 ? ['hollande', 'sarkozy'] : ['macron', 'lepen'],
    sigmaCampaignRefOverride: sigma,
    asOfOverride: c.date,
    electionDateOverride: c.electionDate,
    iterations,
    seed,
    returnSamples: true,
    firstRoundOnly: true,
  }
}

export type UsefulVoteVariant = 'A' | 'B' | 'C'

export interface UsefulVoteVariantYear {
  year: BacktestYear
  targetDate: string
  /** Candidat de tête de chaque bloc à la date (variante A) et dans les résultats officiels. */
  leadersAtDate: Partial<Record<Bloc, string>>
  leadersActual: Partial<Record<Bloc, string>>
  /** Part des tirages (variante B) où le leader du bloc diffère du leader à la date. */
  leaderChangeRate: Partial<Record<Bloc, number>>
  /** RMSE (cibles croisées leave-one-out) par variante ; `raw` = moyenne brute sans projection. */
  rmse: Record<UsefulVoteVariant | 'raw', number>
}

const VARIANT_DRAWS = 400

function leadersOf(scores: Record<string, number>, byId: Map<string, Candidate>): Partial<Record<Bloc, string>> {
  const out: Partial<Record<Bloc, string>> = {}
  for (const [id, v] of Object.entries(scores)) {
    const b = byId.get(id)?.bloc
    if (!b) continue
    const cur = out[b]
    if (cur === undefined || v > (scores[cur] ?? 0)) out[b] = id
  }
  return out
}

/**
 * Compare trois façons de désigner le bénéficiaire du vote utile (T3b v2.2) sur 2012, 2017 et 2022 :
 * A = leader de la moyenne à la date ; B = leader recalculé à chaque tirage logit (σ du backtest) puis
 * projections moyennées ; C = leader de la dernière vague (fenêtre de 7 jours). Cibles croisées leave-one-out.
 */
export function computeUsefulVoteVariants(
  data: SimulationData,
  pollsRef: { asOf: string; electionDate: string } = data.polls,
): UsefulVoteVariantYear[] {
  const report = computeBacktest(data, pollsRef)
  const all = [data.reference2012, data.reference2017, data.reference2022] as PastElectionReference[]
  const years = [2012, 2017, 2022] as const
  return years.map((year, i) => {
    const ref = all[i]!
    const others = all.filter((_, j) => j !== i)
    const camp = report.firstRoundCampaign.find((c) => c.year === year)!
    const cov = report.coverage80.find((c) => c.year === year)!
    const actual = actualScores(ref)
    const allKnown = new Set([...ref.candidates.map((c) => c.id), ...ref.campaignPolls.otherCandidates.map((c) => c.id)])
    const avgAt = (dt: string, win: number) =>
      averageHypothesisPolls(ref.campaignPolls.polls, dt, win, { require: ref.campaignPolls.require, exclude: ref.campaignPolls.exclude }, allKnown, undefined, [], {}, { weighted: true, offerProjection: false })
    const avg = avgAt(camp.targetDate, ref.campaignPolls.windowDays)
    const last = avgAt(camp.targetDate, 7)
    const byId = historicalCandidatesMap(ref, allKnown)
    const cands = [...byId.values()]
    const targets = pooledBlocTargets(others)
    const base = { ...defaultProjectionSettings(), enabled: true, meanReversion: 0, dampedTrend: 0 }
    const project = (scores: Record<string, number>, lead?: Partial<Record<Bloc, string>>) => {
      const s = { ...base, usefulVote: { ...base.usefulVote } }
      if (lead) for (const b of BLOCS) if (lead[b]) s.usefulVote[b] = { intensity: 1, beneficiary: lead[b]! }
      return projectCampaign(scores, cands, s, [], camp.targetDate, ref.electionDate, 1, targets).projectedScores
    }
    const leadersAtDate = leadersOf(avg.average, byId)
    const A = project(avg.average)
    const C = last.institutesUsed > 0 ? project(avg.average, leadersOf(last.average, byId)) : A
    // B : tirages logit gaussiens déterministes (graine fixe) autour de la moyenne
    let seed = 2027 + year
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return (seed + 0.5) / 4294967296
    }
    const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())
    const sd = cov.sigmaLogit
    const sum: Record<string, number> = {}
    const changes: Partial<Record<Bloc, number>> = {}
    for (let d = 0; d < VARIANT_DRAWS; d++) {
      const shocked = normalize(
        Object.fromEntries(
          Object.entries(avg.average).map(([id, v]) => {
            const l = logit(v / 100) + sd * gauss()
            return [id, (100 * 1) / (1 + Math.exp(-l))]
          }),
        ),
      )
      const lead = leadersOf(shocked, byId)
      for (const b of BLOCS) if (lead[b] !== leadersAtDate[b]) changes[b] = (changes[b] ?? 0) + 1 / VARIANT_DRAWS
      const p = project(shocked, lead)
      for (const [id, v] of Object.entries(p)) sum[id] = (sum[id] ?? 0) + v / VARIANT_DRAWS
    }
    const B = normalize(sum)
    return {
      year,
      targetDate: camp.targetDate,
      leadersAtDate,
      leadersActual: leadersOf(actual, byId),
      leaderChangeRate: changes,
      rmse: { raw: rmse(actual, avg.average), A: rmse(actual, A), B: rmse(actual, B), C: rmse(actual, C) },
    }
  })
}
