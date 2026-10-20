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

/** Sondages retenus pour un même scénario et leur moyenne. */
export interface ScenarioGroup<K, P = Poll> {
  key: K
  /** Moyenne entre instituts du groupe, normalisée à 100. */
  average: Scores
  institutes: number
  polls: P[]
}

export interface ScenarioAverageResult<K, P = Poll> {
  usage: PollUsage<P>[]
  /** Groupes dans l'ordre des scénarios, sans les scénarios qu'aucun sondage retenu ne teste. */
  groups: ScenarioGroup<K, P>[]
  institutesUsed: number
}

/**
 * Comme averageHypothesisPolls, avec plusieurs scénarios essayés dans l'ordre : chaque sondage retient
 * le premier dont il a une hypothèse conforme, puis les sondages sont moyennés scénario par scénario.
 */
export function averageByScenario<K, P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  scenarios: { key: K; filter: HypothesisFilter }[],
  keep: ReadonlySet<CandidateId>,
  include: (poll: P) => boolean = () => true,
): ScenarioAverageResult<K, P> {
  const { latest, superseded } = latestPerInstitute(polls, asOf, windowDays)
  const inWindow = [...latest, ...superseded]
  const choice = new Map<P, { index: number; matched: Hypothesis[] }>()
  for (const poll of latest) {
    for (const [index, s] of scenarios.entries()) {
      const matched = poll.hypotheses.filter((h) => hypothesisMatches(h, s.filter))
      if (matched.length > 0) {
        choice.set(poll, { index, matched })
        break
      }
    }
  }
  const eligible = latest.filter((p) => choice.has(p))
  const included = eligible.some(include) ? eligible.filter(include) : eligible
  const usage: PollUsage<P>[] = polls.map((poll) => {
    const skip = (status: PollStatus): PollUsage<P> => ({ poll, status, matchedHypotheses: [], average: null })
    if (!inWindow.includes(poll)) return skip('out-of-window')
    if (superseded.includes(poll)) return skip('superseded')
    const chosen = choice.get(poll)
    if (!chosen) return skip('no-matching-hypothesis')
    if (!included.includes(poll)) return skip('excluded')
    const average = meanByKey(chosen.matched.map((h) => normalize(pick(h.scores, keep))))
    return { poll, status: 'used', matchedHypotheses: chosen.matched.map((h) => h.id), average }
  })
  const groups = scenarios.flatMap((s, index) => {
    const used = usage.filter((u) => u.average && choice.get(u.poll)?.index === index)
    const average = normalize(meanByKey(used.map((u) => u.average!)))
    return used.length ? [{ key: s.key, average, institutes: used.length, polls: used.map((u) => u.poll) }] : []
  })
  return { usage, groups, institutesUsed: usage.filter((u) => u.status === 'used').length }
}

/**
 * Moyenne de 1er tour :
 * 1. dernier sondage de chaque institut dans la fenêtre [asOf − windowDays ; asOf], parmi ceux que
 *    `include` retient ; si aucun sondage ayant une hypothèse conforme n'est retenu, `include` est
 *    ignoré ;
 * 2. dans ce sondage, hypothèses conformes au filtre (candidats requis présents, exclus absents),
 *    réduites aux candidats retenus puis renormalisées à 100, et moyennées entre elles ;
 * 3. moyenne simple entre instituts (aucune s'il n'en reste qu'un), puis normalisation à 100.
 */
export function averageHypothesisPolls<P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  filter: HypothesisFilter,
  keep: ReadonlySet<CandidateId>,
  include: (poll: P) => boolean = () => true,
): PollAverageResult<P> {
  const { usage, groups, institutesUsed } = averageByScenario(polls, asOf, windowDays, [{ key: 0, filter }], keep, include)
  return { usage, average: groups[0]?.average ?? {}, institutesUsed }
}

/** Durée retenue avant la date de référence : depuis le début de la période, sinon la fenêtre glissante. */
export function windowDaysOf(data: Pick<PollsData, 'asOf' | 'windowDays' | 'period'>): number {
  return data.period ? Math.max(0, daysBetween(data.period.start, data.asOf)) : data.windowDays
}

/** Sondages 2027 par scénario (premier testé par chaque sondage), sur les candidats simulés, hors exclus. */
export function averagePollsByScenario<K>(
  data: PollsData,
  scenarios: { key: K; filter: HypothesisFilter }[],
  excluded: ReadonlySet<string> = new Set(),
): ScenarioAverageResult<K> {
  const simulated = new Set(data.candidates.map((c) => c.id))
  return averageByScenario(data.polls, data.asOf, windowDaysOf(data), scenarios, simulated, (p) => !excluded.has(p.id))
}

/** Moyenne des sondages 2027 pour un jeu d'hypothèses, sur les candidats simulés, hors sondages exclus. */
export function averagePolls(
  data: PollsData,
  set: HypothesisFilter,
  excluded: ReadonlySet<string> = new Set(),
): PollAverageResult {
  const simulated = new Set(data.candidates.map((c) => c.id))
  return averageHypothesisPolls(data.polls, data.asOf, windowDaysOf(data), set, simulated, (p) => !excluded.has(p.id))
}

/** Nombre de jours entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}
