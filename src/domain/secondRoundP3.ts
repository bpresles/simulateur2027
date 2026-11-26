// Audit P3 : décomposition de variance du 2nd tour, contrôle de double emploi et calage conditionnel
// de σ_η sur grille [0 ; 5] (pas 0,25) en leave-one-out R2.4 avec finalistes mesurés R2.5.
// Aucun réglage du simulateur n'est modifié ici (évaluation en lecture seule avant validation).
import { computeBacktest } from './backtest'
import {
  CAMPAIGN_REF_DAYS,
  MONTE_CARLO_ITERATIONS,
  MONTE_CARLO_SEED,
  SIGMA_CAMPAIGN_REF,
  SIGMA_POLLING_FLOOR,
  mulberry32,
  runMonteCarlo,
} from './monteCarlo'
import { resolveReferenceRows } from './secondRoundReproduction'
import { crpsFromSamples } from './sigmaCalibration'
import { defaultSettings, simulate } from './simulate'
import {
  REPUBLICAN_FRONT_PRESETS,
  applyRepublicanFrontRow,
  fidelityFor,
  frontStrengthForBloc,
  interpolateExtremeDroite,
  lfiLeftTransferRow,
  logitDelta,
  nonRnSplit,
  resolveDuel,
  shiftTransferLogit,
} from './transfers'
import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  CandidateId,
  FidelitySplit,
  ProfileId,
  Reference2012,
  Reference2017,
  Reference2022,
  ReferencePart,
  SecondRoundReferenceMatricesData,
  Settings,
  SimulationData,
  TransferValues,
  TransfersData,
} from './types'

export const P3_SIGMA_ETA_GRID: readonly number[] = Array.from({ length: 21 }, (_, i) => Math.round(i * 25) / 100)
export const CURRENT_SIGMA_ETA_RN = 3.0
export const CURRENT_SIGMA_ETA_NON_RN = 2.0
const DIRICHLET_CONCENTRATION = 40

export type SecondRoundShockKey =
  | 'none'
  | 'rfShock'
  | 'dirichlet'
  | 'edU'
  | 'lfiLeftU'
  | 'turnout'
  | 'mob'
  | 'qDelta'
  | 'fidelity'
  | 'eta'

export const ALL_SECOND_ROUND_SHOCKS: readonly Exclude<SecondRoundShockKey, 'none'>[] = [
  'eta',
  'rfShock',
  'dirichlet',
  'edU',
  'lfiLeftU',
  'turnout',
  'mob',
  'qDelta',
  'fidelity',
]

export type P3FidelityMode = 'r2_5_measured' | 's3_neutral' | 'harris_2026'
export type P3FrontMode = 'leg2024_loo' | 'uncertain_loo'

export interface DistributionStats {
  mean: number
  sd: number
  variance: number
  p10: number
  median: number
  p90: number
  width80: number
}

export interface VarianceDecompRow {
  cut: SecondRoundShockKey
  stats: DistributionStats
  deltaVar: number
  deltaVarPct: number
  deltaWidth80: number
}

export interface VarianceDecompCase {
  id: string
  label: string
  duel: [CandidateId, CandidateId]
  isRnDuel: boolean
  frontMode: 'leg2024' | 'uncertain' | 'non-rn'
  baseline: DistributionStats
  rows: VarianceDecompRow[]
}

export interface CampaignVsSecondRoundRow {
  id: string
  label: string
  fullWidth80: number
  fullVariance: number
  r2OnlyWidth80: number
  r2OnlyVariance: number
  r2OnlyNoEtaWidth80: number
  r2OnlyNoEtaVariance: number
  r2ShareOfFullVarPct: number
  etaShareOfR2VarPct: number
  etaShareOfFullVarPct: number
}

export interface YearGridPoint {
  p10: number
  median: number
  p90: number
  width80: number
  covered: boolean
  crps: number
}

export interface EtaGridRow {
  sigmaEta: number
  y2017: YearGridPoint
  y2022: YearGridPoint
  bothCovered: boolean
  meanWidth80: number
  meanCrps: number
  crpsDeltaVs3Pct: number
}

export interface EtaCalibrationCurve {
  frontMode: P3FrontMode
  fidelityMode: P3FidelityMode
  iterations: number
  currentAt3: EtaGridRow
  selected: EtaGridRow | null
  /** Critères d'adoption §5.3 (décision 11) par rapport à σ_η = 3,0 pts. */
  adoptionCriteria: {
    hasFeasibleSigma: boolean
    bothCoveredMaintained: boolean
    meanWidthStrictlyReduced: boolean
    crpsDegradationWithin2Pct: boolean
    allPassed: boolean
  }
  grid: EtaGridRow[]
}

export interface P3AuditJson {
  generatedOn: string
  iterations: number
  seed: number
  sigmaEtaRnRetained: number
  sigmaEtaNonRnRetained: number
  verdict: 'rejected_width_not_reduced'
  varianceFixedR1: {
    id: string
    label: string
    width80: number
    sd: number
    variance: number
    shocks: { cut: SecondRoundShockKey; deltaVarPct: number; deltaWidth80: number }[]
  }[]
  campaignVsSecondRound: CampaignVsSecondRoundRow[]
  curves: {
    primary_leg2024_r25: EtaCalibrationCurve
    parallel_uncertain_r25: EtaCalibrationCurve
    comparison_leg2024_s3: EtaCalibrationCurve
    comparison_uncertain_s3: EtaCalibrationCurve
  }
  control10k: {
    leg2024_r25_selected: number | null
    leg2024_r25_crpsAt3: number
    leg2024_r25_crpsAtSelected: number | null
    uncertain_r25_selected: number | null
    uncertain_r25_crpsAt3: number
    uncertain_r25_crpsAtSelected: number | null
  }
  nonRn2012Note: P3Report['nonRn2012Note']
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

function roundCurve(c: EtaCalibrationCurve): EtaCalibrationCurve {
  const roundY = (y: YearGridPoint): YearGridPoint => ({
    p10: r4(y.p10),
    median: r4(y.median),
    p90: r4(y.p90),
    width80: r4(y.width80),
    covered: y.covered,
    crps: r4(y.crps),
  })
  const roundRow = (g: EtaGridRow): EtaGridRow => ({
    sigmaEta: g.sigmaEta,
    y2017: roundY(g.y2017),
    y2022: roundY(g.y2022),
    bothCovered: g.bothCovered,
    meanWidth80: r4(g.meanWidth80),
    meanCrps: r4(g.meanCrps),
    crpsDeltaVs3Pct: r4(g.crpsDeltaVs3Pct),
  })
  const grid = c.grid.map(roundRow)
  return {
    ...c,
    currentAt3: roundRow(c.currentAt3),
    selected: c.selected ? roundRow(c.selected) : null,
    grid,
  }
}

export function serializeP3AuditJson(report: P3Report, generatedOn: string): P3AuditJson {
  return {
    generatedOn,
    iterations: MONTE_CARLO_ITERATIONS,
    seed: MONTE_CARLO_SEED,
    sigmaEtaRnRetained: CURRENT_SIGMA_ETA_RN,
    sigmaEtaNonRnRetained: CURRENT_SIGMA_ETA_NON_RN,
    verdict: 'rejected_width_not_reduced',
    varianceFixedR1: report.varianceFixedR1.map((c) => ({
      id: c.id,
      label: c.label,
      width80: r4(c.baseline.width80),
      sd: r4(c.baseline.sd),
      variance: r4(c.baseline.variance),
      shocks: c.rows.map((row) => ({
        cut: row.cut,
        deltaVarPct: r4(row.deltaVarPct),
        deltaWidth80: r4(row.deltaWidth80),
      })),
    })),
    campaignVsSecondRound: report.campaignVsSecondRound.map((row) => ({
      ...row,
      fullWidth80: r4(row.fullWidth80),
      fullVariance: r4(row.fullVariance),
      r2OnlyWidth80: r4(row.r2OnlyWidth80),
      r2OnlyVariance: r4(row.r2OnlyVariance),
      r2OnlyNoEtaWidth80: r4(row.r2OnlyNoEtaWidth80),
      r2OnlyNoEtaVariance: r4(row.r2OnlyNoEtaVariance),
      r2ShareOfFullVarPct: r4(row.r2ShareOfFullVarPct),
      etaShareOfR2VarPct: r4(row.etaShareOfR2VarPct),
      etaShareOfFullVarPct: r4(row.etaShareOfFullVarPct),
    })),
    curves: {
      primary_leg2024_r25: roundCurve(report.calibration.primary_leg2024_r25),
      parallel_uncertain_r25: roundCurve(report.calibration.parallel_uncertain_r25),
      comparison_leg2024_s3: roundCurve(report.calibration.comparison_leg2024_s3),
      comparison_uncertain_s3: roundCurve(report.calibration.comparison_uncertain_s3),
    },
    control10k: {
      leg2024_r25_selected: report.calibration.primary_leg2024_r25_10k.selected?.sigmaEta ?? null,
      leg2024_r25_crpsAt3: r4(report.calibration.primary_leg2024_r25_10k.currentAt3.meanCrps),
      leg2024_r25_crpsAtSelected: report.calibration.primary_leg2024_r25_10k.selected
        ? r4(report.calibration.primary_leg2024_r25_10k.selected.meanCrps)
        : null,
      uncertain_r25_selected: report.calibration.parallel_uncertain_r25_10k.selected?.sigmaEta ?? null,
      uncertain_r25_crpsAt3: r4(report.calibration.parallel_uncertain_r25_10k.currentAt3.meanCrps),
      uncertain_r25_crpsAtSelected: report.calibration.parallel_uncertain_r25_10k.selected
        ? r4(report.calibration.parallel_uncertain_r25_10k.selected.meanCrps)
        : null,
    },
    nonRn2012Note: report.nonRn2012Note,
  }
}

export function parseP3AuditJson(raw: unknown): P3AuditJson {
  const data = raw as P3AuditJson
  if (!data || typeof data !== 'object' || !Array.isArray(data.curves?.primary_leg2024_r25?.grid)) {
    throw new Error('Fichier second-round-p3-audit.json invalide')
  }
  return data
}

export interface P3Report {
  varianceFixedR1: VarianceDecompCase[]
  campaignVsSecondRound: CampaignVsSecondRoundRow[]
  calibration: {
    primary_leg2024_r25: EtaCalibrationCurve
    parallel_uncertain_r25: EtaCalibrationCurve
    primary_leg2024_r25_10k: EtaCalibrationCurve
    parallel_uncertain_r25_10k: EtaCalibrationCurve
    comparison_leg2024_s3: EtaCalibrationCurve
    comparison_uncertain_s3: EtaCalibrationCurve
    comparison_leg2024_harris: EtaCalibrationCurve
    comparison_uncertain_harris: EtaCalibrationCurve
  }
  nonRn2012Note: {
    uses2012InModel: boolean
    sigmaEtaNonRnRetained: number
    actualHollande2012: number
    fixedR1StatsAt2: DistributionStats
    fixedR1StatsAt0: DistributionStats
  }
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function createNormalSampler(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u: number
    let v: number
    let s: number
    do {
      u = rng() * 2 - 1
      v = rng() * 2 - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const mul = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * mul
    return u * mul
  }
}

function sampleGamma(alpha: number, rng: () => number, nextNormal: () => number): number {
  if (alpha <= 0) return 0
  if (alpha < 1) {
    const u = Math.max(1e-12, rng())
    return sampleGamma(alpha + 1, rng, nextNormal) * u ** (1 / alpha)
  }
  const d = alpha - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  while (true) {
    let x = nextNormal()
    let v = 1 + c * x
    while (v <= 0) {
      x = nextNormal()
      v = 1 + c * x
    }
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function sampleDirichlet3(
  p1: number,
  p2: number,
  p3: number,
  kappa: number,
  rng: () => number,
  nextNormal: () => number,
): [number, number] {
  const g1 = p1 > 1e-4 ? sampleGamma((p1 / 100) * kappa, rng, nextNormal) : 0
  const g2 = p2 > 1e-4 ? sampleGamma((p2 / 100) * kappa, rng, nextNormal) : 0
  const g3 = p3 > 1e-4 ? sampleGamma((p3 / 100) * kappa, rng, nextNormal) : 0
  const total = g1 + g2 + g3
  if (total <= 0) return [p1 / 100, p2 / 100]
  return [g1 / total, g2 / total]
}

function sampleTriangular(min: number, max: number, mode: number, u: number): number {
  if (max <= min) return min
  const m = clamp(mode, min, max)
  const fc = (m - min) / (max - min)
  if (u < fc) return min + Math.sqrt(u * (max - min) * (m - min))
  return max - Math.sqrt((1 - u) * (max - min) * (max - m))
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = clamp(q, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

export function summarizeSamples(samples: ArrayLike<number>): DistributionStats {
  const n = samples.length
  const arr = Array.from(samples)
  const mean = arr.reduce((a, v) => a + v, 0) / n
  const variance = arr.reduce((a, v) => a + (v - mean) ** 2, 0) / n
  const sorted = [...arr].sort((a, b) => a - b)
  const p10 = quantile(sorted, 0.1)
  const median = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)
  return {
    mean,
    sd: Math.sqrt(variance),
    variance,
    p10,
    median,
    p90,
    width80: p90 - p10,
  }
}

const HISTORICAL_LEFT = new Set([
  'arthaud', 'poutou', 'roussel', 'hidalgo', 'melenchon', 'hamon', 'jadot', 'joly',
  'hollande', 'montebourg', 'taubira', 'valls', 'duflot', 'peillon', 'pinel',
])
const HISTORICAL_RIGHT = new Set(['fillon', 'pecresse', 'lassalle', 'bertrand', 'juppe', 'sarkozy'])
const HISTORICAL_FAR_RIGHT = new Set(['lepen', 'zemmour', 'dupont-aignan', 'asselineau', 'philippot'])

function historicalBloc(id: string): Bloc {
  if (HISTORICAL_LEFT.has(id)) return 'gauche'
  if (HISTORICAL_RIGHT.has(id)) return 'droite'
  if (HISTORICAL_FAR_RIGHT.has(id)) return 'extreme_droite'
  return 'centre'
}

function buildHistoricalCandidates(ref: Reference2012 | Reference2017 | Reference2022): Map<string, Candidate> {
  return new Map<string, Candidate>(
    ref.candidates.map(({ id }) => {
      const isRN = id === 'lepen'
      const bloc = historicalBloc(id)
      const duelProfile =
        bloc === 'centre' ? 'ensemble_rn' : bloc === 'droite' ? 'lr_rn' : bloc === 'gauche' ? 'lfi_rn' : null
      return [
        id,
        {
          id,
          name: id,
          shortName: id,
          party: '',
          bloc,
          color: '#000000',
          colorDark: '#ffffff',
          duelProfile,
          ...(isRN ? { isRN: true } : {}),
        },
      ]
    }),
  )
}

function firstRoundShares(ref: Reference2012 | Reference2017 | Reference2022): Record<string, number> {
  return Object.fromEntries(ref.candidates.map((c) => [c.id, (100 * c.votes) / ref.expressed]))
}

function actualSecondRoundPct(ref: Reference2017 | Reference2022, candidateId: string): number {
  const found = ref.secondRound.candidates.find((c) => c.id === candidateId)!
  return (100 * found.votes) / ref.secondRound.expressed
}

function getFinalistFidelities(
  year: '2017' | '2022',
  mode: P3FidelityMode,
  transfers: TransfersData,
  matrices: SecondRoundReferenceMatricesData,
): { fidA: FidelitySplit; fidB: FidelitySplit } {
  if (mode === 's3_neutral') {
    return { fidA: { ...transfers.fidelity.default }, fidB: { ...transfers.fidelity.default } }
  }
  if (mode === 'harris_2026') {
    return {
      fidA: { loyal: 95, cross: 1.5, abstention: 3.5 },
      fidB: { loyal: 96, cross: 1, abstention: 3 },
    }
  }
  const resolved = resolveReferenceRows(
    matrices.rows[year],
    matrices.surveys,
    'r1_1',
    matrices.participation[year].abstentionPctByCandidate,
  )
  const m = resolved.find((r) => r.candidateId === 'macron')!.row
  const l = resolved.find((r) => r.candidateId === 'lepen')!.row
  return {
    fidA: { loyal: m.antiRn, cross: m.rn, abstention: m.nonExpressed },
    fidB: { loyal: l.rn, cross: l.antiRn, abstention: l.nonExpressed },
  }
}

interface FixedR1SimInput {
  data: SimulationData
  settings: Settings
  electorate: Record<CandidateId, number>
  candidatesById: Map<CandidateId, Candidate>
  minorTransfers: Record<CandidateId, readonly ReferencePart[]>
  a: CandidateId
  b: CandidateId
  firstRoundTurnout: number
  blankNullShare: number
  /** Surcharge des fidélités de base des finalistes (ex. R2.5 mesurées). */
  fidelityOverride?: { fidA: FidelitySplit; fidB: FidelitySplit }
  /**
   * Mode leave-one-out R2.4 pour les présidentielles 2017/2022 :
   * retire l'ancre de l'année exclue et interpole uniquement sur les deux autres ancres.
   */
  looExcludeYear?: '2017' | '2022'
  /** Si true en mode LOO, le front est tiré uniformément sur l'étendue des deux ancres restantes. */
  looUncertain?: boolean
  sigmaEtaRn?: number
  sigmaEtaNonRn?: number
  cut?: SecondRoundShockKey
  iterations?: number
  seed?: number
}

/**
 * Simule la distribution conditionnelle du score du candidat `a` (% des exprimés T2) à 1er tour fixé,
 * avec exactement les mêmes distributions que `monteCarlo.ts` et nombres aléatoires communs (CRN)
 * entre les coupes d'aléas et le balayage de σ_η.
 */
export function simulateFixedR1Distribution(input: FixedR1SimInput): {
  rawPctA: Float64Array
  zEta: Float64Array
  finalPctA: Float64Array
} {
  const {
    data,
    settings,
    electorate,
    candidatesById,
    minorTransfers,
    a,
    b,
    firstRoundTurnout,
    blankNullShare,
    fidelityOverride,
    looExcludeYear,
    looUncertain = false,
    sigmaEtaRn = CURRENT_SIGMA_ETA_RN,
    sigmaEtaNonRn = CURRENT_SIGMA_ETA_NON_RN,
    cut = 'none',
    iterations = MONTE_CARLO_ITERATIONS,
    seed = MONTE_CARLO_SEED,
  } = input

  const rng = mulberry32(seed)
  const nextNormal = createNormalSampler(rng)
  const duel = resolveDuel(a, b, candidatesById)
  const isRnDuel = duel.kind === 'rn-sourced'
  const profileId: ProfileId = duel.profileWeights[0]?.profileId ?? 'ensemble_rn'
  const rawProfile = data.transfers.profiles.find((p) => p.id === profileId)!
  const challengerIsA = duel.challengerId === a
  const candA = candidatesById.get(a)
  const candB = candidatesById.get(b)
  const aIsLeft = candA?.bloc === 'gauche'

  const fidA0 =
    fidelityOverride?.fidA ??
    fidelityFor(a, data.transfers, settings.fidelity, {
      declaredTransfers: data.declaredTransfers,
      transferSource: settings.transferSource,
      declaredWeight: settings.declaredWeight,
      isRnDuel,
      isRnFinalist: Boolean(candA?.isRN),
    })
  const fidB0 =
    fidelityOverride?.fidB ??
    fidelityFor(b, data.transfers, settings.fidelity, {
      declaredTransfers: data.declaredTransfers,
      transferSource: settings.transferSource,
      declaredWeight: settings.declaredWeight,
      isRnDuel,
      isRnFinalist: Boolean(candB?.isRN),
    })

  const [lfiLeftMin, lfiLeftMax] = [
    clamp(Math.min(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1]), 5, 95),
    clamp(Math.max(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1]), 5, 95),
  ]
  const bnClamped = clamp(blankNullShare, 0, 0.5)

  // Ancres LOO R2.4 (pour 2017/2022) : ancre basse = l'autre présidentielle, ancre haute = Lég. 2024
  const ens24 = data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const looLowRows = looExcludeYear
    ? data.transfers.presidentialCenterRn.elections[looExcludeYear === '2017' ? '2022' : '2017']
    : null
  const looMinPos = looExcludeYear === '2022' ? data.transfers.presidentialCenterRn.anchor2017Position : 0
  const looMaxPos = 1

  const rawPctA = new Float64Array(iterations)
  const zEta = new Float64Array(iterations)
  const finalPctA = new Float64Array(iterations)

  const activeEntries = Object.entries(electorate).filter(([, v]) => v > 0)

  for (let iter = 0; iter < iterations; iter++) {
    // Consommation constante du PRNG (CRN) : chaque coupe met simplement l'écart à zéro sans décaler la graine.
    const rawNormalRf = clamp(nextNormal() * 0.25, -0.5, 0.5)
    const rawUncertainU = rng()
    const rawLfiLeftU = rng()
    const rawEdU = rng()
    const rawTurnoutDelta = rng() * 10 - 5
    const rawMobDelta = rng() * 0.17 - 0.085
    const rawQDelta = rng() * 0.16 - 0.08
    const rawFidDeltaA = rng() * 5 - 2.5
    const rawFidDeltaB = rng() * 5 - 2.5
    const zRn = nextNormal()
    const zNonRn = nextNormal()

    const rfShock =
      cut === 'rfShock'
        ? 0
        : settings.republicanFront.uncertain || looUncertain
          ? rawUncertainU - 0.5
          : rawNormalRf
    const lfiLeftU = cut === 'lfiLeftU' ? -1 : rawLfiLeftU
    const edU = cut === 'edU' ? 0.5 : rawEdU
    const turnout = clamp(firstRoundTurnout + (cut === 'turnout' ? 0 : rawTurnoutDelta), 55, 88)
    const expressed1 = turnout * (1 - bnClamped)
    const nonExpressed1 = 100 - expressed1
    const scale = expressed1 / 100
    const mob = clamp(settings.abstainerMobilization + (cut === 'mob' ? 0 : rawMobDelta), 0.05, 0.45)
    const qDelta = cut === 'qDelta' ? 0 : rawQDelta
    const fidDeltaA = cut === 'fidelity' ? 0 : rawFidDeltaA
    const fidDeltaB = cut === 'fidelity' ? 0 : rawFidDeltaB

    // Tirage des lignes de report (toujours tirées en CRN pour la Dirichlet, ignorées si cut === 'dirichlet')
    const profF: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }
    const profR: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }
    const nrL: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }
    const nrR: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }

    if (isRnDuel) {
      for (const bloc of BLOCS) {
        let row: TransferValues
        if (bloc === 'extreme_droite') {
          row = interpolateExtremeDroite(data.transfers, edU)
        } else if (looExcludeYear && looLowRows) {
          if (bloc === 'centre') {
            row = { ...ens24.centre }
          } else {
            // LOO R2.4 sur [looMinPos ; 1]
            let pos: number
            if (looUncertain) {
              pos = cut === 'rfShock' ? (looMinPos + looMaxPos) / 2 : looMinPos + rawUncertainU * (looMaxPos - looMinPos)
            } else {
              const basePos = clamp(frontStrengthForBloc(bloc, settings.republicanFront), looMinPos, looMaxPos)
              pos = clamp(basePos + rfShock, looMinPos, looMaxPos)
            }
            const t = looMaxPos > looMinPos ? (pos - looMinPos) / (looMaxPos - looMinPos) : 1
            const { df, dr } = logitDelta(looLowRows[bloc], ens24[bloc])
            row = shiftTransferLogit(looLowRows[bloc], df * t, dr * t)
          }
        } else {
          const strength = clamp(frontStrengthForBloc(bloc, settings.republicanFront) + rfShock, 0, 1)
          const shifted = applyRepublicanFrontRow(profileId, bloc, rawProfile.rows[bloc], data.transfers, strength)
          if (profileId === 'lfi_rn' && bloc === 'gauche') {
            if (lfiLeftU < 0) {
              row = shifted
            } else {
              const rate = sampleTriangular(lfiLeftMin, lfiLeftMax, shifted.finalist, lfiLeftU)
              row = lfiLeftTransferRow(rate, data.transfers, data.declaredTransfers)
            }
          } else {
            row = shifted
          }
        }
        const [df, dr] = sampleDirichlet3(row.finalist, row.rn, row.abstention, DIRICHLET_CONCENTRATION, rng, nextNormal)
        profF[bloc] = cut === 'dirichlet' ? row.finalist / 100 : df
        profR[bloc] = cut === 'dirichlet' ? row.rn / 100 : dr
      }
    } else if (duel.kind === 'non-rn-presidential') {
      for (const bloc of BLOCS) {
        const row = data.transfers.nonRnPresidential.leftVsCenterRight[bloc]
        const [dl, dr] = sampleDirichlet3(row.left, row.right, row.abstention, DIRICHLET_CONCENTRATION, rng, nextNormal)
        nrL[bloc] = cut === 'dirichlet' ? row.left / 100 : dl
        nrR[bloc] = cut === 'dirichlet' ? row.right / 100 : dr
      }
    }

    const loyalA = clamp(fidA0.loyal + fidDeltaA, 80, 99)
    const baseRestA = fidA0.cross + fidA0.abstention
    const crossA = baseRestA > 0 ? ((100 - loyalA) * fidA0.cross) / baseRestA : 0
    const loyalB = clamp(fidB0.loyal + fidDeltaB, 80, 99)
    const baseRestB = fidB0.cross + fidB0.abstention
    const crossB = baseRestB > 0 ? ((100 - loyalB) * fidB0.cross) / baseRestB : 0

    const addCandFlow = (cid: CandidateId, share: number): [number, number] => {
      if (cid === a) return [share * (loyalA / 100), share * (crossA / 100)]
      if (cid === b) return [share * (crossB / 100), share * (loyalB / 100)]
      const bloc = candidatesById.get(cid)?.bloc ?? 'centre'
      if (isRnDuel) {
        return challengerIsA ? [share * profF[bloc], share * profR[bloc]] : [share * profR[bloc], share * profF[bloc]]
      }
      if (duel.kind === 'non-rn-presidential') {
        return aIsLeft ? [share * nrL[bloc], share * nrR[bloc]] : [share * nrR[bloc], share * nrL[bloc]]
      }
      const sp = nonRnSplit(bloc, candA?.bloc ?? null, candB?.bloc ?? null, data.transfers.nonRnPresidential)
      return [share * (sp.toA / 100), share * (sp.toB / 100)]
    }

    let totA = 0
    let totB = 0
    for (const [cid, pctScore] of activeEntries) {
      const share = pctScore * scale
      const isFin = cid === a || cid === b
      const like = isFin ? null : minorTransfers[cid]
      if (!like || like.length === 0) {
        const [ta, tb] = addCandFlow(cid, share)
        totA += ta
        totB += tb
      } else {
        for (const p of like) {
          const [ta, tb] = addCandFlow(p.id, share * p.weight)
          totA += ta
          totB += tb
        }
      }
    }

    const r1Expr2 = totA + totB
    const qNeutralA = r1Expr2 > 0 ? totA / r1Expr2 : 0.5
    const newVoters = nonExpressed1 * mob
    let qA: number
    if (isRnDuel && settings.abstainerAntiRnShare !== null) {
      const antiRnQ = clamp(settings.abstainerAntiRnShare + qDelta, 0.2, 0.85)
      qA = challengerIsA ? antiRnQ : 1 - antiRnQ
    } else {
      qA = clamp(qNeutralA + qDelta, 0.2, 0.8)
    }
    totA += newVoters * qA
    totB += newVoters * (1 - qA)

    const expr2 = totA + totB
    const raw = expr2 > 0 ? (100 * totA) / expr2 : 50
    const z = isRnDuel ? (challengerIsA ? zRn : -zRn) : zNonRn
    const sigma = cut === 'eta' ? 0 : isRnDuel ? sigmaEtaRn : sigmaEtaNonRn

    rawPctA[iter] = raw
    zEta[iter] = z
    finalPctA[iter] = clamp(raw + sigma * z, 1, 99)
  }

  return { rawPctA, zEta, finalPctA }
}

function runVarianceDecomp(
  id: string,
  label: string,
  baseInput: Omit<FixedR1SimInput, 'cut'>,
  frontMode: 'leg2024' | 'uncertain' | 'non-rn',
): VarianceDecompCase {
  const baseSim = simulateFixedR1Distribution({ ...baseInput, cut: 'none' })
  const baseline = summarizeSamples(baseSim.finalPctA)
  const isRnDuel = frontMode !== 'non-rn'
  const shocks: readonly Exclude<SecondRoundShockKey, 'none'>[] = isRnDuel
    ? ALL_SECOND_ROUND_SHOCKS
    : ['eta', 'dirichlet', 'turnout', 'mob', 'qDelta', 'fidelity']

  const rows: VarianceDecompRow[] = shocks.map((cut) => {
    const sim = simulateFixedR1Distribution({ ...baseInput, cut })
    const stats = summarizeSamples(sim.finalPctA)
    const deltaVar = baseline.variance - stats.variance
    return {
      cut,
      stats,
      deltaVar,
      deltaVarPct: baseline.variance > 0 ? (100 * deltaVar) / baseline.variance : 0,
      deltaWidth80: baseline.width80 - stats.width80,
    }
  })

  return {
    id,
    label,
    duel: [baseInput.a, baseInput.b],
    isRnDuel,
    frontMode,
    baseline,
    rows,
  }
}

/** Balaye σ_η ∈ [0 ; 5] (pas 0,25) en CRN sur 2017 et 2022 conditionnels (1er tour réel fixé, LOO R2.4). */
export function evaluateEtaCalibrationCurve(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  frontMode: P3FrontMode,
  fidelityMode: P3FidelityMode,
  iterations = MONTE_CARLO_ITERATIONS,
  seed = MONTE_CARLO_SEED,
): EtaCalibrationCurve {
  const ref17 = data.reference2017
  const ref22 = data.reference2022
  const act17 = actualSecondRoundPct(ref17, 'macron')
  const act22 = actualSecondRoundPct(ref22, 'macron')

  const baseSettings = defaultSettings()
  const settings: Settings = {
    ...baseSettings,
    republicanFront:
      frontMode === 'uncertain_loo' ? REPUBLICAN_FRONT_PRESETS.uncertain : REPUBLICAN_FRONT_PRESETS.leg2024,
  }

  const sim17 = simulateFixedR1Distribution({
    data,
    settings,
    electorate: firstRoundShares(ref17),
    candidatesById: buildHistoricalCandidates(ref17),
    minorTransfers: {},
    a: 'macron',
    b: 'lepen',
    firstRoundTurnout: (100 * ref17.voters) / ref17.registered,
    blankNullShare: (ref17.voters - ref17.expressed) / ref17.voters,
    fidelityOverride: getFinalistFidelities('2017', fidelityMode, data.transfers, matrices),
    looExcludeYear: '2017',
    looUncertain: frontMode === 'uncertain_loo',
    sigmaEtaRn: 0,
    iterations,
    seed,
  })
  const sim22 = simulateFixedR1Distribution({
    data,
    settings,
    electorate: firstRoundShares(ref22),
    candidatesById: buildHistoricalCandidates(ref22),
    minorTransfers: {},
    a: 'macron',
    b: 'lepen',
    firstRoundTurnout: (100 * ref22.voters) / ref22.registered,
    blankNullShare: (ref22.voters - ref22.expressed) / ref22.voters,
    fidelityOverride: getFinalistFidelities('2022', fidelityMode, data.transfers, matrices),
    looExcludeYear: '2022',
    looUncertain: frontMode === 'uncertain_loo',
    sigmaEtaRn: 0,
    iterations,
    seed,
  })

  const evalYear = (raw: Float64Array, z: Float64Array, sigma: number, actual: number): YearGridPoint => {
    const out = new Float64Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = clamp(raw[i]! + sigma * z[i]!, 1, 99)
    const st = summarizeSamples(out)
    return {
      p10: st.p10,
      median: st.median,
      p90: st.p90,
      width80: st.width80,
      covered: actual >= st.p10 && actual <= st.p90,
      crps: crpsFromSamples(out, actual),
    }
  }

  const rawRows = P3_SIGMA_ETA_GRID.map((sigmaEta) => {
    const y2017 = evalYear(sim17.rawPctA, sim17.zEta, sigmaEta, act17)
    const y2022 = evalYear(sim22.rawPctA, sim22.zEta, sigmaEta, act22)
    return {
      sigmaEta,
      y2017,
      y2022,
      bothCovered: y2017.covered && y2022.covered,
      meanWidth80: (y2017.width80 + y2022.width80) / 2,
      meanCrps: (y2017.crps + y2022.crps) / 2,
    }
  })

  const ref3 = rawRows.find((r) => Math.abs(r.sigmaEta - CURRENT_SIGMA_ETA_RN) < 1e-9)!
  const grid: EtaGridRow[] = rawRows.map((r) => ({
    ...r,
    crpsDeltaVs3Pct: ref3.meanCrps > 0 ? (100 * (r.meanCrps - ref3.meanCrps)) / ref3.meanCrps : 0,
  }))

  const currentAt3 = grid.find((r) => Math.abs(r.sigmaEta - CURRENT_SIGMA_ETA_RN) < 1e-9)!
  const feasible = grid.filter((r) => r.bothCovered)
  let selected: EtaGridRow | null = null
  for (const r of feasible) {
    if (!selected || r.meanCrps < selected.meanCrps - 1e-12) selected = r
  }

  const hasFeasibleSigma = selected !== null
  const bothCoveredMaintained = Boolean(selected?.bothCovered)
  const meanWidthStrictlyReduced = Boolean(selected && selected.meanWidth80 < currentAt3.meanWidth80 - 1e-9)
  const crpsDegradationWithin2Pct = Boolean(selected && selected.crpsDeltaVs3Pct <= 2.0 + 1e-9)

  return {
    frontMode,
    fidelityMode,
    iterations,
    currentAt3,
    selected,
    adoptionCriteria: {
      hasFeasibleSigma,
      bothCoveredMaintained,
      meanWidthStrictlyReduced,
      crpsDegradationWithin2Pct,
      allPassed:
        hasFeasibleSigma && bothCoveredMaintained && meanWidthStrictlyReduced && crpsDegradationWithin2Pct,
    },
    grid,
  }
}

export function computeP3Report(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  options: { controlIterations?: number } = {},
): P3Report {
  const controlIterations = options.controlIterations ?? 10000
  const defSettings = defaultSettings()
  const uncSettings: Settings = { ...defSettings, republicanFront: REPUBLICAN_FRONT_PRESETS.uncertain }
  const sim2027 = simulate(data, defSettings)
  const cand2027ById = new Map(data.polls.candidates.map((c) => [c.id, c]))
  const elec2027 = Object.fromEntries(sim2027.entrants.map((e) => [e.id, e.score]))
  const bn2027 = (data.reference2022.voters - data.reference2022.expressed) / data.reference2022.voters

  const ref17 = data.reference2017
  const ref22 = data.reference2022
  const ref12 = data.reference2012

  // 1. Décomposition de variance à 1er tour fixé (2017, 2022, 2012 et 2027)
  const varianceFixedR1: VarianceDecompCase[] = [
    runVarianceDecomp(
      '2017_leg2024_loo',
      '2017 Macron–Le Pen (1er tour réel, LOO [2022,2024], défaut leg2024)',
      {
        data,
        settings: defSettings,
        electorate: firstRoundShares(ref17),
        candidatesById: buildHistoricalCandidates(ref17),
        minorTransfers: {},
        a: 'macron',
        b: 'lepen',
        firstRoundTurnout: (100 * ref17.voters) / ref17.registered,
        blankNullShare: (ref17.voters - ref17.expressed) / ref17.voters,
        fidelityOverride: getFinalistFidelities('2017', 'r2_5_measured', data.transfers, matrices),
        looExcludeYear: '2017',
        looUncertain: false,
      },
      'leg2024',
    ),
    runVarianceDecomp(
      '2017_uncertain_loo',
      '2017 Macron–Le Pen (1er tour réel, LOO [2022,2024], mode uncertain)',
      {
        data,
        settings: uncSettings,
        electorate: firstRoundShares(ref17),
        candidatesById: buildHistoricalCandidates(ref17),
        minorTransfers: {},
        a: 'macron',
        b: 'lepen',
        firstRoundTurnout: (100 * ref17.voters) / ref17.registered,
        blankNullShare: (ref17.voters - ref17.expressed) / ref17.voters,
        fidelityOverride: getFinalistFidelities('2017', 'r2_5_measured', data.transfers, matrices),
        looExcludeYear: '2017',
        looUncertain: true,
      },
      'uncertain',
    ),
    runVarianceDecomp(
      '2022_leg2024_loo',
      '2022 Macron–Le Pen (1er tour réel, LOO [2017,2024], défaut leg2024)',
      {
        data,
        settings: defSettings,
        electorate: firstRoundShares(ref22),
        candidatesById: buildHistoricalCandidates(ref22),
        minorTransfers: {},
        a: 'macron',
        b: 'lepen',
        firstRoundTurnout: (100 * ref22.voters) / ref22.registered,
        blankNullShare: (ref22.voters - ref22.expressed) / ref22.voters,
        fidelityOverride: getFinalistFidelities('2022', 'r2_5_measured', data.transfers, matrices),
        looExcludeYear: '2022',
        looUncertain: false,
      },
      'leg2024',
    ),
    runVarianceDecomp(
      '2022_uncertain_loo',
      '2022 Macron–Le Pen (1er tour réel, LOO [2017,2024], mode uncertain)',
      {
        data,
        settings: uncSettings,
        electorate: firstRoundShares(ref22),
        candidatesById: buildHistoricalCandidates(ref22),
        minorTransfers: {},
        a: 'macron',
        b: 'lepen',
        firstRoundTurnout: (100 * ref22.voters) / ref22.registered,
        blankNullShare: (ref22.voters - ref22.expressed) / ref22.voters,
        fidelityOverride: getFinalistFidelities('2022', 'r2_5_measured', data.transfers, matrices),
        looExcludeYear: '2022',
        looUncertain: true,
      },
      'uncertain',
    ),
    runVarianceDecomp(
      '2012_non_rn',
      '2012 Hollande–Sarkozy (1er tour réel, hors RN)',
      {
        data,
        settings: defSettings,
        electorate: firstRoundShares(ref12),
        candidatesById: buildHistoricalCandidates(ref12),
        minorTransfers: {},
        a: 'hollande',
        b: 'sarkozy',
        firstRoundTurnout: (100 * ref12.voters) / ref12.registered,
        blankNullShare: (ref12.voters - ref12.expressed) / ref12.voters,
      },
      'non-rn',
    ),
    runVarianceDecomp(
      '2027_lepen_melenchon_leg2024',
      '2027 Le Pen–Mélenchon (1er tour projeté fixe, défaut leg2024)',
      {
        data,
        settings: defSettings,
        electorate: elec2027,
        candidatesById: cand2027ById,
        minorTransfers: {},
        a: 'lepen',
        b: 'melenchon',
        firstRoundTurnout: defSettings.firstRoundTurnout,
        blankNullShare: bn2027,
      },
      'leg2024',
    ),
    runVarianceDecomp(
      '2027_lepen_melenchon_uncertain',
      '2027 Le Pen–Mélenchon (1er tour projeté fixe, mode uncertain)',
      {
        data,
        settings: uncSettings,
        electorate: elec2027,
        candidatesById: cand2027ById,
        minorTransfers: {},
        a: 'lepen',
        b: 'melenchon',
        firstRoundTurnout: uncSettings.firstRoundTurnout,
        blankNullShare: bn2027,
      },
      'uncertain',
    ),
    runVarianceDecomp(
      '2027_lepen_philippe_leg2024',
      '2027 Le Pen–Philippe (1er tour projeté fixe, défaut leg2024)',
      {
        data,
        settings: defSettings,
        electorate: elec2027,
        candidatesById: cand2027ById,
        minorTransfers: {},
        a: 'lepen',
        b: 'philippe',
        firstRoundTurnout: defSettings.firstRoundTurnout,
        blankNullShare: bn2027,
      },
      'leg2024',
    ),
    runVarianceDecomp(
      '2027_lepen_philippe_uncertain',
      '2027 Le Pen–Philippe (1er tour projeté fixe, mode uncertain)',
      {
        data,
        settings: uncSettings,
        electorate: elec2027,
        candidatesById: cand2027ById,
        minorTransfers: {},
        a: 'lepen',
        b: 'philippe',
        firstRoundTurnout: uncSettings.firstRoundTurnout,
        blankNullShare: bn2027,
      },
      'uncertain',
    ),
    runVarianceDecomp(
      '2027_melenchon_philippe_non_rn',
      '2027 Mélenchon–Philippe (1er tour projeté fixe, hors RN)',
      {
        data,
        settings: defSettings,
        electorate: elec2027,
        candidatesById: cand2027ById,
        minorTransfers: {},
        a: 'melenchon',
        b: 'philippe',
        firstRoundTurnout: defSettings.firstRoundTurnout,
        blankNullShare: bn2027,
      },
      'non-rn',
    ),
  ]

  // 2. Comparaison incertitude totale (1er tour + 2nd tour) vs 2nd tour seul aux dates du backtest et pour 2027
  const bt = computeBacktest(data, data.polls)
  const campaignVsSecondRound: CampaignVsSecondRoundRow[] = []

  const addFullVsR2 = (
    id: string,
    label: string,
    fullWidth80: number,
    r2Case: VarianceDecompCase,
  ) => {
    // Approximation gaussienne de la variance totale à partir de [P10 ; P90] (largeur / 2,5631)² pour comparaison homogène
    const fullSd = fullWidth80 / 2.563103131
    const fullVariance = fullSd * fullSd
    const r2NoEta = r2Case.rows.find((r) => r.cut === 'eta')!.stats
    const etaDeltaVar = r2Case.baseline.variance - r2NoEta.variance
    campaignVsSecondRound.push({
      id,
      label,
      fullWidth80,
      fullVariance,
      r2OnlyWidth80: r2Case.baseline.width80,
      r2OnlyVariance: r2Case.baseline.variance,
      r2OnlyNoEtaWidth80: r2NoEta.width80,
      r2OnlyNoEtaVariance: r2NoEta.variance,
      r2ShareOfFullVarPct: fullVariance > 0 ? (100 * r2Case.baseline.variance) / fullVariance : 0,
      etaShareOfR2VarPct: r2Case.baseline.variance > 0 ? (100 * etaDeltaVar) / r2Case.baseline.variance : 0,
      etaShareOfFullVarPct: fullVariance > 0 ? (100 * etaDeltaVar) / fullVariance : 0,
    })
  }

  for (const [yr, caseId] of [
    [2017, '2017_leg2024_loo'],
    [2022, '2022_leg2024_loo'],
  ] as const) {
    const cov = bt.coverage80.find((c) => c.year === yr)!
    const fullW = cov.secondRoundP90! - cov.secondRoundP10!
    addFullVsR2(
      `${yr}_backtest`,
      `${yr} à J−${cov.effectiveDaysBefore} (campagne + 2nd tour)`,
      fullW,
      varianceFixedR1.find((v) => v.id === caseId)!,
    )
  }

  for (const [duelPair, caseId, lbl] of [
    [['lepen', 'melenchon'] as [CandidateId, CandidateId], '2027_lepen_melenchon_leg2024', '2027 Le Pen–Mélenchon (J−d, défaut leg2024)'],
    [['lepen', 'philippe'] as [CandidateId, CandidateId], '2027_lepen_philippe_leg2024', '2027 Le Pen–Philippe (J−d, défaut leg2024)'],
  ] as const) {
    const mc = runMonteCarlo({
      data,
      settings: defSettings,
      baseScores: elec2027,
      candidatesById: cand2027ById,
      minorTransfers: {},
      blankNullShare: bn2027,
      displayedDuel: duelPair,
      iterations: MONTE_CARLO_ITERATIONS,
      seed: MONTE_CARLO_SEED,
    })
    addFullVsR2(
      caseId,
      lbl,
      mc.displayedDuel.aScoreP90 - mc.displayedDuel.aScoreP10,
      varianceFixedR1.find((v) => v.id === caseId)!,
    )
  }
  void CAMPAIGN_REF_DAYS
  void SIGMA_CAMPAIGN_REF
  void SIGMA_POLLING_FLOOR

  // 3. Courbes CRPS conditionnelles (grille [0 ; 5] pas 0,25, R2.4 LOO + R2.5 finalistes, + variantes)
  const calibration = {
    primary_leg2024_r25: evaluateEtaCalibrationCurve(data, matrices, 'leg2024_loo', 'r2_5_measured', 2000),
    parallel_uncertain_r25: evaluateEtaCalibrationCurve(data, matrices, 'uncertain_loo', 'r2_5_measured', 2000),
    primary_leg2024_r25_10k: evaluateEtaCalibrationCurve(data, matrices, 'leg2024_loo', 'r2_5_measured', controlIterations),
    parallel_uncertain_r25_10k: evaluateEtaCalibrationCurve(data, matrices, 'uncertain_loo', 'r2_5_measured', controlIterations),
    comparison_leg2024_s3: evaluateEtaCalibrationCurve(data, matrices, 'leg2024_loo', 's3_neutral', 2000),
    comparison_uncertain_s3: evaluateEtaCalibrationCurve(data, matrices, 'uncertain_loo', 's3_neutral', 2000),
    comparison_leg2024_harris: evaluateEtaCalibrationCurve(data, matrices, 'leg2024_loo', 'harris_2026', 2000),
    comparison_uncertain_harris: evaluateEtaCalibrationCurve(data, matrices, 'uncertain_loo', 'harris_2026', 2000),
  }

  // 4. Contrôle 2012 (non recalé car 2012 est dans nonRnPresidential)
  const c2012 = varianceFixedR1.find((v) => v.id === '2012_non_rn')!
  const hollande2012 =
    (100 * ref12.secondRound.candidates.find((c) => c.id === 'hollande')!.votes) / ref12.secondRound.expressed

  return {
    varianceFixedR1,
    campaignVsSecondRound,
    calibration,
    nonRn2012Note: {
      uses2012InModel: true,
      sigmaEtaNonRnRetained: CURRENT_SIGMA_ETA_NON_RN,
      actualHollande2012: hollande2012,
      fixedR1StatsAt2: c2012.baseline,
      fixedR1StatsAt0: c2012.rows.find((r) => r.cut === 'eta')!.stats,
    },
  }
}
