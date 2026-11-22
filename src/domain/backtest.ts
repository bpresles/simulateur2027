import { defaultProjectionSettings, projectCampaign } from './campaignProjection'
import { addDays, averageHypothesisPolls, daysBetween, normalize, pollWeight, weightedMeanByKey } from './pollAverage'
import { aggregatedProfileDropout, computeSecondRound, pollBiasGaps } from './secondRound'
import { applyRepublicanFrontRow, effectiveAbstainerAntiRnShare, fidelityFor } from './transfers'
import type { ProfileTable } from './transfers'
import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  PastElectionReference,
  ProfileId,
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
  /** RMSE avec correction par ratio issue de l'autre élection (validation croisée sur candidats communs). */
  crossCorrectedRmse: number
}

export interface CampaignBacktestYear {
  year: 2017 | 2022
  daysBefore: number
  targetDate: string
  institutesUsed: number
  /** RMSE au 1er tour à J−d (avec tous les candidats testés à l'époque, sans ré-échelonnage biaisé). */
  rmse: number
  /** RMSE à J−d après projection temporelle (vote utile 4 blocs + léger amortissement, hors échantillon). */
  projectedRmse: number
  /** Écart-type logit empirique entre J−d et le scrutin (candidats ≥ 3 %). */
  empiricalLogitRms: number
  /** Variation nette du total gauche entre J−d et le scrutin, tous candidats inclus (pts). */
  leftShiftPts: number
}

export interface SecondRoundBacktestYear {
  year: 2017 | 2022
  actualAntiRn: number
  /** Prédiction en utilisant uniquement les reports des législatives 2024. */
  predLeg2024: number
  /** Prédiction hors-échantillon en utilisant les reports présidentiels de l'autre scrutin (2022→2017, 2017→2022). */
  predCrossPresidential: number
  /** Prédiction du modèle front républicain au repère de l'année (100 % en 2017, 75 % en 2022). */
  predRepublicanFront: number
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

const dummyCandidates = (ref: PastElectionReference): Map<string, Candidate> =>
  new Map(
    ref.candidates.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        shortName: c.name,
        party: '',
        bloc: historicalBloc(c.id),
        color: '#000000',
        colorDark: '#ffffff',
        duelProfile: c.id === 'macron' ? 'ensemble_rn' : null,
        isRN: c.id === 'lepen',
      },
    ]),
  )

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
  const candidatesById = dummyCandidates(ref)
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

/**
 * Validation historique automatisée (out-of-sample) sur 2017, 2022 et les 342 circonscriptions agrégées
 * de 2024. Aucun paramètre du modèle n'est recalibré sur ce backtest : il sert à vérifier honnêtement les
 * marges d'erreur réelles et à documenter les choix méthodologiques.
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

  // 1. Sondages de la dernière semaine (2017 & 2022) : bruts vs correction par ratio croisée
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

  // 2. Campagne 1er tour à la même distance J−d (tous candidats inclus : pas de biais d'omission)
  const firstRoundCampaign: CampaignBacktestYear[] = refs.map(({ year, ref }) => {
    const targetDate = addDays(ref.electionDate, -daysBefore)
    const actual = actualScores(ref)
    const allKnown = new Set([
      ...ref.candidates.map((c) => c.id),
      ...ref.campaignPolls.otherCandidates.map((c) => c.id),
    ])
    const avg = averageHypothesisPolls(
      ref.campaignPolls.polls,
      targetDate,
      ref.campaignPolls.windowDays,
      { require: ref.campaignPolls.require, exclude: ref.campaignPolls.exclude },
      allKnown,
      undefined,
      [],
      {},
      { weighted: true, offerProjection: false },
    )
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
    const campaignCands: Candidate[] = [...allKnown].map((id) => ({
      id,
      name: id,
      shortName: id,
      party: '',
      bloc: historicalBloc(id),
      color: '#000000',
      colorDark: '#ffffff',
      duelProfile: null,
    }))
    const projected =
      avg.institutesUsed > 0
        ? projectCampaign(
            avg.average,
            campaignCands,
            { ...defaultProjectionSettings(), enabled: true, dampedTrend: 0 },
            [],
            targetDate,
            ref.electionDate,
          ).projectedScores
        : avg.average
    return {
      year,
      daysBefore,
      targetDate,
      institutesUsed: avg.institutesUsed,
      rmse: avg.institutesUsed > 0 ? rmse(actual, avg.average) : 0,
      projectedRmse: avg.institutesUsed > 0 ? rmse(actual, projected) : 0,
      empiricalLogitRms,
      leftShiftPts: avg.institutesUsed > 0 ? leftActual - leftAtHorizon : 0,
    }
  })

  // 3. Second tour présidentiel 2017 & 2022 (en connaissant le 1er tour réel)
  const leg2024Ensemble = data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const gaps = pollBiasGaps(data.secondRoundPollBias, pollsRef)
  const secondRoundPresidential: SecondRoundBacktestYear[] = refs.map(({ year, ref }) => {
    const biasEntry = data.secondRoundPollBias.elections.find((e) => e.year === year)
    const actualAntiRn =
      year === 2022
        ? (100 * data.reference2022.secondRound.candidates.find((c) => c.id === 'macron')!.votes) /
          data.reference2022.secondRound.expressed
        : (biasEntry?.result.antiRn ?? 66.1)
    const otherPres = data.transfers.presidentialCenterRn.elections[year === 2017 ? '2022' : '2017']
    const yearFrontStrength = year === 2017 ? 1 : 0.75
    const rfRows = Object.fromEntries(
      BLOCS.map((b) => [
        b,
        applyRepublicanFrontRow('ensemble_rn', b, leg2024Ensemble[b], data.transfers, yearFrontStrength),
      ]),
    ) as Record<Bloc, TransferValues>
    return {
      year,
      actualAntiRn,
      predLeg2024: evaluatePresidentialT2(ref, data, leg2024Ensemble),
      predCrossPresidential: evaluatePresidentialT2(ref, data, otherPres),
      predRepublicanFront: evaluatePresidentialT2(
        ref,
        data,
        rfRows,
        effectiveAbstainerAntiRnShare(0.55, yearFrontStrength),
      ),
      directPollsAtDistance: gaps.find((g) => g.year === year)?.estimate ?? null,
    }
  })

  // 4. Contrôle de cohérence agrégé sur les 342 duels des législatives 2024
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
    secondRoundPresidential,
    legislatives2024Coherence,
  }
}
