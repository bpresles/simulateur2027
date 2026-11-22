import { minorTransferParts } from './transfers'
import { measurePairTransfers, projectHypothesis } from './offerProjection'
import type {
  Candidate,
  CandidateId,
  Fieldwork,
  Hypothesis,
  HypothesisSet,
  ImputationDonors,
  Poll,
  PollStatus,
  PollUsage,
  PollsData,
  ReferencePart,
  Settings,
} from './types'

type Scores = Record<CandidateId, number>

const DAY_MS = 86_400_000

/** Demi-vie des sondages de 1er tour (jours) : un sondage perd la moitié de son poids tous les 14 jours. */
export const POLL_HALF_LIFE_DAYS = 14

/** Plafond d'échantillon pour éviter qu'une très grande enquête n'écrase les autres instituts. */
export const SAMPLE_SIZE_CAP = 2000

/** Nombre minimal d'instituts distincts testant un petit candidat pour l'inclure dans l'offre de base. */
export const MIN_MINOR_INSTITUTES = 3

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Nombre de jours entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Ramène un ensemble de scores à un total de 100. */
export function normalize(scores: Scores): Scores {
  const total = Object.values(scores).reduce((s, v) => s + v, 0)
  if (total <= 0) return { ...scores }
  return Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, (v * 100) / total]))
}

/** Moyenne simple par clé, calculée uniquement sur les enregistrements où la clé est présente. */
export function meanByKey(records: Scores[]): Scores {
  const sums = new Map<string, { total: number; count: number }>()
  for (const record of records) {
    for (const [id, v] of Object.entries(record)) {
      const acc = sums.get(id) ?? { total: 0, count: 0 }
      acc.total += v
      acc.count += 1
      sums.set(id, acc)
    }
  }
  return Object.fromEntries([...sums].map(([id, { total, count }]) => [id, total / count]))
}

/** Moyenne pondérée par clé, calculée uniquement sur les enregistrements où la clé est présente. */
export function weightedMeanByKey(records: { scores: Scores; weight: number }[]): Scores {
  const sums = new Map<string, { total: number; weight: number }>()
  for (const { scores, weight } of records) {
    if (weight <= 0) continue
    for (const [id, v] of Object.entries(scores)) {
      const acc = sums.get(id) ?? { total: 0, weight: 0 }
      acc.total += v * weight
      acc.weight += weight
      sums.set(id, acc)
    }
  }
  return Object.fromEntries([...sums].map(([id, { total, weight }]) => [id, weight > 0 ? total / weight : 0]))
}

export function pick(scores: Scores, ids: ReadonlySet<CandidateId>): Scores {
  return Object.fromEntries(Object.entries(scores).filter(([id]) => ids.has(id)))
}

interface Dated {
  institute: string
  fieldwork: Fieldwork
}

export interface WindowSelection<T> {
  latest: T[]
  superseded: T[]
  outOfWindow: T[]
}

function isNewer(poll: Dated, current: Dated | undefined): boolean {
  return (
    !current ||
    poll.fieldwork.end > current.fieldwork.end ||
    (poll.fieldwork.end === current.fieldwork.end && poll.fieldwork.start > current.fieldwork.start)
  )
}

export function newestFirst(a: Dated, b: Dated): number {
  return b.fieldwork.end.localeCompare(a.fieldwork.end) || b.fieldwork.start.localeCompare(a.fieldwork.start)
}

/**
 * Poids d'un sondage : décroissance exponentielle de demi-vie `POLL_HALF_LIFE_DAYS` (14 jours)
 * multipliée par la racine carrée de la taille d'échantillon plafonnée à `SAMPLE_SIZE_CAP` (2 000).
 */
export function pollWeight(
  poll: Pick<Poll, 'fieldwork' | 'sampleSize'>,
  asOf: string,
  halfLifeDays = POLL_HALF_LIFE_DAYS,
): number {
  const age = Math.max(0, daysBetween(poll.fieldwork.end, asOf))
  const recency = 2 ** (-age / halfLifeDays)
  const sample = Math.sqrt(Math.min(poll.sampleSize, SAMPLE_SIZE_CAP) / 1000)
  return recency * sample
}

/**
 * Garde, pour chaque institut, le sondage le plus récent dont le terrain se termine dans la fenêtre
 * [asOf − windowDays ; asOf]. Départage par date de fin, puis date de début.
 */
export function latestPerInstitute<T extends Dated>(polls: T[], asOf: string, windowDays: number): WindowSelection<T> {
  const cutoff = addDays(asOf, -windowDays)
  const inWindow = polls.filter((p) => p.fieldwork.end >= cutoff && p.fieldwork.end <= asOf)
  const outOfWindow = polls.filter((p) => !inWindow.includes(p))
  const byInstitute = new Map<string, T>()
  for (const poll of inWindow) {
    if (isNewer(poll, byInstitute.get(poll.institute))) byInstitute.set(poll.institute, poll)
  }
  const latest = [...byInstitute.values()]
  return { latest, superseded: inWindow.filter((p) => !latest.includes(p)), outOfWindow }
}

export type HypothesisFilter = Pick<HypothesisSet, 'require' | 'exclude'>

/**
 * Candidats requis présents, exclus absents. Un exclu ne doit pas non plus être remplacé par un autre
 * candidat (Hollande à la place de Glucksmann) : l'hypothèse ne mesure alors pas son absence.
 */
export function hypothesisMatches(h: Hypothesis, set: HypothesisFilter): boolean {
  const tested = (id: CandidateId) => id in h.scores
  const replaced = Object.values(h.replacing ?? {})
  return set.require.every(tested) && !set.exclude.some((id) => tested(id) || replaced.includes(id))
}

export interface PollAverageResult<P = Poll> {
  usage: PollUsage<P>[]
  average: Scores
  institutesUsed: number
  projectedInstitutes: number
  eligibleMinors: CandidateId[]
  excludedMinors: CandidateId[]
  donors: Record<CandidateId, ImputationDonors>
}

interface HypothesisPoll extends Dated {
  sampleSize: number
  hypotheses: Hypothesis[]
}

export type Donors = Readonly<Record<CandidateId, readonly ReferencePart[]>>

/**
 * Donneurs observés dans les sondages — règle stricte *ceteris paribus* :
 * deux hypothèses (a, b) d'un même sondage ne forment une paire valide pour un candidat x que si
 * `a` contient exactement les mêmes candidats que `b` PLUS l'unique candidat `x` (aucun autre candidat
 * ajouté ni retiré). Cela garantit qu'aucune perte causée par un autre candidat (ex. Attal, Philippe ou
 * un autre petit candidat) n'est attribuée à tort à `x`.
 */
export function observedDonors(
  polls: readonly Pick<HypothesisPoll, 'institute' | 'hypotheses'>[],
  ids: readonly CandidateId[],
  donor: (id: CandidateId) => boolean,
): Record<CandidateId, ImputationDonors> {
  const idSet = new Set(ids)
  const sums: Record<CandidateId, Scores> = {}
  const pairs: Record<CandidateId, ImputationDonors['pairs']> = {}
  for (const poll of polls) {
    for (const a of poll.hypotheses) {
      for (const b of poll.hypotheses) {
        if (a === b) continue
        const added = Object.keys(a.scores).filter((id) => !(id in b.scores))
        if (added.length !== 1) continue
        const x = added[0]!
        if (!idSet.has(x)) continue
        const removed = Object.keys(b.scores).filter((id) => !(id in a.scores))
        if (removed.length !== 0) continue
        const [withX, withoutX] = [normalize(a.scores), normalize(b.scores)]
        const loss = Object.keys(withoutX)
          .filter(donor)
          .map((id) => [id, Math.max(0, withoutX[id]! - withX[id]!)] as const)
        const total = loss.reduce((s, [, v]) => s + v, 0)
        if (total <= 0) continue
        const sum = (sums[x] ??= {})
        for (const [k, v] of loss) if (v > 0) sum[k] = (sum[k] ?? 0) + v / total
        ;(pairs[x] ??= []).push({ institute: poll.institute, without: b.id, with: a.id })
      }
    }
  }
  return Object.fromEntries(
    Object.entries(sums).map(([id, sum]) => [
      id,
      {
        parts: Object.entries(sum)
          .map(([k, v]) => ({ id: k, weight: v / pairs[id]!.length }))
          .sort((x, y) => y.weight - x.weight),
        pairs: pairs[id]!,
      },
    ]),
  )
}

/**
 * Ajoute à des scores (total 100) des candidats qu'ils ne comptent pas, avec la part `shares[id]`.
 * Cette part est prise aux donneurs au prorata de leurs poids ; aucun donneur ne cède plus que son score.
 */
export function imputeShares(scores: Scores, shares: Scores, donors: Donors): Scores {
  const taken: Scores = {}
  for (const [id, share] of Object.entries(shares)) {
    const present = (donors[id] ?? []).filter((p) => p.weight > 0 && (scores[p.id] ?? 0) > 0)
    const from = present.length > 0 ? present : Object.entries(scores).map(([k, v]) => ({ id: k, weight: v }))
    const total = from.reduce((s, p) => s + p.weight, 0)
    if (total <= 0) continue
    for (const p of from) taken[p.id] = (taken[p.id] ?? 0) + (share * p.weight) / total
  }
  const left = Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, Math.max(0, v - (taken[id] ?? 0))]))
  const excess = Object.entries(scores).reduce((s, [id, v]) => s + Math.max(0, (taken[id] ?? 0) - v), 0)
  if (excess <= 0) return { ...left, ...shares }
  const rest = Object.values(left).reduce((s, v) => s + v, 0)
  if (rest <= excess) return normalize({ ...scores, ...shares })
  return { ...Object.fromEntries(Object.entries(left).map(([id, v]) => [id, v * (1 - excess / rest)])), ...shares }
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

function imputer<P>(retained: Map<P, Scores[]>, imputed: Donors): (poll: P, scores: Scores) => Scores {
  const byPoll = Object.keys(imputed).flatMap((id) => {
    const scores = new Map(
      [...retained].flatMap(([p, hs]) => {
        const tested = hs.filter((s) => id in s).map((s) => s[id]!)
        return tested.length > 0 ? [[p, mean(tested)] as const] : []
      }),
    )
    return scores.size > 0 ? [{ id, scores, overall: mean([...scores.values()]) }] : []
  })
  return (poll, scores) =>
    imputeShares(
      scores,
      Object.fromEntries(
        byPoll.filter(({ id }) => !(id in scores)).map(({ id, scores: s, overall }) => [id, s.get(poll) ?? overall]),
      ),
      imputed,
    )
}

/**
 * Petits candidats éligibles : testés par au moins `minInstitutes` instituts distincts parmi `polls`
 * (hors remplacement dans `replacing`), ou explicitement requis par `filter.require`.
 */
export function partitionMinors(
  polls: readonly Pick<HypothesisPoll, 'institute' | 'hypotheses'>[],
  minorIds: readonly CandidateId[],
  filter: HypothesisFilter,
  minInstitutes = MIN_MINOR_INSTITUTES,
): { eligible: CandidateId[]; excluded: CandidateId[] } {
  const eligible: CandidateId[] = []
  const excluded: CandidateId[] = []
  for (const id of minorIds) {
    if (filter.exclude.includes(id)) continue
    if (filter.require.includes(id)) {
      eligible.push(id)
      continue
    }
    const insts = new Set<string>()
    for (const p of polls) {
      if (p.hypotheses.some((h) => id in h.scores && !(id in (h.replacing ?? {})))) insts.add(p.institute)
    }
    if (insts.size >= minInstitutes) eligible.push(id)
    else excluded.push(id)
  }
  return { eligible, excluded }
}

/** Durée retenue avant la date de référence : depuis le début de la période, sinon la fenêtre glissante. */
export function windowDaysOf(data: Pick<PollsData, 'asOf' | 'windowDays' | 'period'>): number {
  return data.period ? Math.max(0, daysBetween(data.period.start, data.asOf)) : data.windowDays
}

export function minorDonors(data: Pick<PollsData, 'candidates'>, choices: Settings['minorTransfers'] = {}): Donors {
  const parts = minorTransferParts(data.candidates, choices)
  return Object.fromEntries(data.candidates.filter((c) => c.minor).map((c) => [c.id, parts[c.id] ?? []]))
}

/**
 * Moyenne pondérée de 1er tour sur des sondages à hypothèses (utilisée aussi par le backtest).
 * Quand `weighted` vaut false, tous les instituts pèsent 1 (utile pour comparaison historique).
 */
export function averageHypothesisPolls<P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  filter: HypothesisFilter,
  keep: ReadonlySet<CandidateId>,
  include: (poll: P) => boolean = () => true,
  optional: readonly CandidateId[] = [],
  imputed: Donors = {},
  options: {
    weighted?: boolean
    candidates?: readonly Candidate[]
    offerProjection?: boolean
    minMinorInstitutes?: number
  } = {},
): PollAverageResult<P> {
  const weighted = options.weighted ?? true
  const { latest, superseded } = latestPerInstitute(polls, asOf, windowDays)
  const inWindow = [...latest, ...superseded]
  const minorIds = Object.keys(imputed)
  const { eligible: eligibleMinors, excluded: excludedMinors } = partitionMinors(
    latest,
    minorIds,
    filter,
    options.minMinorInstitutes ?? MIN_MINOR_INSTITUTES,
  )
  const effectiveKeep = new Set([...keep].filter((id) => !excludedMinors.includes(id)))
  const activeImputed: Donors = Object.fromEntries(
    eligibleMinors.map((id) => [id, imputed[id] ?? []]),
  )

  // Mesure des transferts sur paires propres intra-institut (sur tous les sondages récents)
  const pairModel =
    options.offerProjection && options.candidates
      ? measurePairTransfers(latest, options.candidates, asOf)
      : null

  // Pour chaque sondage récent : hypothèses exactes ou (si projection activée) meilleure hypothèse projetée.
  const exactMatches = new Map(latest.map((p) => [p, p.hypotheses.filter((h) => hypothesisMatches(h, filter))]))
  const projections = new Map<P, { hypothesis: Hypothesis; scores: Scores; steps: string[] } | null>()

  // Éviter qu'une hypothèse "fourre-tout" remplie de petits candidats hors-seuil (ex. Cluster17 H4 avec
  // Lagarde 8 % + 6 autres = 16 % hors-offre) ne soit choisie quand une hypothèse propre à 1 candidat près existe.
  const offTargetMass = (h: Hypothesis) =>
    Object.entries(h.scores).reduce((s, [id, v]) => s + (effectiveKeep.has(id) ? 0 : v), 0)

  for (const poll of latest) {
    const exact = exactMatches.get(poll)!
    const cleanestExact = exact.filter((h) => offTargetMass(h) <= 8)
    if (cleanestExact.length > 0) {
      // S'il y a des hypothèses exactes propres, garder celles qui minimisent le bruit hors-offre
      const minNoise = Math.min(...cleanestExact.map(offTargetMass))
      exactMatches.set(
        poll,
        cleanestExact.filter((h) => offTargetMass(h) <= minNoise + 2),
      )
      projections.set(poll, null)
      continue
    }
    if (pairModel && options.candidates) {
      const projected = projectHypothesis(poll, filter, effectiveKeep, pairModel, options.candidates)
      if (projected && (exact.length === 0 || projected.penalty < offTargetMass(exact[0]!))) {
        projections.set(poll, {
          hypothesis: projected.hypothesis,
          scores: projected.scores,
          steps: projected.steps,
        })
        continue
      }
    }
    projections.set(poll, null)
  }

  const hasMatch = (p: P) => exactMatches.get(p)!.length > 0 || projections.get(p) !== null
  const eligiblePolls = latest.filter(hasMatch)
  const included = eligiblePolls.some(include) ? eligiblePolls.filter(include) : eligiblePolls
  const absent = (id: CandidateId) => filter.exclude.includes(id) || !effectiveKeep.has(id)
  const zeros = Object.fromEntries(
    optional.filter((id) => !absent(id) && !(id in activeImputed)).map((id) => [id, 0]),
  )

  const retained = new Map<P, Scores[]>()
  for (const p of included) {
    const proj = projections.get(p)
    if (proj) {
      retained.set(p, [{ ...zeros, ...normalize(pick(proj.scores, effectiveKeep)) }])
    } else {
      retained.set(
        p,
        exactMatches.get(p)!.map((h) => ({ ...zeros, ...normalize(pick(h.scores, effectiveKeep)) })),
      )
    }
  }

  const imputable = Object.keys(activeImputed).filter((id) => !absent(id))
  const observed = observedDonors(latest, imputable, (id) => effectiveKeep.has(id) && !(id in activeImputed))
  const donors: Record<CandidateId, ImputationDonors> = Object.fromEntries(
    imputable.map((id) => [id, observed[id] ?? { parts: [...activeImputed[id]!], pairs: [] }]),
  )
  const impute = imputer(retained, Object.fromEntries(Object.entries(donors).map(([id, d]) => [id, d.parts])))

  const rawWeights = new Map(included.map((p) => [p, weighted ? pollWeight(p, asOf) : 1]))
  const totalWeight = [...rawWeights.values()].reduce((s, w) => s + w, 0)

  const usage: PollUsage<P>[] = polls.map((poll) => {
    const skip = (status: PollStatus): PollUsage<P> => ({
      poll,
      status,
      matchedHypotheses: [],
      weight: 0,
      weightShare: 0,
      projected: false,
      projectionSteps: [],
      average: null,
    })
    if (!inWindow.includes(poll)) return skip('out-of-window')
    if (superseded.includes(poll)) return skip('superseded')
    if (!hasMatch(poll)) return skip('no-matching-hypothesis')
    if (!included.includes(poll)) return skip('excluded')
    const proj = projections.get(poll)
    const average = meanByKey(retained.get(poll)!.map((s) => impute(poll, s)))
    const w = rawWeights.get(poll) ?? 0
    return {
      poll,
      status: 'used',
      matchedHypotheses: proj ? [proj.hypothesis.id] : exactMatches.get(poll)!.map((h) => h.id),
      weight: w,
      weightShare: totalWeight > 0 ? (100 * w) / totalWeight : 0,
      projected: proj !== null,
      projectionSteps: proj ? proj.steps : [],
      average,
    }
  })

  const used = usage.filter((u) => u.average !== null)
  const average = used.length
    ? Object.fromEntries(
        Object.entries(
          normalize(weightedMeanByKey(used.map((u) => ({ scores: u.average!, weight: u.weight })))),
        ).filter(([id, v]) => v > 0 || !(optional.includes(id) || id in activeImputed)),
      )
    : {}

  return {
    usage,
    average,
    institutesUsed: used.length,
    projectedInstitutes: used.filter((u) => u.projected).length,
    eligibleMinors,
    excludedMinors,
    donors,
  }
}

/** Moyenne pondérée des sondages 2027 pour un jeu d'hypothèses, sur les candidats simulés. */
export function averagePolls(
  data: PollsData,
  set: HypothesisFilter,
  excluded: ReadonlySet<string> = new Set(),
  choices: Settings['minorTransfers'] = {},
  options: { offerProjection?: boolean; weighted?: boolean; minMinorInstitutes?: number } = {},
): PollAverageResult {
  const simulated = new Set(data.candidates.map((c) => c.id))
  const include = (p: Poll) => !excluded.has(p.id)
  return averageHypothesisPolls(
    data.polls,
    data.asOf,
    windowDaysOf(data),
    set,
    simulated,
    include,
    [],
    minorDonors(data, choices),
    {
      weighted: options.weighted ?? true,
      candidates: data.candidates,
      offerProjection: options.offerProjection ?? true,
      minMinorInstitutes: options.minMinorInstitutes,
    },
  )
}
