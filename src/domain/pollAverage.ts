import type {
  CandidateId,
  Fieldwork,
  Hypothesis,
  HypothesisSet,
  Poll,
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

/** Tri du plus récent au plus ancien : date de fin de terrain, puis date de début. */
export function newestFirst(a: Dated, b: Dated): number {
  return b.fieldwork.end.localeCompare(a.fieldwork.end) || b.fieldwork.start.localeCompare(a.fieldwork.start)
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
  /** Moyenne entre instituts, normalisée à 100, sur les candidats retenus présents. */
  average: Scores
  institutesUsed: number
}

interface HypothesisPoll extends Dated {
  hypotheses: Hypothesis[]
}

/**
 * Moyenne de 1er tour :
 * 1. dernier sondage de chaque institut dans la fenêtre [asOf − windowDays ; asOf], parmi ceux que
 *    `include` retient ; si aucun sondage ayant une hypothèse conforme n'est retenu, `include` est
 *    ignoré ;
 * 2. dans ce sondage, hypothèses conformes au filtre (candidats requis présents, exclus absents),
 *    réduites aux candidats retenus puis renormalisées à 100, et moyennées entre elles ; un candidat
 *    `optional` (petit candidat) absent d'une hypothèse y compte pour 0 ;
 * 3. moyenne simple entre instituts (aucune s'il n'en reste qu'un), puis normalisation à 100.
 */
export function averageHypothesisPolls<P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  filter: HypothesisFilter,
  keep: ReadonlySet<CandidateId>,
  include: (poll: P) => boolean = () => true,
  optional: readonly CandidateId[] = [],
): PollAverageResult<P> {
  const { latest, superseded } = latestPerInstitute(polls, asOf, windowDays)
  const inWindow = [...latest, ...superseded]
  const matches = new Map(latest.map((p) => [p, p.hypotheses.filter((h) => hypothesisMatches(h, filter))]))
  const eligible = latest.filter((p) => matches.get(p)!.length > 0)
  const included = eligible.some(include) ? eligible.filter(include) : eligible
  // Petit candidat qu'une hypothèse ne teste pas : 0 %, sauf s'il est exclu du filtre (rallié).
  const zeros = Object.fromEntries(optional.filter((id) => !filter.exclude.includes(id)).map((id) => [id, 0]))
  const usage: PollUsage<P>[] = polls.map((poll) => {
    const skip = (status: PollStatus): PollUsage<P> => ({
      poll,
      status,
      matchedHypotheses: [],
      average: null,
    })
    if (!inWindow.includes(poll)) return skip('out-of-window')
    if (superseded.includes(poll)) return skip('superseded')
    const matched = matches.get(poll)!
    if (matched.length === 0) return skip('no-matching-hypothesis')
    if (!included.includes(poll)) return skip('excluded')
    const average = meanByKey(matched.map((h) => ({ ...zeros, ...normalize(pick(h.scores, keep)) })))
    return { poll, status: 'used', matchedHypotheses: matched.map((h) => h.id), average }
  })
  const used = usage.filter((u) => u.average)
  // Un petit candidat qu'aucune hypothèse retenue ne teste n'est pas présenté.
  const average = used.length
    ? Object.fromEntries(
        Object.entries(normalize(meanByKey(used.map((u) => u.average!)))).filter(
          ([id, v]) => v > 0 || !optional.includes(id),
        ),
      )
    : {}
  return { usage, average, institutesUsed: used.length }
}

/** Durée retenue avant la date de référence : depuis le début de la période, sinon la fenêtre glissante. */
export function windowDaysOf(data: Pick<PollsData, 'asOf' | 'windowDays' | 'period'>): number {
  return data.period ? Math.max(0, daysBetween(data.period.start, data.asOf)) : data.windowDays
}

/** Petits candidats des données : facultatifs dans les hypothèses, à 0 % quand ils n'y sont pas. */
export const minorIds = (data: Pick<PollsData, 'candidates'>): CandidateId[] =>
  data.candidates.filter((c) => c.minor).map((c) => c.id)

/** Moyenne des sondages 2027 pour un jeu d'hypothèses, sur les candidats simulés, hors sondages exclus. */
export function averagePolls(
  data: PollsData,
  set: HypothesisFilter,
  excluded: ReadonlySet<string> = new Set(),
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
    minorIds(data),
  )
}

/** Nombre de jours entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}
