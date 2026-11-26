import { historicalBloc } from './backtest'
import { ALL_REPRODUCTION_VARIANTS, resolveReferenceRows } from './secondRoundReproduction'
import type { ReproductionVariant } from './secondRoundReproduction'
import type {
  Bloc,
  CandidateId,
  Reference2017,
  Reference2022,
  ReferenceMatrixYear,
  ReferenceTransferTriplet,
  SecondRoundReferenceMatricesData,
  TransfersData,
} from './types'

export type SimplificationKey = 'a' | 'b' | 'd' | 'f'

export const SIMPLIFICATION_KEYS: readonly SimplificationKey[] = ['a', 'b', 'd', 'f']

/**
 * Interrupteurs entre la configuration de référence (`false` partout) et le moteur actuel en échantillon (`true` partout) :
 * - `a` : lignes de bloc du dépôt (gauche, droite) au lieu des lignes R1.1 par candidat et R1.9 ;
 * - `b` : extrême droite hors finaliste alignée sur la fidélité RN (0/96/4) au lieu des lignes R1.1 mesurées ;
 * - `d` : a = 0,20 et q = 0,55 au lieu des valeurs de référence R1.13 (Option A : a = 0,14, q = 0,59) ;
 * - `f` : fidélités 2027 des finalistes (Macron 95/1,5/3,5 ; Le Pen 96/1/3) au lieu des lignes R1.1 (diagnostic, R1.11).
 */
export interface Step2Flags {
  a: boolean
  b: boolean
  d: boolean
  f: boolean
}

export const REFERENCE_FLAGS: Step2Flags = { a: false, b: false, d: false, f: false }
export const CURRENT_ENGINE_FLAGS: Step2Flags = { a: true, b: true, d: true, f: true }

/** Valeurs de référence R1.13 validées le 24/11/2026 (Option A, docs/changelog-methode.md). */
export const R113_REF_MOBILIZATION = 0.14
export const R113_REF_ANTI_RN_SHARE = 0.59

/** Valeurs actuelles du moteur (par défaut avant P1). */
export const CURRENT_MOBILIZATION = 0.2
export const CURRENT_ANTI_RN_SHARE = 0.55

/** Valeurs archivées du moteur v2.2 (audit P1 du 24/11/2026, conservées pour reproductibilité). */
export const V22_PRESIDENTIAL_ELECTIONS: Record<ReferenceMatrixYear, Record<Bloc, { finalist: number; rn: number; abstention: number }>> = {
  '2017': {
    gauche: { finalist: 58, rn: 9, abstention: 33 },
    centre: { finalist: 79, rn: 7, abstention: 14 },
    droite: { finalist: 48, rn: 23, abstention: 29 },
    extreme_droite: { finalist: 0, rn: 96, abstention: 4 },
  },
  '2022': {
    gauche: { finalist: 47, rn: 15, abstention: 38 },
    centre: { finalist: 79, rn: 7, abstention: 14 },
    droite: { finalist: 53, rn: 18, abstention: 29 },
    extreme_droite: { finalist: 0, rn: 96, abstention: 4 },
  },
}
export const V22_FIDELITY_DEFAULT = { loyal: 95, cross: 1.5, abstention: 3.5 } as const
export const V22_FIDELITY_LEPEN = { loyal: 96, cross: 1, abstention: 3 } as const

/** Ligne transposée du centre (Cheminade en 2017, R1.9 et R1.10). */
export const TRANSPOSED_CENTER_ROW: ReferenceTransferTriplet = { antiRn: 79, rn: 7, nonExpressed: 14 }

export interface R12ToleranceCheck {
  passed: boolean
  /** Tolérance R1.2 : ±1 point sur la part de l'opposant au RN et ±1 point d'inscrits sur chaque volume finaliste. */
  tolerancePts: number
  errAntiRnPct: number
  errAntiRnVolumePct: number
  errRnVolumePct: number
  violations: string[]
}

export interface Step2EvalResult {
  year: ReferenceMatrixYear
  variant: ReproductionVariant
  flags: Step2Flags
  mobilization: number
  antiRnShare: number
  /** Score prévu de l'opposant au RN (% des exprimés T2). */
  antiRnPct: number
  /** Volumes prévus (% des inscrits T1) : totals.a + totals.b + totals.nonExpressed + blankNull1 = 100. */
  totals: { a: number; b: number; nonExpressed: number }
  blankNull1: number
  expressed2: number
  /** Résultats officiels du 2nd tour (part % des exprimés T2 ; volumes % des inscrits T2). */
  actual: { antiRnPct: number; antiRnVolumePct: number; rnVolumePct: number; expressed2VolumePct: number }
  r12: R12ToleranceCheck
  /** Décomposition du bloc résiduel (petits candidats + nouveaux votants) en % des inscrits, pour diagnostic. */
  residualBreakdown: {
    smallCandidatesA: number
    smallCandidatesB: number
    newVotersA: number
    newVotersB: number
    predictedResidualA: number
    predictedResidualB: number
    actualResidualA: number
    actualResidualB: number
  }
}

export interface DegradationRow {
  key: SimplificationKey
  label: string
  diagnosticOnly: boolean
  /** score(référence + simplification k) − score(référence), en points d'exprimés sur l'opposant au RN. */
  addedToReferencePts: number
  /** score(moteur actuel − simplification k) − score(moteur actuel), en points d'exprimés (gain au retrait). */
  removedFromCurrentGainPts: number
  /** score(moteur actuel) − score(moteur actuel − simplification k) (contribution au voisinage du moteur actuel). */
  contributionAtCurrentPts: number
}

export interface Step2YearReport {
  year: ReferenceMatrixYear
  reference: Step2EvalResult
  referenceVariants: Record<ReproductionVariant, Step2EvalResult>
  currentEngine: Step2EvalResult
  /** Somme des effets individuels ajoutés à la référence vs écart total (moteur actuel − référence). */
  totalDegradationPts: number
  sumAddedToReferencePts: number
  degradations: DegradationRow[]
  /** Borne maximale de (c) selon R1.9 : voix des candidats sans ligne / exprimés T2 (%). */
  boundC: {
    uncoveredVotes: number
    secondRoundExpressed: number
    maxEffectPts: number
  }
  /** Lignes de bloc R1.9 calculées à partir des candidats couverts (finaliste exclu) pour les petits candidats. */
  r19BlocRows: Record<Bloc, ReferenceTransferTriplet>
}

const SIMPLIFICATION_META: Record<SimplificationKey, { label: string; diagnosticOnly: boolean }> = {
  a: { label: '(a) Lignes de bloc du dépôt (gauche, droite) au lieu de R1.1 par candidat', diagnosticOnly: false },
  b: { label: '(b) Extrême droite hors finaliste alignée sur fidélité RN (0/96/4)', diagnosticOnly: false },
  d: { label: '(d) Nouveaux votants par défaut (a = 0,20, q = 0,55) au lieu de R1.13 (0,14 / 0,59)', diagnosticOnly: false },
  f: { label: '(f) Fidélités 2027 des finalistes (95/1,5/3,5 ; 96/1/3) [diagnostic, R1.11]', diagnosticOnly: true },
}

/** Vérifie la tolérance R1.2 (±1 pt sur la part de l'opposant au RN et ±1 pt d'inscrits sur chaque volume). */
export function checkR12Tolerance(
  predicted: { antiRnPct: number; antiRnVolumePct: number; rnVolumePct: number },
  actual: { antiRnPct: number; antiRnVolumePct: number; rnVolumePct: number },
  tolerancePts = 1,
): R12ToleranceCheck {
  const errAntiRnPct = predicted.antiRnPct - actual.antiRnPct
  const errAntiRnVolumePct = predicted.antiRnVolumePct - actual.antiRnVolumePct
  const errRnVolumePct = predicted.rnVolumePct - actual.rnVolumePct
  const violations: string[] = []
  if (Math.abs(errAntiRnPct) > tolerancePts) {
    violations.push(`part opposant au RN (${errAntiRnPct >= 0 ? '+' : '−'}${Math.abs(errAntiRnPct).toFixed(2)} pt)`)
  }
  if (Math.abs(errAntiRnVolumePct) > tolerancePts) {
    violations.push(
      `volume opposant au RN (${errAntiRnVolumePct >= 0 ? '+' : '−'}${Math.abs(errAntiRnVolumePct).toFixed(2)} pt d’inscrits)`,
    )
  }
  if (Math.abs(errRnVolumePct) > tolerancePts) {
    violations.push(
      `volume RN (${errRnVolumePct >= 0 ? '+' : '−'}${Math.abs(errRnVolumePct).toFixed(2)} pt d’inscrits)`,
    )
  }
  return {
    passed: violations.length === 0,
    tolerancePts,
    errAntiRnPct,
    errAntiRnVolumePct,
    errRnVolumePct,
    violations,
  }
}

/**
 * Calcule les lignes de bloc R1.9 pour les petits candidats sans ligne :
 * moyenne pondérée par les voix T1 des lignes des candidats couverts du même bloc (finaliste exclu),
 * et ligne transposée 79/7/14 pour le centre (Cheminade en 2017).
 */
export function computeR19BlocRows(
  ref: Reference2017 | Reference2022,
  resolvedById: Map<CandidateId, ReferenceTransferTriplet>,
): Record<Bloc, ReferenceTransferTriplet> {
  const votesById = new Map(ref.candidates.map((c) => [c.id, c.votes]))
  const weighted = (bloc: Exclude<Bloc, 'centre'>): ReferenceTransferTriplet => {
    const members = [...resolvedById.entries()].filter(
      ([id]) => id !== 'macron' && id !== 'lepen' && historicalBloc(id) === bloc,
    )
    const totalVotes = members.reduce((s, [id]) => s + (votesById.get(id) ?? 0), 0)
    if (totalVotes <= 0) throw new Error(`Aucun candidat couvert non finaliste dans le bloc ${bloc}`)
    return {
      antiRn: members.reduce((s, [id, r]) => s + (votesById.get(id) ?? 0) * r.antiRn, 0) / totalVotes,
      rn: members.reduce((s, [id, r]) => s + (votesById.get(id) ?? 0) * r.rn, 0) / totalVotes,
      nonExpressed: members.reduce((s, [id, r]) => s + (votesById.get(id) ?? 0) * r.nonExpressed, 0) / totalVotes,
    }
  }
  return {
    gauche: weighted('gauche'),
    centre: { ...TRANSPOSED_CENTER_ROW },
    droite: weighted('droite'),
    extreme_droite: weighted('extreme_droite'),
  }
}

/**
 * Évalue le moteur du 2nd tour (en flux bruts, % des inscrits T1) sur une élection de référence
 * avec les interrupteurs de dégradation `flags` et la variante de source `variant`.
 */
export function evaluateSecondRoundConfig(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  matrices: SecondRoundReferenceMatricesData,
  transfers: TransfersData,
  flags: Step2Flags,
  options: {
    variant?: ReproductionVariant
    refMobilization?: number
    refAntiRnShare?: number
  } = {},
): Step2EvalResult {
  const variant = options.variant ?? 'r1_1'
  const refMob = options.refMobilization ?? R113_REF_MOBILIZATION
  const refQ = options.refAntiRnShare ?? R113_REF_ANTI_RN_SHARE

  const resolvedList = resolveReferenceRows(
    matrices.rows[year],
    matrices.surveys,
    variant,
    matrices.participation[year].abstentionPctByCandidate,
  )
  const resolvedById = new Map(resolvedList.map((r) => [r.candidateId, r.row]))
  const r19Rows = computeR19BlocRows(ref, resolvedById)

  const repoRows = V22_PRESIDENTIAL_ELECTIONS[year]
  const fidMacron2027 = V22_FIDELITY_DEFAULT
  const fidLePen2027 = V22_FIDELITY_LEPEN
  const rnCampRow: ReferenceTransferTriplet = {
    antiRn: 0,
    rn: fidLePen2027.loyal,
    nonExpressed: 100 - fidLePen2027.loyal,
  }
  void transfers

  const participation = (100 * ref.voters) / ref.registered
  const abstention1 = 100 - participation
  const blankNullShare = (ref.voters - ref.expressed) / ref.voters
  const blankNull1 = participation * blankNullShare
  const expressed1 = participation - blankNull1
  const scale = expressed1 / 100

  let coveredA = 0
  let coveredB = 0
  let smallA = 0
  let smallB = 0
  let totNon = 0

  for (const c of ref.candidates) {
    const firstRoundPct = (100 * c.votes) / ref.expressed
    const share = firstRoundPct * scale // = 100 * c.votes / ref.registered
    let row: ReferenceTransferTriplet

    if (c.id === 'macron') {
      row = flags.f
        ? { antiRn: fidMacron2027.loyal, rn: fidMacron2027.cross, nonExpressed: fidMacron2027.abstention }
        : resolvedById.get('macron')!
    } else if (c.id === 'lepen') {
      row = flags.f
        ? { antiRn: fidLePen2027.cross, rn: fidLePen2027.loyal, nonExpressed: fidLePen2027.abstention }
        : resolvedById.get('lepen')!
    } else {
      const bloc = historicalBloc(c.id)
      if (bloc === 'extreme_droite') {
        row = flags.b ? rnCampRow : (resolvedById.get(c.id) ?? r19Rows.extreme_droite)
      } else if (bloc === 'centre') {
        row = TRANSPOSED_CENTER_ROW
      } else if (flags.a) {
        const repo = repoRows[bloc]
        row = { antiRn: repo.finalist, rn: repo.rn, nonExpressed: repo.abstention }
      } else {
        row = resolvedById.get(c.id) ?? r19Rows[bloc]
      }
    }

    const toA = (share * row.antiRn) / 100
    const toB = (share * row.rn) / 100
    const toNon = (share * row.nonExpressed) / 100
    if (resolvedById.has(c.id)) {
      coveredA += toA
      coveredB += toB
    } else {
      smallA += toA
      smallB += toB
    }
    totNon += toNon
  }

  const mobilization = flags.d ? CURRENT_MOBILIZATION : refMob
  const antiRnShare = flags.d ? CURRENT_ANTI_RN_SHARE : refQ
  const newVoters = abstention1 * mobilization
  const newVotersA = newVoters * antiRnShare
  const newVotersB = newVoters * (1 - antiRnShare)
  totNon += abstention1 - newVoters

  const totals = {
    a: coveredA + smallA + newVotersA,
    b: coveredB + smallB + newVotersB,
    nonExpressed: totNon,
  }
  const expressed2 = totals.a + totals.b
  const antiRnPct = expressed2 > 0 ? (100 * totals.a) / expressed2 : 50

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
    variant,
    flags,
    mobilization,
    antiRnShare,
    antiRnPct,
    totals,
    blankNull1,
    expressed2,
    actual,
    r12: checkR12Tolerance(
      { antiRnPct, antiRnVolumePct: totals.a, rnVolumePct: totals.b },
      actual,
    ),
    residualBreakdown: {
      smallCandidatesA: smallA,
      smallCandidatesB: smallB,
      newVotersA,
      newVotersB,
      predictedResidualA: smallA + newVotersA,
      predictedResidualB: smallB + newVotersB,
      actualResidualA: actual.antiRnVolumePct - coveredA,
      actualResidualB: actual.rnVolumePct - coveredB,
    },
  }
}

/** Exécute l'étape 2 complète (configuration de référence R1.2, variantes, dégradations dans les deux ordres, borne de c). */
export function computeStep2Report(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  matrices: SecondRoundReferenceMatricesData,
  transfers: TransfersData,
): Step2YearReport {
  const referenceVariants = Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((variant) => [
      variant,
      evaluateSecondRoundConfig(year, ref, matrices, transfers, REFERENCE_FLAGS, { variant }),
    ]),
  ) as Record<ReproductionVariant, Step2EvalResult>

  const reference = referenceVariants.r1_1
  const currentEngine = evaluateSecondRoundConfig(year, ref, matrices, transfers, CURRENT_ENGINE_FLAGS)

  const degradations: DegradationRow[] = SIMPLIFICATION_KEYS.map((key) => {
    const withOne = evaluateSecondRoundConfig(year, ref, matrices, transfers, { ...REFERENCE_FLAGS, [key]: true })
    const withoutOne = evaluateSecondRoundConfig(year, ref, matrices, transfers, {
      ...CURRENT_ENGINE_FLAGS,
      [key]: false,
    })
    const addedToReferencePts = withOne.antiRnPct - reference.antiRnPct
    const removedFromCurrentGainPts = withoutOne.antiRnPct - currentEngine.antiRnPct
    return {
      key,
      label: SIMPLIFICATION_META[key].label,
      diagnosticOnly: SIMPLIFICATION_META[key].diagnosticOnly,
      addedToReferencePts,
      removedFromCurrentGainPts,
      contributionAtCurrentPts: -removedFromCurrentGainPts,
    }
  })

  const coveredIds = new Set(matrices.rows[year].map((r) => r.candidateId))
  const uncoveredVotes = ref.candidates
    .filter((c) => !coveredIds.has(c.id))
    .reduce((s, c) => s + c.votes, 0)

  const resolvedR11 = new Map(
    resolveReferenceRows(matrices.rows[year], matrices.surveys, 'r1_1').map((r) => [r.candidateId, r.row]),
  )

  return {
    year,
    reference,
    referenceVariants,
    currentEngine,
    totalDegradationPts: currentEngine.antiRnPct - reference.antiRnPct,
    sumAddedToReferencePts: degradations.reduce((s, d) => s + d.addedToReferencePts, 0),
    degradations,
    boundC: {
      uncoveredVotes,
      secondRoundExpressed: ref.secondRound.expressed,
      maxEffectPts: (100 * uncoveredVotes) / ref.secondRound.expressed,
    },
    r19BlocRows: computeR19BlocRows(ref, resolvedR11),
  }
}
