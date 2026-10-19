import type {
  CandidateId,
  Fieldwork,
  Hypothesis,
  HypothesisSet,
  Poll,
  PollMode,
  PollStatus,
  PollUsage,
  PollsData,
} from './types'

type Scores = Record<CandidateId, number>

const DAY_MS = 86_400_000

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Ramène un ensemble de scores à un total de 100. */
export function normalize(scores: Scores): Scores {
  const total = Object.values(scores).reduce((s, v) => s + v, 0)
  if (total <= 0) return { ...scores }
  return Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, (v * 100) / total]))
}

/** Moyenne par clé, calculée uniquement sur les enregistrements où la clé est présente. */
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

/** `poll` est plus récent que `current` : date de fin de terrain, puis date de début. */
function isNewer(poll: Dated, current: Dated | undefined): boolean {
  return (
    !current ||
    poll.fieldwork.end > current.fieldwork.end ||
    (poll.fieldwork.end === current.fieldwork.end && poll.fieldwork.start > current.fieldwork.start)
  )
}

/** Sondage le plus récent ; à égalité, le premier de la liste. */
export function mostRecent<T extends Dated>(polls: T[]): T | undefined {
  return polls.reduce<T | undefined>((best, poll) => (isNewer(poll, best) ? poll : best), undefined)
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

export function hypothesisMatches(h: Hypothesis, set: HypothesisFilter): boolean {
  const tested = (id: CandidateId) => id in h.scores
  return set.require.every(tested) && !set.exclude.some(tested)
}

export interface PollAverageResult<P = Poll> {
  usage: PollUsage<P>[]
  /** Moyenne entre instituts, normalisée à 100, sur les candidats retenus présents. */
  average: Scores
  institutesUsed: number
}

interface HypothesisPoll extends Dated {
  hypotheses: Hypothesis[]
}

/**
 * Moyenne de 1er tour :
 * 1. dernier sondage de chaque institut dans la fenêtre [asOf − windowDays ; asOf] ;
 *    en mode `latest`, seul le sondage le plus récent de la fenêtre ayant une hypothèse conforme,
 *    tous instituts confondus ;
 * 2. dans ce sondage, hypothèses conformes au filtre (candidats requis présents, exclus absents),
 *    réduites aux candidats retenus puis renormalisées à 100, et moyennées entre elles ;
 * 3. moyenne simple entre instituts, puis normalisation à 100.
 */
export function averageHypothesisPolls<P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  filter: HypothesisFilter,
  keep: ReadonlySet<CandidateId>,
  mode: PollMode = 'average',
): PollAverageResult<P> {
  const { latest, superseded } = latestPerInstitute(polls, asOf, windowDays)
  const inWindow = [...latest, ...superseded]
  const matching = (poll: P) => poll.hypotheses.filter((h) => hypothesisMatches(h, filter))
  const newest = mode === 'latest' ? mostRecent(inWindow.filter((p) => matching(p).length > 0)) : undefined
  const usage: PollUsage<P>[] = polls.map((poll) => {
    const skip = (status: PollStatus): PollUsage<P> => ({ poll, status, matchedHypotheses: [], average: null })
    if (!inWindow.includes(poll)) return skip('out-of-window')
    if (mode === 'average' && superseded.includes(poll)) return skip('superseded')
    const matched = matching(poll)
    if (matched.length === 0) return skip('no-matching-hypothesis')
    if (mode === 'latest' && poll !== newest) return skip('not-latest')
    const average = meanByKey(matched.map((h) => normalize(pick(h.scores, keep))))
    return { poll, status: 'used', matchedHypotheses: matched.map((h) => h.id), average }
  })
  const perInstitute = usage.flatMap((u) => (u.average ? [u.average] : []))
  return { usage, average: normalize(meanByKey(perInstitute)), institutesUsed: perInstitute.length }
}

/** Moyenne des sondages 2027 pour un jeu d'hypothèses, sur les candidats simulés. */
export function averagePolls(data: PollsData, set: HypothesisSet, mode: PollMode = 'average'): PollAverageResult {
  const simulated = new Set(data.candidates.map((c) => c.id))
  return averageHypothesisPolls(data.polls, data.asOf, data.windowDays, set, simulated, mode)
}

/** Nombre de jours entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}
