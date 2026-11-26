import { historicalBloc } from './backtest'
import type { BacktestReport } from './backtest'
import {
  CURRENT_ANTI_RN_SHARE,
  CURRENT_MOBILIZATION,
  TRANSPOSED_CENTER_ROW,
  checkR12Tolerance,
  computeR19BlocRows,
} from './secondRoundDegradation'
import type { R12ToleranceCheck } from './secondRoundDegradation'
import { reproduceReferenceElection, resolveReferenceRows } from './secondRoundReproduction'
import type { ReproductionVariant } from './secondRoundReproduction'
import { computeStep3Report, evalLeg2024WithAbstainersV22 } from './secondRoundStep3'
import type {
  Bloc,
  CandidateId,
  FidelitySplit,
  ProfileId,
  Reference2017,
  Reference2022,
  ReferenceMatrixYear,
  ReferenceTransferTriplet,
  SecondRoundReferenceMatricesData,
  SimulationData,
  TransferValues,
} from './types'

/** Défaut S1 (arrondi au demi-point de la moyenne Insee ajustée 2017–2022 : 22,46 %). */
export const P1_BIS_DEFAULT_MOBILIZATION = 0.225

/** Seuils pré-enregistrés le 26/11/2026 (docs/changelog-methode.md, R1.2-bis et R1.4-bis). */
export const R12_BIS_STRICT_TOL_PTS = 1.0
export const R12_BIS_NEUTRAL_SHARE_TOL_PTS = 2.0
export const R12_BIS_NEUTRAL_VOL_TOL_PTS = 1.5
export const R14_BIS_MAX_SIGNED_BIAS_PTS = 1.5
export const R14_BIS_LEG2024_MAX_MAE_PTS = 1.0
export const R14_BIS_LEG2024_MAX_PROFILE_DEGRADATION_PTS = 0.5

export interface SurveyAdmissibilityEntry {
  surveyId: string
  year: ReferenceMatrixYear
  institute: string
  feasible: boolean
  violations: string[]
  residualRnVotes: number
}

export interface InseeAdjustedMobilization {
  year2017: number
  year2022: number
  mean: number
  roundedDefault: number
}

export interface P1BisPresidentialEval {
  year: ReferenceMatrixYear
  predictedAntiRnPct: number
  actualAntiRnPct: number
  errorPts: number
  totals: { a: number; b: number; nonExpressed: number }
  expressed2: number
  actual: { antiRnPct: number; antiRnVolumePct: number; rnVolumePct: number; expressed2VolumePct: number }
  errVolA: number
  errVolB: number
  errExpr2: number
  /** Part endogène neutre q appliquée aux non-exprimés du 1er tour (%). */
  endogenousQPct: number
}

export interface CrossMetricsSummary {
  err2017: number
  err2022: number
  signedBiasPts: number
  absSignedBiasPts: number
  oppositeSigns: boolean
  worstAbsErrorPts: number
  rmsePts: number
  maePts: number
}

export interface P1BisLeg2024Row {
  profileId: ProfileId
  actualPct: number
  baselinePct: number
  baselineGapPts: number
  candidatePct: number
  candidateGapPts: number
  absDegradationPts: number
  actualNetDropout: number
  candidateNetDropout: number
}

export interface P1Bis2012Diagnostic {
  predictedHollandePct: number
  actualHollandePct: number
  errorPts: number
  predictedExpressed2Pct: number
  actualExpressed2Pct: number
  predictedNetDropout: number
  actualNetDropout: number
}

export interface P1BisVariantBlock {
  label: string
  inSampleStrictMeasuredFid: Record<ReferenceMatrixYear, { eval: P1BisPresidentialEval; check: R12ToleranceCheck }>
  inSampleNeutral: Record<ReferenceMatrixYear, P1BisPresidentialEval>
  inSampleNeutralPooledEd: Record<ReferenceMatrixYear, P1BisPresidentialEval>
  crossNeutral: {
    eval2017: P1BisPresidentialEval
    eval2022: P1BisPresidentialEval
    metrics: CrossMetricsSummary
  }
  crossDiagnosticMeasuredFid: {
    eval2017: P1BisPresidentialEval
    eval2022: P1BisPresidentialEval
    metrics: CrossMetricsSummary
  }
}

export interface P1BisReport {
  admissibility: SurveyAdmissibilityEntry[]
  admissibleSurveyIds: string[]
  excludedSurveyIds: string[]
  inseeMobilization: InseeAdjustedMobilization
  symmetricFidelity: FidelitySplit
  admissibleEdRow: {
    row2017: TransferValues
    row2022: TransferValues
    pooled: TransferValues
  }
  admissibleBlocRows: Record<ReferenceMatrixYear, Record<Bloc, TransferValues>>
  baseline: {
    inSampleErr2017: number
    inSampleErr2022: number
    cross: CrossMetricsSummary
    leg2024MaePts: number
    leg2024MaxAbsGapPts: number
  }
  /** Évaluation principale (S1 + S2 + S3 + S4 + S5 : enquêtes admissibles R1.8). */
  primary: P1BisVariantBlock
  /** Variantes diagnostiques (jamais retenues pour contourner un critère). */
  diagnosticVariants: {
    r1_1: P1BisVariantBlock
    r1_7_r1_1: P1BisVariantBlock
  }
  leg2024: {
    rows: P1BisLeg2024Row[]
    maePts: number
    maxAbsGapPts: number
    maxAbsDegradationPts: number
  }
  diagnostic2012: P1Bis2012Diagnostic
  r12Bis: {
    strictMeasured2017Ok: boolean
    strictMeasured2022Ok: boolean
    strictAccountingPassed: boolean
    neutral2017Ok: boolean
    neutral2022Ok: boolean
    neutralImprovedBothYears: boolean
    neutralPassed: boolean
    passed: boolean
  }
  r14Bis: {
    signedBiasUnder15AndOpposite: boolean
    worstCrossReduced: boolean
    crossRmseNotDegraded: boolean
    leg2024Ok: boolean
    passed: boolean
  }
  overallPassed: boolean
}

const toTransferValues = (t: ReferenceTransferTriplet): TransferValues => ({
  finalist: t.antiRn,
  rn: t.rn,
  abstention: t.nonExpressed,
})

const toTriplet = (v: TransferValues): ReferenceTransferTriplet => ({
  antiRn: v.finalist,
  rn: v.rn,
  nonExpressed: v.abstention,
})

function summarizeCross(err2017: number, err2022: number): CrossMetricsSummary {
  const signedBiasPts = (err2017 + err2022) / 2
  return {
    err2017,
    err2022,
    signedBiasPts,
    absSignedBiasPts: Math.abs(signedBiasPts),
    oppositeSigns: err2017 * err2022 < 0,
    worstAbsErrorPts: Math.max(Math.abs(err2017), Math.abs(err2022)),
    rmsePts: Math.sqrt((err2017 * err2017 + err2022 * err2022) / 2),
    maePts: (Math.abs(err2017) + Math.abs(err2022)) / 2,
  }
}

/**
 * S5 (R1.1-bis) : évalue chaque enquête individuellement par le contrôle de réalisabilité comptable R1.8
 * avant tout calcul sur le moteur.
 */
export function evaluateSurveyAdmissibility(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
): SurveyAdmissibilityEntry[] {
  return matrices.surveys.map((survey) => {
    const year = String(survey.year) as ReferenceMatrixYear
    const ref = year === '2017' ? data.reference2017 : data.reference2022
    const variant: ReproductionVariant = survey.institute === 'Ipsos Sopra Steria' ? 'ipsos_only' : 'ifop_only'
    const rep = reproduceReferenceElection(year, ref, matrices, variant)
    return {
      surveyId: survey.id,
      year,
      institute: survey.institute,
      feasible: rep.feasibility.feasible,
      violations: rep.feasibility.violations,
      residualRnVotes: rep.residual.rn,
    }
  })
}

/**
 * S1 : calcule le taux de mobilisation administratif Insee ajusté du taux national de blancs et nuls du 2nd tour
 * directement depuis `second-round-dropout.json` et `reference-2017/2022.json`.
 */
export function computeInseeAdjustedMobilization(data: SimulationData): InseeAdjustedMobilization {
  const inseeByYear = new Map(data.secondRoundDropout.newVoters.insee.map((entry) => [entry.year, entry]))
  const adjustedFor = (year: 2017 | 2022, ref: Reference2017 | Reference2022) => {
    const entry = inseeByYear.get(year)
    if (!entry) throw new Error(`Mesure Insee absente pour ${year}`)
    const abstainersInsee = 100 - entry.bothRounds - entry.firstOnly
    const rawShare = entry.secondOnly / abstainersInsee
    const bn2Rate = (ref.secondRound.voters - ref.secondRound.expressed) / ref.secondRound.voters
    return rawShare * (1 - bn2Rate)
  }
  const year2017 = adjustedFor(2017, data.reference2017)
  const year2022 = adjustedFor(2022, data.reference2022)
  const mean = (year2017 + year2022) / 2
  return {
    year2017,
    year2022,
    mean,
    roundedDefault: P1_BIS_DEFAULT_MOBILIZATION,
  }
}

/**
 * Résout les lignes d'une année en ne moyennant que les enquêtes contenues dans `allowedSurveyIds`.
 * Les candidats non couverts par aucune enquête autorisée (ex. finalistes en 2017 si `ifop_2017` est exclue)
 * sont omis de la map retournée.
 */
export function resolveFilteredRows(
  year: ReferenceMatrixYear,
  matrices: SecondRoundReferenceMatricesData,
  allowedSurveyIds: ReadonlySet<string>,
): Map<CandidateId, ReferenceTransferTriplet> {
  const out = new Map<CandidateId, ReferenceTransferTriplet>()
  for (const entry of matrices.rows[year]) {
    const rows: ReferenceTransferTriplet[] = []
    for (const [surveyId, triplet] of Object.entries(entry.bySurvey)) {
      if (triplet !== null && allowedSurveyIds.has(surveyId)) rows.push(triplet)
    }
    if (rows.length === 0) continue
    const n = rows.length
    out.set(entry.candidateId, {
      antiRn: rows.reduce((s, r) => s + r.antiRn, 0) / n,
      rn: rows.reduce((s, r) => s + r.rn, 0) / n,
      nonExpressed: rows.reduce((s, r) => s + r.nonExpressed, 0) / n,
    })
  }
  return out
}

/**
 * S3 : calcule la fidélité symétrique neutre « jour du vote » à partir des seuls finalistes publiés dans les
 * enquêtes présidentielles admissibles R1.8 (`ipsos_2022` et `ifop_2022`).
 */
export function computeSymmetricDayOfVoteFidelity(
  matrices: SecondRoundReferenceMatricesData,
  admissibleSurveyIds: ReadonlySet<string>,
): FidelitySplit {
  const splits: FidelitySplit[] = []
  for (const year of ['2017', '2022'] as const) {
    const resolved = resolveFilteredRows(year, matrices, admissibleSurveyIds)
    const antiRn = resolved.get('macron')
    const rn = resolved.get('lepen')
    if (antiRn) splits.push({ loyal: antiRn.antiRn, cross: antiRn.rn, abstention: antiRn.nonExpressed })
    if (rn) splits.push({ loyal: rn.rn, cross: rn.antiRn, abstention: rn.nonExpressed })
  }
  if (splits.length === 0) throw new Error('Aucune ligne finaliste admissible disponible pour S3')
  const n = splits.length
  return {
    loyal: splits.reduce((s, f) => s + f.loyal, 0) / n,
    cross: splits.reduce((s, f) => s + f.cross, 0) / n,
    abstention: splits.reduce((s, f) => s + f.abstention, 0) / n,
  }
}

/**
 * Évalue une élection présidentielle (2017 ou 2022) avec la structure P1-bis :
 * - S1 : `nonExpressed1 = abstention1 + blankNull1`, mobilisation `a` ;
 * - S2 : orientation endogène neutre `q = r1ToA / (r1ToA + r1ToB)` (`Δq = 0`) ;
 * - identité comptable exacte : `totals.a + totals.b + totals.nonExpressed = 100`.
 */
export function evaluateP1BisPresidential(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  blocRows: Record<Bloc, TransferValues>,
  options: {
    candidateRowOverrides?: ReadonlyMap<CandidateId, ReferenceTransferTriplet>
    fidelityAntiRn: FidelitySplit
    fidelityRn: FidelitySplit
    mobilization?: number
  },
): P1BisPresidentialEval {
  const mob = options.mobilization ?? P1_BIS_DEFAULT_MOBILIZATION
  const expressed1Pct = (100 * ref.expressed) / ref.registered
  const nonExpressed1Pct = 100 - expressed1Pct

  let r1ToA = 0
  let r1ToB = 0
  let r1NonExpr = 0

  for (const c of ref.candidates) {
    const share = (100 * c.votes) / ref.registered
    let row: ReferenceTransferTriplet
    if (c.id === 'macron') {
      row = {
        antiRn: options.fidelityAntiRn.loyal,
        rn: options.fidelityAntiRn.cross,
        nonExpressed: options.fidelityAntiRn.abstention,
      }
    } else if (c.id === 'lepen') {
      row = {
        antiRn: options.fidelityRn.cross,
        rn: options.fidelityRn.loyal,
        nonExpressed: options.fidelityRn.abstention,
      }
    } else {
      row = options.candidateRowOverrides?.get(c.id) ?? toTriplet(blocRows[historicalBloc(c.id)])
    }
    r1ToA += (share * row.antiRn) / 100
    r1ToB += (share * row.rn) / 100
    r1NonExpr += (share * row.nonExpressed) / 100
  }

  const r1Expr2 = r1ToA + r1ToB
  const qA = r1Expr2 > 0 ? r1ToA / r1Expr2 : 0.5
  const newVoters = nonExpressed1Pct * mob
  const totals = {
    a: r1ToA + newVoters * qA,
    b: r1ToB + newVoters * (1 - qA),
    nonExpressed: r1NonExpr + (nonExpressed1Pct - newVoters),
  }
  const expressed2 = totals.a + totals.b
  const predictedAntiRnPct = expressed2 > 0 ? (100 * totals.a) / expressed2 : 50

  const actualMacron = ref.secondRound.candidates.find((c) => c.id === 'macron')!.votes
  const actualLePen = ref.secondRound.candidates.find((c) => c.id === 'lepen')!.votes
  const actual = {
    antiRnPct: (100 * actualMacron) / ref.secondRound.expressed,
    antiRnVolumePct: (100 * actualMacron) / ref.secondRound.registered,
    rnVolumePct: (100 * actualLePen) / ref.secondRound.registered,
    expressed2VolumePct: (100 * ref.secondRound.expressed) / ref.secondRound.registered,
  }

  return {
    year,
    predictedAntiRnPct,
    actualAntiRnPct: actual.antiRnPct,
    errorPts: predictedAntiRnPct - actual.antiRnPct,
    totals,
    expressed2,
    actual,
    errVolA: totals.a - actual.antiRnVolumePct,
    errVolB: totals.b - actual.rnVolumePct,
    errExpr2: expressed2 - actual.expressed2VolumePct,
    endogenousQPct: qA * 100,
  }
}

function buildBlocRowsForVariant(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  matrices: SecondRoundReferenceMatricesData,
  mode: { kind: 'admissible'; allowed: ReadonlySet<string> } | { kind: 'variant'; variant: ReproductionVariant },
): {
  candidateRows: Map<CandidateId, ReferenceTransferTriplet>
  blocRows: Record<Bloc, TransferValues>
  measuredFids: { fidelityAntiRn: FidelitySplit; fidelityRn: FidelitySplit }
} {
  let candidateRows: Map<CandidateId, ReferenceTransferTriplet>
  let measuredFids: { fidelityAntiRn: FidelitySplit; fidelityRn: FidelitySplit }

  if (mode.kind === 'admissible') {
    candidateRows = resolveFilteredRows(year, matrices, mode.allowed)
    // Pour le contrôle comptable strict avec fidélités mesurées de l'année : en 2017, `ipsos_2017`
    // ne publie pas les lignes finalistes (`null`), donc le contrôle diagnostique prend les seules lignes
    // finalistes publiées (`ifop_2017`) via `ipsos_only` (repli signalé).
    const withFinFallback = new Map(
      resolveReferenceRows(matrices.rows[year], matrices.surveys, year === '2017' ? 'ipsos_only' : 'r1_1').map((r) => [
        r.candidateId,
        r.row,
      ]),
    )
    const m = candidateRows.get('macron') ?? withFinFallback.get('macron')!
    const l = candidateRows.get('lepen') ?? withFinFallback.get('lepen')!
    measuredFids = {
      fidelityAntiRn: { loyal: m.antiRn, cross: m.rn, abstention: m.nonExpressed },
      fidelityRn: { loyal: l.rn, cross: l.antiRn, abstention: l.nonExpressed },
    }
  } else {
    const resolved = resolveReferenceRows(
      matrices.rows[year],
      matrices.surveys,
      mode.variant,
      matrices.participation[year].abstentionPctByCandidate,
    )
    candidateRows = new Map(resolved.map((r) => [r.candidateId, r.row]))
    const m = candidateRows.get('macron')!
    const l = candidateRows.get('lepen')!
    measuredFids = {
      fidelityAntiRn: { loyal: m.antiRn, cross: m.rn, abstention: m.nonExpressed },
      fidelityRn: { loyal: l.rn, cross: l.antiRn, abstention: l.nonExpressed },
    }
  }

  const r19 = computeR19BlocRows(ref, candidateRows)
  const blocRows: Record<Bloc, TransferValues> = {
    gauche: toTransferValues(r19.gauche),
    centre: toTransferValues(TRANSPOSED_CENTER_ROW),
    droite: toTransferValues(r19.droite),
    extreme_droite: toTransferValues(r19.extreme_droite),
  }

  return { candidateRows, blocRows, measuredFids }
}

function evaluateVariantBlock(
  label: string,
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  symmetricFidelity: FidelitySplit,
  mode: { kind: 'admissible'; allowed: ReadonlySet<string> } | { kind: 'variant'; variant: ReproductionVariant },
): P1BisVariantBlock {
  const b17 = buildBlocRowsForVariant('2017', data.reference2017, matrices, mode)
  const b22 = buildBlocRowsForVariant('2022', data.reference2022, matrices, mode)

  const pooledEd: TransferValues = {
    finalist: (b17.blocRows.extreme_droite.finalist + b22.blocRows.extreme_droite.finalist) / 2,
    rn: (b17.blocRows.extreme_droite.rn + b22.blocRows.extreme_droite.rn) / 2,
    abstention: (b17.blocRows.extreme_droite.abstention + b22.blocRows.extreme_droite.abstention) / 2,
  }

  // 1. Contrôle comptable strict (lignes par candidat couvert + R1.9 + fidélités mesurées de l'année)
  const strict17 = evaluateP1BisPresidential('2017', data.reference2017, b17.blocRows, {
    candidateRowOverrides: b17.candidateRows,
    ...b17.measuredFids,
  })
  const strict22 = evaluateP1BisPresidential('2022', data.reference2022, b22.blocRows, {
    candidateRowOverrides: b22.candidateRows,
    ...b22.measuredFids,
  })

  // 2. Moteur neutre en échantillon (lignes de bloc de l'année + fidélité symétrique S3)
  const neutral17 = evaluateP1BisPresidential('2017', data.reference2017, b17.blocRows, {
    fidelityAntiRn: symmetricFidelity,
    fidelityRn: symmetricFidelity,
  })
  const neutral22 = evaluateP1BisPresidential('2022', data.reference2022, b22.blocRows, {
    fidelityAntiRn: symmetricFidelity,
    fidelityRn: symmetricFidelity,
  })

  // 3. Contrôle informatif : en échantillon avec ligne ED poolée
  const pooled17 = evaluateP1BisPresidential(
    '2017',
    data.reference2017,
    { ...b17.blocRows, extreme_droite: pooledEd },
    { fidelityAntiRn: symmetricFidelity, fidelityRn: symmetricFidelity },
  )
  const pooled22 = evaluateP1BisPresidential(
    '2022',
    data.reference2022,
    { ...b22.blocRows, extreme_droite: pooledEd },
    { fidelityAntiRn: symmetricFidelity, fidelityRn: symmetricFidelity },
  )

  // 4. Croisé strict (lignes de bloc de l'autre année, y compris sa ligne ED hors finaliste, fidélité symétrique S3)
  const cross17 = evaluateP1BisPresidential('2017', data.reference2017, b22.blocRows, {
    fidelityAntiRn: symmetricFidelity,
    fidelityRn: symmetricFidelity,
  })
  const cross22 = evaluateP1BisPresidential('2022', data.reference2022, b17.blocRows, {
    fidelityAntiRn: symmetricFidelity,
    fidelityRn: symmetricFidelity,
  })

  // 5. Croisé diagnostique avec fidélités mesurées de l'année évaluée
  const crossDiag17 = evaluateP1BisPresidential('2017', data.reference2017, b22.blocRows, b17.measuredFids)
  const crossDiag22 = evaluateP1BisPresidential('2022', data.reference2022, b17.blocRows, b22.measuredFids)

  return {
    label,
    inSampleStrictMeasuredFid: {
      '2017': {
        eval: strict17,
        check: checkR12Tolerance(
          { antiRnPct: strict17.predictedAntiRnPct, antiRnVolumePct: strict17.totals.a, rnVolumePct: strict17.totals.b },
          strict17.actual,
          R12_BIS_STRICT_TOL_PTS,
        ),
      },
      '2022': {
        eval: strict22,
        check: checkR12Tolerance(
          { antiRnPct: strict22.predictedAntiRnPct, antiRnVolumePct: strict22.totals.a, rnVolumePct: strict22.totals.b },
          strict22.actual,
          R12_BIS_STRICT_TOL_PTS,
        ),
      },
    },
    inSampleNeutral: { '2017': neutral17, '2022': neutral22 },
    inSampleNeutralPooledEd: { '2017': pooled17, '2022': pooled22 },
    crossNeutral: {
      eval2017: cross17,
      eval2022: cross22,
      metrics: summarizeCross(cross17.errorPts, cross22.errorPts),
    },
    crossDiagnosticMeasuredFid: {
      eval2017: crossDiag17,
      eval2022: crossDiag22,
      metrics: summarizeCross(crossDiag17.errorPts, crossDiag22.errorPts),
    },
  }
}

function evaluateLeg2024P1Bis(
  data: SimulationData,
  symmetricFidelity: FidelitySplit,
  baselineLeg2024: Record<ProfileId, number>,
): P1BisReport['leg2024'] {
  const legTurnout2024 = 66.7
  const legBnShare2024 =
    (data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound -
      data.secondRoundDropout.newVoters.legislatives2024.expressedFirstRound) /
    data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound
  const expr1Pct = legTurnout2024 * (1 - legBnShare2024)
  const nonExpr1Pct = 100 - expr1Pct

  const rows: P1BisLeg2024Row[] = data.transfers.profiles.map((profile) => {
    const agg = data.secondRoundDropout.legislatives2024.profiles[profile.id]
    const total1 = Object.values(agg.firstRoundVotesByBloc).reduce((s, v) => s + v, 0)
    const finalistBloc = agg.finalistBlocs.find((b) => b !== 'extreme_droite')!
    const actualFinalistPct = (100 * agg.secondRoundVotes.finalist) / agg.secondRoundExpressed
    const actualNetDropout = 100 * (1 - agg.secondRoundExpressed / agg.firstRoundExpressed)
    const baselinePct = baselineLeg2024[profile.id]
    const baselineGapPts = baselinePct - actualFinalistPct

    let r1ToA = 0
    let r1ToB = 0
    for (const [b, v] of Object.entries(agg.firstRoundVotesByBloc) as [Bloc, number][]) {
      const share = (v / total1) * expr1Pct
      if (b === finalistBloc) {
        r1ToA += (share * symmetricFidelity.loyal) / 100
        r1ToB += (share * symmetricFidelity.cross) / 100
      } else if (b === 'extreme_droite') {
        r1ToA += (share * symmetricFidelity.cross) / 100
        r1ToB += (share * symmetricFidelity.loyal) / 100
      } else {
        const row = profile.rows[b]
        r1ToA += (share * row.finalist) / 100
        r1ToB += (share * row.rn) / 100
      }
    }

    const qA = r1ToA + r1ToB > 0 ? r1ToA / (r1ToA + r1ToB) : 0.5
    const nv = nonExpr1Pct * P1_BIS_DEFAULT_MOBILIZATION
    const fA = r1ToA + nv * qA
    const fB = r1ToB + nv * (1 - qA)
    const expr2 = fA + fB
    const candidatePct = expr2 > 0 ? (100 * fA) / expr2 : 50
    const candidateGapPts = candidatePct - actualFinalistPct

    return {
      profileId: profile.id,
      actualPct: actualFinalistPct,
      baselinePct,
      baselineGapPts,
      candidatePct,
      candidateGapPts,
      absDegradationPts: Math.abs(candidateGapPts) - Math.abs(baselineGapPts),
      actualNetDropout,
      candidateNetDropout: 100 * (1 - expr2 / expr1Pct),
    }
  })

  return {
    rows,
    maePts: rows.reduce((s, r) => s + Math.abs(r.candidateGapPts), 0) / rows.length,
    maxAbsGapPts: Math.max(...rows.map((r) => Math.abs(r.candidateGapPts))),
    maxAbsDegradationPts: Math.max(...rows.map((r) => r.absDegradationPts)),
  }
}

function evaluate2012Diagnostic(data: SimulationData, symmetricFidelity: FidelitySplit): P1Bis2012Diagnostic {
  const ref12 = data.reference2012
  const p12 = data.secondRoundDropout.presidential.elections.find((e) => e.year === 2012)!
  const expr1Pct = (100 * ref12.expressed) / ref12.registered
  const nonExpr1Pct = 100 - expr1Pct

  let r1ToA = 0
  let r1ToB = 0
  for (const c of ref12.candidates) {
    const share = (100 * c.votes) / ref12.registered
    if (c.id === 'hollande') {
      r1ToA += (share * symmetricFidelity.loyal) / 100
      r1ToB += (share * symmetricFidelity.cross) / 100
    } else if (c.id === 'sarkozy') {
      r1ToA += (share * symmetricFidelity.cross) / 100
      r1ToB += (share * symmetricFidelity.loyal) / 100
    } else {
      const row = data.transfers.nonRnPresidential.leftVsCenterRight[historicalBloc(c.id)]
      r1ToA += (share * row.left) / 100
      r1ToB += (share * row.right) / 100
    }
  }
  const qA = r1ToA + r1ToB > 0 ? r1ToA / (r1ToA + r1ToB) : 0.5
  const nv = nonExpr1Pct * P1_BIS_DEFAULT_MOBILIZATION
  const fA = r1ToA + nv * qA
  const fB = r1ToB + nv * (1 - qA)
  const expr2 = fA + fB
  const predictedHollandePct = (100 * fA) / expr2
  // Conseil constitutionnel, décision n° 2012-154 PDR : Hollande 18 000 668 / 34 861 353 = 51,6350 %
  const actualHollandePct = (100 * 18000668) / p12.secondRound.expressed
  return {
    predictedHollandePct,
    actualHollandePct,
    errorPts: predictedHollandePct - actualHollandePct,
    predictedExpressed2Pct: expr2,
    actualExpressed2Pct: (100 * p12.secondRound.expressed) / p12.secondRound.registered,
    predictedNetDropout: 100 * (1 - expr2 / expr1Pct),
    actualNetDropout: 100 * (1 - p12.secondRound.expressed / p12.firstRound.expressed),
  }
}

/** Exécute l'évaluation complète P1-bis (Option B, étape B2) sans modifier le moteur par défaut. */
export function computeP1BisReport(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  existingBacktest?: BacktestReport,
): P1BisReport {
  const admissibility = evaluateSurveyAdmissibility(data, matrices)
  const admissibleSurveyIds = admissibility.filter((a) => a.feasible).map((a) => a.surveyId)
  const excludedSurveyIds = admissibility.filter((a) => !a.feasible).map((a) => a.surveyId)
  const allowedSet = new Set(admissibleSurveyIds)

  const inseeMobilization = computeInseeAdjustedMobilization(data)
  const symmetricFidelity = computeSymmetricDayOfVoteFidelity(matrices, allowedSet)

  const b17Adm = buildBlocRowsForVariant('2017', data.reference2017, matrices, {
    kind: 'admissible',
    allowed: allowedSet,
  })
  const b22Adm = buildBlocRowsForVariant('2022', data.reference2022, matrices, {
    kind: 'admissible',
    allowed: allowedSet,
  })
  const admissibleEdRow = {
    row2017: b17Adm.blocRows.extreme_droite,
    row2022: b22Adm.blocRows.extreme_droite,
    pooled: {
      finalist: (b17Adm.blocRows.extreme_droite.finalist + b22Adm.blocRows.extreme_droite.finalist) / 2,
      rn: (b17Adm.blocRows.extreme_droite.rn + b22Adm.blocRows.extreme_droite.rn) / 2,
      abstention: (b17Adm.blocRows.extreme_droite.abstention + b22Adm.blocRows.extreme_droite.abstention) / 2,
    },
  }

  void existingBacktest
  const step3 = computeStep3Report(data, matrices)
  const baseCross = summarizeCross(step3.baseline.cross['2017'].errorPts, step3.baseline.cross['2022'].errorPts)
  const baselineLeg2024Preds = evalLeg2024WithAbstainersV22(data, CURRENT_MOBILIZATION, CURRENT_ANTI_RN_SHARE)
  const leg2024 = evaluateLeg2024P1Bis(data, symmetricFidelity, baselineLeg2024Preds)
  const baselineLeg2024Mae = leg2024.rows.reduce((s, r) => s + Math.abs(r.baselineGapPts), 0) / leg2024.rows.length
  const baselineLeg2024Max = Math.max(...leg2024.rows.map((r) => Math.abs(r.baselineGapPts)))

  const primary = evaluateVariantBlock(
    'Admissible S5 (2017: Ipsos, 2022: Ipsos+Ifop)',
    data,
    matrices,
    symmetricFidelity,
    { kind: 'admissible', allowed: allowedSet },
  )
  const diagR11 = evaluateVariantBlock('Diag. R1.1 (avec ifop_2017)', data, matrices, symmetricFidelity, {
    kind: 'variant',
    variant: 'r1_1',
  })
  const diagR17 = evaluateVariantBlock('Diag. R1.7 sur R1.1', data, matrices, symmetricFidelity, {
    kind: 'variant',
    variant: 'r1_7_r1_1',
  })

  const diagnostic2012 = evaluate2012Diagnostic(data, symmetricFidelity)

  const strict17Ok = primary.inSampleStrictMeasuredFid['2017'].check.passed
  const strict22Ok = primary.inSampleStrictMeasuredFid['2022'].check.passed
  const n17 = primary.inSampleNeutral['2017']
  const n22 = primary.inSampleNeutral['2022']
  const neutral2017Ok =
    Math.abs(n17.errorPts) <= R12_BIS_NEUTRAL_SHARE_TOL_PTS &&
    Math.abs(n17.errVolA) <= R12_BIS_NEUTRAL_VOL_TOL_PTS &&
    Math.abs(n17.errVolB) <= R12_BIS_NEUTRAL_VOL_TOL_PTS
  const neutral2022Ok =
    Math.abs(n22.errorPts) <= R12_BIS_NEUTRAL_SHARE_TOL_PTS &&
    Math.abs(n22.errVolA) <= R12_BIS_NEUTRAL_VOL_TOL_PTS &&
    Math.abs(n22.errVolB) <= R12_BIS_NEUTRAL_VOL_TOL_PTS
  const neutralImprovedBothYears =
    Math.abs(n17.errorPts) < Math.abs(step3.baseline.inSample['2017'].errorPts) &&
    Math.abs(n22.errorPts) < Math.abs(step3.baseline.inSample['2022'].errorPts)

  const r12Bis = {
    strictMeasured2017Ok: strict17Ok,
    strictMeasured2022Ok: strict22Ok,
    strictAccountingPassed: strict17Ok && strict22Ok,
    neutral2017Ok,
    neutral2022Ok,
    neutralImprovedBothYears,
    neutralPassed: neutral2017Ok && neutral2022Ok && neutralImprovedBothYears,
    passed: strict17Ok && strict22Ok && neutral2017Ok && neutral2022Ok && neutralImprovedBothYears,
  }

  const cm = primary.crossNeutral.metrics
  const signedBiasUnder15AndOpposite = cm.absSignedBiasPts <= R14_BIS_MAX_SIGNED_BIAS_PTS && cm.oppositeSigns
  const worstCrossReduced = cm.worstAbsErrorPts < baseCross.worstAbsErrorPts
  const crossRmseNotDegraded = cm.rmsePts <= baseCross.rmsePts + 1e-9
  const leg2024Ok =
    leg2024.maePts <= R14_BIS_LEG2024_MAX_MAE_PTS + 1e-9 &&
    leg2024.maxAbsDegradationPts <= R14_BIS_LEG2024_MAX_PROFILE_DEGRADATION_PTS + 1e-9

  const r14Bis = {
    signedBiasUnder15AndOpposite,
    worstCrossReduced,
    crossRmseNotDegraded,
    leg2024Ok,
    passed: signedBiasUnder15AndOpposite && worstCrossReduced && crossRmseNotDegraded && leg2024Ok,
  }

  return {
    admissibility,
    admissibleSurveyIds,
    excludedSurveyIds,
    inseeMobilization,
    symmetricFidelity,
    admissibleEdRow,
    admissibleBlocRows: { '2017': b17Adm.blocRows, '2022': b22Adm.blocRows },
    baseline: {
      inSampleErr2017: step3.baseline.inSample['2017'].errorPts,
      inSampleErr2022: step3.baseline.inSample['2022'].errorPts,
      cross: baseCross,
      leg2024MaePts: baselineLeg2024Mae,
      leg2024MaxAbsGapPts: baselineLeg2024Max,
    },
    primary,
    diagnosticVariants: { r1_1: diagR11, r1_7_r1_1: diagR17 },
    leg2024,
    diagnostic2012,
    r12Bis,
    r14Bis,
    overallPassed: r12Bis.passed && r14Bis.passed,
  }
}
