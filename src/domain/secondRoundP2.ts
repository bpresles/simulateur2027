// Évaluation P2 (B4) : calcul de s_2017 (R2.5), interpolation logit linéaire par morceaux à 3 ancres (R2.3),
// leave-one-out sur les ancres (R2.4) et règle de défaut (R2.2) sur le moteur P1-bis (S1–S5).
import { computeSecondRound } from './secondRound'
import { computeP1BisReport } from './secondRoundP1Bis'
import { resolveReferenceRows } from './secondRoundReproduction'
import { logitDelta, resolveDuel, shiftTransferLogit } from './transfers'
import type { ProfileTable } from './transfers'
import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  FidelitySplit,
  Reference2017,
  Reference2022,
  SecondRoundReferenceMatricesData,
  SimulationData,
  TransferValues,
  TransfersData,
} from './types'

type ReferencePresidential = Reference2017 | Reference2022

export type P2FidelityMode = 'r2_5_r1_1' | 'r2_5_r1_7' | 's3_neutral' | 'harris_2026'
export type P2EdMode = 'measured_2017' | 's4_pooled'

export interface S2017Estimate {
  fidelityMode: P2FidelityMode
  edMode: P2EdMode
  fidMacron: FidelitySplit
  fidLePen: FidelitySplit
  edRow: TransferValues
  actual2017Pct: number
  predAt0: number
  predAt05: number
  predAt1: number
  /** Position s_2017 sur l'échelle logit 2022 (0) ↔ 2024 (1), ou null si la courbe plafonne sous la cible. */
  s2017: number | null
  predAtS2017: number | null
  /** Maximum atteint sur [-1 ; 3] si aucune racine n'existe. */
  peakOnGrid: { s: number; pred: number }
  /** Préréglage le plus proche parmi pres2022 (0), midpoint (0,5), leg2024 (1). */
  closestPreset: 'pres2022' | 'midpoint' | 'leg2024'
  /** Défaut désigné par R2.2 : pres2022 si s2017 < 0,25, sinon uncertain. */
  r22Default: 'pres2022' | 'uncertain'
  /** Bornes [min(0, s2017), max(1, s2017)] de l'échelle à 3 ancres. */
  scaleBounds: [number, number]
}

export interface AnchorPoint {
  id: '2022' | '2017' | '2024'
  position: number
  rows: Record<'gauche' | 'droite', TransferValues>
}

export interface LooYearResult {
  year: '2017' | '2022'
  actualAntiRn: number
  availableAnchors: ('2022' | '2017' | '2024')[]
  span: [number, number]
  byAnchor: Record<string, { pred: number; err: number }>
  uncertainMidpoint: { position: number; pred: number; err: number }
  uncertainMean: { pred: number; err: number; min: number; max: number }
}

export interface AnchorScenarioSummary {
  label: string
  s2017: number
  anchors: AnchorPoint[]
  samples: { s: number; gauche: TransferValues; droite: TransferValues; pred2017Neutral: number; pred2022Neutral: number }[]
  leaveOneOut: {
    s3Neutral_s4PooledEd: { '2017': LooYearResult; '2022': LooYearResult }
    s3Neutral_crossEd: { '2017': LooYearResult; '2022': LooYearResult }
    r25Measured_ownEd: { '2017': LooYearResult; '2022': LooYearResult }
  }
}

export interface P2Report {
  estimates: S2017Estimate[]
  /** Deux candidatures R2.5 pour s_2017 : ED mesurée 2017 (front pur) vs ED S4 moyennée (moteur P1-bis). */
  scenarios: {
    r25MeasuredEd: AnchorScenarioSummary
    r25PooledEd: AnchorScenarioSummary
  }
  r14BisCheck: ReturnType<typeof computeP1BisReport>['r14Bis']
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

function firstRoundScores(ref: ReferencePresidential): Record<string, number> {
  return Object.fromEntries(ref.candidates.map((c) => [c.id, (100 * c.votes) / ref.expressed]))
}

function actualMacronPct(ref: ReferencePresidential): number {
  const m = ref.secondRound.candidates.find((c) => c.id === 'macron')!
  return (100 * m.votes) / ref.secondRound.expressed
}

function buildCandidates(ref: ReferencePresidential): Map<string, Candidate> {
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

function buildProfileTable(rows: Record<Bloc, TransferValues>): ProfileTable {
  return {
    lfi_rn: rows,
    ecolo_ps_pcf_rn: rows,
    ensemble_rn: rows,
    lr_rn: rows,
  }
}

/** Interpolation linéaire en logit entre 2022 (s = 0) et 2024 (s = 1), étendue sans bornage pour résoudre s_2017. */
export function interpolate2022To2024LogitUnbounded(
  transfers: TransfersData,
  bloc: 'gauche' | 'droite',
  s: number,
): TransferValues {
  const row2022 = transfers.presidentialCenterRn.elections['2022'][bloc]
  const row2024 = transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows[bloc]
  const { df, dr } = logitDelta(row2022, row2024)
  return shiftTransferLogit(row2022, df * s, dr * s)
}

/** Interpolation linéaire par morceaux en logit entre des ancres triées par position (sans extrapolation au-delà des bornes). */
export function interpolateAnchorsPiecewiseLogit(
  anchors: AnchorPoint[],
  bloc: 'gauche' | 'droite',
  s: number,
): TransferValues {
  const sorted = [...anchors].sort((a, b) => a.position - b.position)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  if (s <= first.position) return { ...first.rows[bloc] }
  if (s >= last.position) return { ...last.rows[bloc] }
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!
    const hi = sorted[i + 1]!
    if (s >= lo.position && s <= hi.position) {
      const span = hi.position - lo.position
      const t = span > 0 ? (s - lo.position) / span : 0
      const { df, dr } = logitDelta(lo.rows[bloc], hi.rows[bloc])
      return shiftTransferLogit(lo.rows[bloc], df * t, dr * t)
    }
  }
  return { ...last.rows[bloc] }
}

function evalPresidentialOnRows(
  ref: ReferencePresidential,
  transfers: TransfersData,
  rows: Record<Bloc, TransferValues>,
  fidMacron: FidelitySplit,
  fidLePen: FidelitySplit,
): number {
  const byId = buildCandidates(ref)
  const duel = resolveDuel('macron', 'lepen', byId)
  const res = computeSecondRound({
    electorate: firstRoundScores(ref),
    a: 'macron',
    b: 'lepen',
    duel,
    profiles: buildProfileTable(rows),
    nonRnPresidential: transfers.nonRnPresidential,
    fidelityA: fidMacron,
    fidelityB: fidLePen,
    candidatesById: byId,
    firstRoundTurnout: (ref.voters / ref.registered) * 100,
    blankNullShare: (ref.voters - ref.expressed) / ref.voters,
    abstainerMobilization: 0.225,
    abstainerAntiRnShare: null,
    secondRoundPolls: [],
  })
  return res.pct.a
}

function getFinalistFidelities(
  year: '2017' | '2022',
  mode: P2FidelityMode,
  transfers: TransfersData,
  matrices: SecondRoundReferenceMatricesData,
): { fidMacron: FidelitySplit; fidLePen: FidelitySplit } {
  if (mode === 's3_neutral') {
    return { fidMacron: { ...transfers.fidelity.default }, fidLePen: { ...transfers.fidelity.default } }
  }
  if (mode === 'harris_2026') {
    return {
      fidMacron: { loyal: 95, cross: 1.5, abstention: 3.5 },
      fidLePen: { loyal: 96, cross: 1, abstention: 3 },
    }
  }
  const variant = mode === 'r2_5_r1_7' ? 'r1_7_r1_1' : 'r1_1'
  const resolved = resolveReferenceRows(
    matrices.rows[year],
    matrices.surveys,
    variant,
    matrices.participation[year].abstentionPctByCandidate,
  )
  const m = resolved.find((r) => r.candidateId === 'macron')!.row
  const l = resolved.find((r) => r.candidateId === 'lepen')!.row
  return {
    fidMacron: { loyal: m.antiRn, cross: m.rn, abstention: m.nonExpressed },
    fidLePen: { loyal: l.rn, cross: l.antiRn, abstention: l.nonExpressed },
  }
}

function closestPresetFor(s: number): 'pres2022' | 'midpoint' | 'leg2024' {
  const d0 = Math.abs(s - 0)
  const d05 = Math.abs(s - 0.5)
  const d1 = Math.abs(s - 1)
  if (d0 <= d05 && d0 <= d1) return 'pres2022'
  if (d05 <= d1) return 'midpoint'
  return 'leg2024'
}

/** Résout la position s_2017 sur l'échelle logit 2022 (0) ↔ 2024 (1) reproduisant le résultat 2017. */
export function solveS2017(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  fidelityMode: P2FidelityMode,
  edMode: P2EdMode,
): S2017Estimate {
  const ref17 = data.reference2017
  const actual2017Pct = actualMacronPct(ref17)
  const { fidMacron, fidLePen } = getFinalistFidelities('2017', fidelityMode, data.transfers, matrices)
  const edRow: TransferValues =
    edMode === 'measured_2017'
      ? { ...data.transfers.presidentialCenterRn.elections['2017'].extreme_droite }
      : { ...data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows.extreme_droite }
  const centreRow: TransferValues = { ...data.transfers.presidentialCenterRn.elections['2017'].centre }

  const evalAt = (s: number): number => {
    const rows: Record<Bloc, TransferValues> = {
      gauche: interpolate2022To2024LogitUnbounded(data.transfers, 'gauche', s),
      centre: centreRow,
      droite: interpolate2022To2024LogitUnbounded(data.transfers, 'droite', s),
      extreme_droite: edRow,
    }
    return evalPresidentialOnRows(ref17, data.transfers, rows, fidMacron, fidLePen)
  }

  // Balayage fin sur [-1 ; 3] pour repérer le premier croisement et le pic (droite 2024 a un dr > df au-delà de s ≈ 1,8)
  let bracket: [number, number] | null = null
  let peak = { s: -1, pred: evalAt(-1) }
  let prevS = -1
  let prevVal = peak.pred
  const step = 0.02
  for (let s = -1 + step; s <= 3 + 1e-9; s += step) {
    const val = evalAt(s)
    if (val > peak.pred) peak = { s, pred: val }
    if (!bracket && prevVal <= actual2017Pct && val >= actual2017Pct) {
      bracket = [prevS, s]
    }
    prevS = s
    prevVal = val
  }

  let s2017: number | null = null
  let predAtS2017: number | null = null
  if (bracket) {
    let [lo, hi] = bracket
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2
      if (evalAt(mid) < actual2017Pct) lo = mid
      else hi = mid
    }
    s2017 = (lo + hi) / 2
    predAtS2017 = evalAt(s2017)
  }

  const effS = s2017 ?? peak.s
  return {
    fidelityMode,
    edMode,
    fidMacron,
    fidLePen,
    edRow,
    actual2017Pct,
    predAt0: evalAt(0),
    predAt05: evalAt(0.5),
    predAt1: evalAt(1),
    s2017,
    predAtS2017,
    peakOnGrid: peak,
    closestPreset: closestPresetFor(effS),
    r22Default: effS < 0.25 ? 'pres2022' : 'uncertain',
    scaleBounds: [Math.min(0, effS), Math.max(1, effS)],
  }
}

function buildAllAnchors(transfers: TransfersData, s2017: number): AnchorPoint[] {
  const ens24 = transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const ens22 = transfers.presidentialCenterRn.elections['2022']
  const ens17 = transfers.presidentialCenterRn.elections['2017']
  return [
    { id: '2022', position: 0, rows: { gauche: { ...ens22.gauche }, droite: { ...ens22.droite } } },
    { id: '2017', position: s2017, rows: { gauche: { ...ens17.gauche }, droite: { ...ens17.droite } } },
    { id: '2024', position: 1, rows: { gauche: { ...ens24.gauche }, droite: { ...ens24.droite } } },
  ]
}

function evalLooYear(
  year: '2017' | '2022',
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  allAnchors: AnchorPoint[],
  fidelityMode: P2FidelityMode,
  edRow: TransferValues,
): LooYearResult {
  const ref = year === '2017' ? data.reference2017 : data.reference2022
  const actualAntiRn = actualMacronPct(ref)
  const kept = allAnchors.filter((a) => a.id !== year).sort((a, b) => a.position - b.position)
  const span: [number, number] = [kept[0]!.position, kept[kept.length - 1]!.position]
  const { fidMacron, fidLePen } = getFinalistFidelities(year, fidelityMode, data.transfers, matrices)
  const centreRow: TransferValues = { ...data.transfers.presidentialCenterRn.elections[year].centre }

  const evalAt = (s: number): number => {
    const rows: Record<Bloc, TransferValues> = {
      gauche: interpolateAnchorsPiecewiseLogit(kept, 'gauche', s),
      centre: centreRow,
      droite: interpolateAnchorsPiecewiseLogit(kept, 'droite', s),
      extreme_droite: edRow,
    }
    return evalPresidentialOnRows(ref, data.transfers, rows, fidMacron, fidLePen)
  }

  const byAnchor: Record<string, { pred: number; err: number }> = {}
  for (const a of kept) {
    const pred = evalAt(a.position)
    byAnchor[a.id] = { pred, err: pred - actualAntiRn }
  }

  const midPos = (span[0] + span[1]) / 2
  const midPred = evalAt(midPos)

  const N = 101
  const gridPreds: number[] = []
  for (let i = 0; i < N; i++) {
    const s = span[0] + ((span[1] - span[0]) * i) / (N - 1)
    gridPreds.push(evalAt(s))
  }
  const meanPred = gridPreds.reduce((acc, v) => acc + v, 0) / gridPreds.length

  return {
    year,
    actualAntiRn,
    availableAnchors: kept.map((a) => a.id),
    span,
    byAnchor,
    uncertainMidpoint: { position: midPos, pred: midPred, err: midPred - actualAntiRn },
    uncertainMean: {
      pred: meanPred,
      err: meanPred - actualAntiRn,
      min: Math.min(...gridPreds),
      max: Math.max(...gridPreds),
    },
  }
}

function buildScenarioSummary(
  label: string,
  s2017: number,
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
): AnchorScenarioSummary {
  const anchors = buildAllAnchors(data.transfers, s2017)
  const ens24 = data.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const pooledEd = ens24.extreme_droite
  const ed17 = data.transfers.presidentialCenterRn.elections['2017'].extreme_droite
  const ed22 = data.transfers.presidentialCenterRn.elections['2022'].extreme_droite
  const centre17 = data.transfers.presidentialCenterRn.elections['2017'].centre
  const centre22 = data.transfers.presidentialCenterRn.elections['2022'].centre
  const s3Fid = data.transfers.fidelity.default

  const samplePositions = Array.from(
    new Set([Math.min(0, s2017), 0, 0.25, 0.5, s2017, 1, Math.max(1, s2017)]),
  ).sort((a, b) => a - b)

  const samples = samplePositions.map((s) => {
    const gauche = interpolateAnchorsPiecewiseLogit(anchors, 'gauche', s)
    const droite = interpolateAnchorsPiecewiseLogit(anchors, 'droite', s)
    const rows17: Record<Bloc, TransferValues> = { gauche, centre: centre17, droite, extreme_droite: pooledEd }
    const rows22: Record<Bloc, TransferValues> = { gauche, centre: centre22, droite, extreme_droite: pooledEd }
    return {
      s,
      gauche,
      droite,
      pred2017Neutral: evalPresidentialOnRows(data.reference2017, data.transfers, rows17, s3Fid, s3Fid),
      pred2022Neutral: evalPresidentialOnRows(data.reference2022, data.transfers, rows22, s3Fid, s3Fid),
    }
  })

  for (const s of samples) {
    for (const b of ['gauche', 'droite'] as const) {
      const r = s[b]
      const sum = r.finalist + r.rn + r.abstention
      if (Math.abs(sum - 100) > 1e-6) {
        throw new Error(`Conservation violée pour ${b} à s=${s.s}: ${sum}`)
      }
    }
  }

  return {
    label,
    s2017,
    anchors,
    samples,
    leaveOneOut: {
      s3Neutral_s4PooledEd: {
        '2017': evalLooYear('2017', data, matrices, anchors, 's3_neutral', pooledEd),
        '2022': evalLooYear('2022', data, matrices, anchors, 's3_neutral', pooledEd),
      },
      s3Neutral_crossEd: {
        '2017': evalLooYear('2017', data, matrices, anchors, 's3_neutral', ed22),
        '2022': evalLooYear('2022', data, matrices, anchors, 's3_neutral', ed17),
      },
      r25Measured_ownEd: {
        '2017': evalLooYear('2017', data, matrices, anchors, 'r2_5_r1_1', ed17),
        '2022': evalLooYear('2022', data, matrices, anchors, 'r2_5_r1_1', ed22),
      },
    },
  }
}

export function evaluateP2Report(data: SimulationData, matrices: SecondRoundReferenceMatricesData): P2Report {
  const modes: P2FidelityMode[] = ['r2_5_r1_1', 'r2_5_r1_7', 's3_neutral', 'harris_2026']
  const edModes: P2EdMode[] = ['measured_2017', 's4_pooled']
  const estimates: S2017Estimate[] = []
  for (const fm of modes) {
    for (const em of edModes) {
      estimates.push(solveS2017(data, matrices, fm, em))
    }
  }

  const r25Meas = estimates.find((e) => e.fidelityMode === 'r2_5_r1_1' && e.edMode === 'measured_2017')!
  const r25Pool = estimates.find((e) => e.fidelityMode === 'r2_5_r1_1' && e.edMode === 's4_pooled')!
  const p1Bis = computeP1BisReport(data, matrices)
  void BLOCS

  return {
    estimates,
    scenarios: {
      r25MeasuredEd: buildScenarioSummary('R2.5 + ED mesurée 2017 (front pur)', r25Meas.s2017!, data, matrices),
      r25PooledEd: buildScenarioSummary('R2.5 + ED S4 moyennée (moteur P1-bis)', r25Pool.s2017!, data, matrices),
    },
    r14BisCheck: p1Bis.r14Bis,
  }
}
