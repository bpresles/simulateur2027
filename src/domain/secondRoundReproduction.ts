import type {
  CandidateId,
  Reference2017,
  Reference2022,
  ReferenceMatrixRow,
  ReferenceMatrixSurvey,
  ReferenceMatrixYear,
  ReferenceTransferTriplet,
  SecondRoundReferenceMatricesData,
} from './types'

export type ReproductionVariant =
  | 'r1_1'
  | 'ipsos_only'
  | 'ifop_only'
  | 'r1_7_r1_1'
  | 'r1_7_ifop_only'

export interface ResolvedCandidateRow {
  candidateId: CandidateId
  row: ReferenceTransferTriplet
  /** Identifiants des enquêtes effectivement utilisées pour cette ligne. */
  sourcesUsed: string[]
  /** Vrai si, dans une variante mono-institut (R1.6), la ligne manquait et a été reprise chez l'autre institut. */
  usedFallback: boolean
  /** Vrai si la correction de la variante R1.7 (taux d'abstention du tableau de participation Ifop) a été appliquée. */
  appliedR17: boolean
}

export interface PartialReproductionElectionInput {
  label: string
  registered1: number
  voters1: number
  expressed1: number
  firstRoundCandidates: { id: CandidateId; votes: number }[]
  registered2: number
  voters2: number
  expressed2: number
  antiRnId: CandidateId
  rnId: CandidateId
  antiRnVotes2: number
  rnVotes2: number
}

export interface VoteColumns {
  antiRn: number
  rn: number
  nonExpressed: number
}

export interface CandidateContribution {
  candidateId: CandidateId
  firstRoundVotes: number
  row: ReferenceTransferTriplet
  sourcesUsed: string[]
  usedFallback: boolean
  appliedR17: boolean
  votes: VoteColumns
}

export interface ResidualFeasibility {
  /** Chaque colonne dans [0 ; population résiduelle] (strict). */
  strictlyFeasible: boolean
  /** Chaque colonne dans [−|écart d'inscrits| ; population résiduelle + |écart d'inscrits|] (règle R1.8). */
  feasible: boolean
  toleranceVotes: number
  violations: string[]
}

export interface PartialReproductionResult {
  label: string
  variant: ReproductionVariant
  /** Écart d'inscrits entre les deux tours (inscrits T2 − inscrits T1), publié et non corrigé (R1.8). */
  registeredDiff: number
  coveredFirstRoundVotes: number
  coveredFirstRoundExpressedPct: number
  uncoveredCandidatesVotes: number
  uncoveredCandidatesExpressedPct: number
  firstRoundNonExpressedVotes: number
  firstRoundNonExpressedRegisteredPct: number
  /** Population résiduelle du 1er tour : petits candidats sans ligne + non-exprimés du 1er tour. */
  residualPopulation: number
  residualPopulationRegisteredPct: number
  /** Population résiduelle rapportée aux inscrits du 2nd tour (residualPopulation + registeredDiff). */
  residualPopulationT2: number
  officialSecondRound: VoteColumns
  coveredContributions: CandidateContribution[]
  coveredTotals: VoteColumns
  residual: VoteColumns
  /** Part du résidu qui exprime un vote pour l'un des deux finalistes au 2nd tour (% de la population résiduelle). */
  residualExpressedSharePct: number
  /** Répartition vers l'opposant au RN parmi les voix exprimées du résidu (% ; null si exprimés résiduels ≤ 0). */
  residualAntiRnOfExpressedPct: number | null
  /** Candidats couverts dont la ligne manquait dans la variante mono-institut (R1.6) et a été prise chez l'autre. */
  fallbackCandidates: CandidateId[]
  feasibility: ResidualFeasibility
}

/**
 * Variante R1.7 sur une ligne Ifop : remplace la colonne non-exprimé par le taux d'abstention publié dans
 * le tableau de participation Ifop, et remet les deux autres colonnes à l'échelle en proportion.
 */
export function applyIfopParticipationR17(
  row: ReferenceTransferTriplet,
  abstentionPct: number,
): ReferenceTransferTriplet {
  const expressedOld = row.antiRn + row.rn
  const expressedNew = 100 - abstentionPct
  if (expressedOld <= 0) {
    return { antiRn: 0, rn: 0, nonExpressed: abstentionPct }
  }
  const scale = expressedNew / expressedOld
  return {
    antiRn: row.antiRn * scale,
    rn: row.rn * scale,
    nonExpressed: abstentionPct,
  }
}

function averageTriplets(rows: ReferenceTransferTriplet[]): ReferenceTransferTriplet {
  const n = rows.length
  return {
    antiRn: rows.reduce((s, r) => s + r.antiRn, 0) / n,
    rn: rows.reduce((s, r) => s + r.rn, 0) / n,
    nonExpressed: rows.reduce((s, r) => s + r.nonExpressed, 0) / n,
  }
}

/**
 * Résout la ligne de report de chaque candidat couvert selon la règle demandée :
 * - `r1_1` : moyenne simple d'Ipsos et d'Ifop quand les deux existent, sinon la seule disponible ;
 * - `ipsos_only` / `ifop_only` (R1.6) : un seul institut, repli signalé sur l'autre si la ligne manque ;
 * - `r1_7_r1_1` / `r1_7_ifop_only` (R1.7) : remplacement préalable de la colonne non-exprimé d'Ifop par
 *   son taux d'abstention issu du tableau de participation, avec remise à l'échelle proportionnelle.
 */
export function resolveReferenceRows(
  rows: ReferenceMatrixRow[],
  surveys: ReferenceMatrixSurvey[],
  variant: ReproductionVariant,
  ifopParticipation?: Record<CandidateId, number>,
): ResolvedCandidateRow[] {
  const surveyById = new Map(surveys.map((s) => [s.id, s]))

  return rows.map((entry) => {
    let ipsos: { id: string; row: ReferenceTransferTriplet } | null = null
    let ifop: { id: string; row: ReferenceTransferTriplet; appliedR17: boolean } | null = null

    for (const [surveyId, triplet] of Object.entries(entry.bySurvey)) {
      if (triplet === null) continue
      const survey = surveyById.get(surveyId)
      if (!survey) throw new Error(`Enquête non déclarée : ${surveyId}`)
      if (survey.institute === 'Ipsos Sopra Steria') {
        ipsos = { id: surveyId, row: triplet }
      } else {
        const useR17 = variant === 'r1_7_r1_1' || variant === 'r1_7_ifop_only'
        const partAbst = ifopParticipation?.[entry.candidateId]
        if (useR17 && partAbst !== undefined) {
          ifop = { id: surveyId, row: applyIfopParticipationR17(triplet, partAbst), appliedR17: true }
        } else {
          ifop = { id: surveyId, row: triplet, appliedR17: false }
        }
      }
    }

    if (variant === 'ipsos_only') {
      if (ipsos) {
        return {
          candidateId: entry.candidateId,
          row: ipsos.row,
          sourcesUsed: [ipsos.id],
          usedFallback: false,
          appliedR17: false,
        }
      }
      if (!ifop) throw new Error(`Aucune enquête disponible pour ${entry.candidateId}`)
      return {
        candidateId: entry.candidateId,
        row: ifop.row,
        sourcesUsed: [ifop.id],
        usedFallback: true,
        appliedR17: false,
      }
    }

    if (variant === 'ifop_only' || variant === 'r1_7_ifop_only') {
      if (ifop) {
        return {
          candidateId: entry.candidateId,
          row: ifop.row,
          sourcesUsed: [ifop.id],
          usedFallback: false,
          appliedR17: ifop.appliedR17,
        }
      }
      if (!ipsos) throw new Error(`Aucune enquête disponible pour ${entry.candidateId}`)
      return {
        candidateId: entry.candidateId,
        row: ipsos.row,
        sourcesUsed: [ipsos.id],
        usedFallback: true,
        appliedR17: false,
      }
    }

    // r1_1 ou r1_7_r1_1 : moyenne des deux instituts si tous deux existent, sinon le seul disponible.
    const available = [ipsos, ifop].filter((x): x is NonNullable<typeof x> => x !== null)
    if (available.length === 0) throw new Error(`Aucune enquête disponible pour ${entry.candidateId}`)
    return {
      candidateId: entry.candidateId,
      row: averageTriplets(available.map((x) => x.row)),
      sourcesUsed: available.map((x) => x.id),
      usedFallback: false,
      appliedR17: Boolean(ifop?.appliedR17),
    }
  })
}

/** Contrôle de réalisabilité du résidu selon la règle R1.8. */
export function checkResidualFeasibility(
  residual: VoteColumns,
  residualPopulation: number,
  registeredDiff: number,
): ResidualFeasibility {
  const tol = Math.abs(registeredDiff)
  const columns: [string, number][] = [
    ['opposant au RN', residual.antiRn],
    ['RN', residual.rn],
    ['non-exprimé', residual.nonExpressed],
  ]

  const strictOk = columns.every(([, v]) => v >= 0 && v <= residualPopulation)
  const violations: string[] = []
  for (const [name, v] of columns) {
    if (v < -tol) violations.push(`colonne « ${name} » négative (${Math.round(v)} < −${tol})`)
    if (v > residualPopulation + tol) {
      violations.push(`colonne « ${name} » > population résiduelle (${Math.round(v)} > ${Math.round(residualPopulation + tol)})`)
    }
  }

  return {
    strictlyFeasible: strictOk,
    feasible: violations.length === 0,
    toleranceVotes: tol,
    violations,
  }
}

/**
 * Reproduction partielle en voix sans le moteur (P1, étape 1, règle R1.8) :
 * applique chaque ligne résolue aux voix du candidat au 1er tour, somme les contributions,
 * puis soustrait ces contributions des résultats officiels du 2nd tour pour obtenir le résidu
 * attribuable aux petits candidats sans ligne et aux non-exprimés du 1er tour.
 */
export function computePartialReproduction(
  election: PartialReproductionElectionInput,
  resolvedRows: ResolvedCandidateRow[],
  variant: ReproductionVariant,
): PartialReproductionResult {
  const votesById = new Map(election.firstRoundCandidates.map((c) => [c.id, c.votes]))
  const coveredSet = new Set(resolvedRows.map((r) => r.candidateId))

  const coveredContributions: CandidateContribution[] = resolvedRows.map((resolved) => {
    const v = votesById.get(resolved.candidateId)
    if (v === undefined) throw new Error(`Candidat inconnu au 1er tour : ${resolved.candidateId}`)
    return {
      candidateId: resolved.candidateId,
      firstRoundVotes: v,
      row: resolved.row,
      sourcesUsed: resolved.sourcesUsed,
      usedFallback: resolved.usedFallback,
      appliedR17: resolved.appliedR17,
      votes: {
        antiRn: (v * resolved.row.antiRn) / 100,
        rn: (v * resolved.row.rn) / 100,
        nonExpressed: (v * resolved.row.nonExpressed) / 100,
      },
    }
  })

  const coveredFirstRoundVotes = coveredContributions.reduce((s, c) => s + c.firstRoundVotes, 0)
  const uncoveredCandidatesVotes = election.firstRoundCandidates
    .filter((c) => !coveredSet.has(c.id))
    .reduce((s, c) => s + c.votes, 0)
  const firstRoundNonExpressedVotes = election.registered1 - election.expressed1
  const residualPopulation = election.registered1 - coveredFirstRoundVotes
  const registeredDiff = election.registered2 - election.registered1
  const residualPopulationT2 = election.registered2 - coveredFirstRoundVotes

  const officialSecondRound: VoteColumns = {
    antiRn: election.antiRnVotes2,
    rn: election.rnVotes2,
    nonExpressed: election.registered2 - election.expressed2,
  }

  const coveredTotals: VoteColumns = {
    antiRn: coveredContributions.reduce((s, c) => s + c.votes.antiRn, 0),
    rn: coveredContributions.reduce((s, c) => s + c.votes.rn, 0),
    nonExpressed: coveredContributions.reduce((s, c) => s + c.votes.nonExpressed, 0),
  }

  const residual: VoteColumns = {
    antiRn: officialSecondRound.antiRn - coveredTotals.antiRn,
    rn: officialSecondRound.rn - coveredTotals.rn,
    nonExpressed: officialSecondRound.nonExpressed - coveredTotals.nonExpressed,
  }

  const residualExpressed = residual.antiRn + residual.rn
  const residualExpressedSharePct = residualPopulation > 0 ? (100 * residualExpressed) / residualPopulation : 0
  const residualAntiRnOfExpressedPct = residualExpressed > 0 ? (100 * residual.antiRn) / residualExpressed : null

  return {
    label: election.label,
    variant,
    registeredDiff,
    coveredFirstRoundVotes,
    coveredFirstRoundExpressedPct: (100 * coveredFirstRoundVotes) / election.expressed1,
    uncoveredCandidatesVotes,
    uncoveredCandidatesExpressedPct: (100 * uncoveredCandidatesVotes) / election.expressed1,
    firstRoundNonExpressedVotes,
    firstRoundNonExpressedRegisteredPct: (100 * firstRoundNonExpressedVotes) / election.registered1,
    residualPopulation,
    residualPopulationRegisteredPct: (100 * residualPopulation) / election.registered1,
    residualPopulationT2,
    officialSecondRound,
    coveredContributions,
    coveredTotals,
    residual,
    residualExpressedSharePct,
    residualAntiRnOfExpressedPct,
    fallbackCandidates: resolvedRows.filter((r) => r.usedFallback).map((r) => r.candidateId),
    feasibility: checkResidualFeasibility(residual, residualPopulation, registeredDiff),
  }
}

export function electionInputFromReference(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
): PartialReproductionElectionInput {
  const macron = ref.secondRound.candidates.find((c) => c.id === 'macron')
  const lepen = ref.secondRound.candidates.find((c) => c.id === 'lepen')
  if (!macron || !lepen) throw new Error(`Finalistes macron/lepen introuvables dans reference-${year}`)
  return {
    label: `Présidentielle ${year}`,
    registered1: ref.registered,
    voters1: ref.voters,
    expressed1: ref.expressed,
    firstRoundCandidates: ref.candidates.map((c) => ({ id: c.id, votes: c.votes })),
    registered2: ref.secondRound.registered,
    voters2: ref.secondRound.voters,
    expressed2: ref.secondRound.expressed,
    antiRnId: 'macron',
    rnId: 'lepen',
    antiRnVotes2: macron.votes,
    rnVotes2: lepen.votes,
  }
}

export const ALL_REPRODUCTION_VARIANTS: readonly ReproductionVariant[] = [
  'r1_1',
  'ipsos_only',
  'ifop_only',
  'r1_7_r1_1',
  'r1_7_ifop_only',
]

export function reproduceReferenceElection(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  matrices: SecondRoundReferenceMatricesData,
  variant: ReproductionVariant,
): PartialReproductionResult {
  const resolved = resolveReferenceRows(
    matrices.rows[year],
    matrices.surveys,
    variant,
    matrices.participation[year].abstentionPctByCandidate,
  )
  return computePartialReproduction(electionInputFromReference(year, ref), resolved, variant)
}
