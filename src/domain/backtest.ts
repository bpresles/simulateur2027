import { defaultProjectionSettings, projectCampaign } from './campaignProjection'
import { runMonteCarlo } from './monteCarlo'
import { addDays, averageHypothesisPolls, daysBetween, normalize, pollWeight, weightedMeanByKey } from './pollAverage'
import { aggregatedProfileDropout, computeSecondRound, pollBiasGaps } from './secondRound'
import {
  DEFAULT_LFI_LEFT_TRANSFER,
  DEFAULT_LFI_LEFT_TRANSFER_RANGE,
  applyRepublicanFrontRow,
  defaultRepublicanFront,
  effectiveAbstainerAntiRnShare,
  fidelityFor,
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

export interface EveBacktestYear {
  year: 2017 | 2022
  pollCount: number
  /** RMSE des sondages bruts de la dernière semaine (pondérés fraîcheur/échantillon), en pts. */
  rawRmse: number
  /** Plus grand écart absolu d'un candidat sur la moyenne brute (pts). */
  rawMaxError: number
  /** RMSE hors échantillon avec correction par ratio issue de l'autre élection (candidats communs). */
  crossCorrectedRmse: number
}

export interface CampaignBacktestYear {
  year: 2017 | 2022
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
  year: 2017 | 2022
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
  /** Contrôle sur le 2nd tour (duel Macron – Le Pen) : le résultat officiel tombe-t-il dans [P10, P90] ? */
  secondRoundCovered: boolean
  secondRoundP10: number
  secondRoundP90: number
  secondRoundActual: number
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

function historicalBloc(id: string): Bloc {
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

function buildProfileTable(ensembleRows: Record<Bloc, TransferValues>, rnLoyalty: number): ProfileTable {
  const rnRow: TransferValues = { finalist: 0, rn: rnLoyalty, abstention: 100 - rnLoyalty }
  const rows: Record<Bloc, TransferValues> = {
    gauche: ensembleRows.gauche,
    centre: ensembleRows.centre,
    droite: ensembleRows.droite,
    extreme_droite: rnRow,
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
  abstainerAntiRnShare = 0.55,
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
    profiles: buildProfileTable(ensembleRows, fidLePen.loyal),
    nonRnPresidential: data.transfers.nonRnPresidential,
    fidelityA: fidMacron,
    fidelityB: fidLePen,
    candidatesById,
    firstRoundTurnout: (100 * ref.voters) / ref.registered,
    blankNullShare: (ref.voters - ref.expressed) / ref.voters,
    abstainerMobilization: 0.2,
    abstainerAntiRnShare,
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
    lfiLeftTransfer: DEFAULT_LFI_LEFT_TRANSFER,
    lfiLeftTransferRange: [...DEFAULT_LFI_LEFT_TRANSFER_RANGE],
    candidacyUncertaintyEnabled: false,
    transferOverrides: {},
    minorTransfers: {},
    fidelity: null,
    firstRoundTurnout: 74,
    abstainerMobilization: 0.2,
    abstainerAntiRnShare: 0.55,
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
): BacktestReport {
  const daysBefore = Math.max(0, daysBetween(pollsRef.asOf, pollsRef.electionDate))
  const refs = [
    { year: 2017 as const, ref: data.reference2017, other: data.reference2022 },
    { year: 2022 as const, ref: data.reference2022, other: data.reference2017 },
  ]

  // 1. Sondages de la dernière semaine (2017 & 2022) : bruts vs correction par ratio croisée (hors échantillon)
  const firstRoundEve: EveBacktestYear[] = refs.map(({ year, ref, other }) => {
    const actual = actualScores(ref)
    const poll = evePollAverage(ref)
    const otherActual = actualScores(other)
    const otherPoll = evePollAverage(other)
    const crossAdjusted = normalize(
      Object.fromEntries(
        Object.entries(poll).map(([id, score]) => {
          const factor =
            otherActual[id] !== undefined && (otherPoll[id] ?? 0) > 0 ? otherActual[id]! / otherPoll[id]! : 1
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

  for (const { year, ref, other } of refs) {
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

    const crossTargets = observedBlocTargets(other)
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
    const biasEntry = data.secondRoundPollBias.elections.find((e) => e.year === year)
    const actualAntiRn =
      year === 2022
        ? (100 * data.reference2022.secondRound.candidates.find((c) => c.id === 'macron')!.votes) /
          data.reference2022.secondRound.expressed
        : (biasEntry?.result.antiRn ?? 66.1)

    if (avg.institutesUsed > 0) {
      const bnShare = (ref.voters - ref.expressed) / ref.voters
      const mcRaw = runMonteCarlo({
        data,
        settings: mcSettings,
        baseScores: avg.average,
        candidatesById: candMap,
        minorTransfers: {},
        blankNullShare: bnShare,
        displayedDuel: ['macron', 'lepen'],
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
        displayedDuel: ['macron', 'lepen'],
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
        secondRoundCovered: actualAntiRn >= srP10 && actualAntiRn <= srP90,
        secondRoundP10: srP10,
        secondRoundP90: srP90,
        secondRoundActual: actualAntiRn,
      })
    }
  }

  // 3. Second tour présidentiel 2017 & 2022 (en connaissant le 1er tour réel)
  const leg2024Ensemble = data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const pres2022Rows = Object.fromEntries(
    BLOCS.map((b) => [b, applyRepublicanFrontRow('ensemble_rn', b, leg2024Ensemble[b], data.transfers, 0)]),
  ) as Record<Bloc, TransferValues>
  const gaps = pollBiasGaps(data.secondRoundPollBias, pollsRef)
  const secondRoundPresidential: SecondRoundBacktestYear[] = refs.map(({ year, ref }) => {
    const biasEntry = data.secondRoundPollBias.elections.find((e) => e.year === year)
    const actualAntiRn =
      year === 2022
        ? (100 * data.reference2022.secondRound.candidates.find((c) => c.id === 'macron')!.votes) /
          data.reference2022.secondRound.expressed
        : (biasEntry?.result.antiRn ?? 66.1)
    const otherPres = data.transfers.presidentialCenterRn.elections[year === 2017 ? '2022' : '2017']
    const antiRnQ = effectiveAbstainerAntiRnShare(0.55, 0)
    return {
      year,
      actualAntiRn,
      predLeg2024: evaluatePresidentialT2(ref, data, leg2024Ensemble, antiRnQ),
      predCrossPresidential: evaluatePresidentialT2(ref, data, otherPres, antiRnQ),
      predPres2022: evaluatePresidentialT2(ref, data, pres2022Rows, antiRnQ),
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
      abstainerMobilization: 0.2,
      abstainerAntiRnShare: 0.55,
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
