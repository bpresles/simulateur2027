// Synchronisation des sondages : fusion des flux externes avec les données existantes.
import type { Reference2022Stats } from '../domain/corrections'
import { addDays, averagePolls } from '../domain/pollAverage'
import { computeProgression2022 } from '../domain/progression'
import type { Poll, PollOrigin, PollsData, Reference2022, SecondRoundPoll } from '../domain/types'
import { CandidateResolver, FEEDS, canonicalInstitute, fromEtmoi, fromMieuxVoter } from './feeds'
import type { EtmoiFeed, MieuxVoterFeed } from './feeds'

/** Un sondage vérifié sur la notice officielle remplace une compilation, qui remplace une saisie manuelle. */
const PRIORITY: Record<PollOrigin, number> = { manuel: 1, mieuxvoter: 2, '2027etmoi': 3 }

/** Les flux importés ne sont repris que sur cette durée ; les sondages déjà présents sont conservés. */
export const RETENTION_DAYS = 120

/** Sérialisation à clés triées : compare le contenu indépendamment de l'ordre des champs. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/** Mêmes éléments, quel que soit leur ordre. */
const sameEntries = (a: unknown[], b: unknown[]) =>
  a.length === b.length && stableStringify(a.map(stableStringify).sort()) === stableStringify(b.map(stableStringify).sort())

const pollKey = (p: Pick<Poll, 'institute' | 'fieldwork'>) => `${canonicalInstitute(p.institute)}|${p.fieldwork.end}`
const duelKey = (p: SecondRoundPoll) =>
  `${canonicalInstitute(p.institute)}|${p.fieldwork.end}|${Object.keys(p.scores).sort().join('-')}`

/** Réunit les publications d'un même sondage (même institut, même fin de terrain) venant d'une même source. */
function combine(polls: Poll[]): Poll {
  const [first, ...rest] = polls
  if (!first || rest.length === 0) return first!
  const hypotheses = polls.flatMap((p) => p.hypotheses).map((h, i) => ({ ...h, id: `H${i + 1}` }))
  return {
    ...first,
    sponsor: [...new Set(polls.map((p) => p.sponsor))].join(' ; '),
    sampleSize: Math.max(...polls.map((p) => p.sampleSize)),
    sources: polls.flatMap((p) => p.sources).filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i),
    hypotheses,
  }
}

export function mergePolls(existing: Poll[], imported: Poll[], cutoff: string): Poll[] {
  const result = new Map(existing.map((p) => [pollKey(p), p]))
  const groups = new Map<string, Poll[]>()
  for (const p of imported.filter((x) => x.fieldwork.end >= cutoff)) {
    const key = `${pollKey(p)}|${p.origin}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const candidates = [...groups.values()]
    .map(combine)
    .sort((a, b) => PRIORITY[b.origin ?? 'manuel'] - PRIORITY[a.origin ?? 'manuel'])
  for (const poll of candidates) {
    const key = pollKey(poll)
    const current = result.get(key)
    if (!current) result.set(key, poll)
    else if (PRIORITY[poll.origin ?? 'manuel'] > PRIORITY[current.origin ?? 'manuel'] || poll.origin === current.origin) {
      // L'identifiant reste stable : il peut être référencé ailleurs.
      result.set(key, { ...poll, id: current.id })
    }
  }
  return [...result.values()].sort(
    (a, b) => b.fieldwork.end.localeCompare(a.fieldwork.end) || a.institute.localeCompare(b.institute),
  )
}

export function mergeSecondRound(existing: SecondRoundPoll[], imported: SecondRoundPoll[], cutoff: string) {
  const result = new Map(existing.map((p) => [duelKey(p), p]))
  for (const p of imported.filter((x) => x.fieldwork.end >= cutoff)) result.set(duelKey(p), p)
  return [...result.values()].sort((a, b) => b.fieldwork.end.localeCompare(a.fieldwork.end))
}

export interface SyncFeeds {
  etmoi?: EtmoiFeed
  mieuxvoter?: MieuxVoterFeed
}

export interface SyncReport {
  changed: boolean
  asOf: string
  added: string[]
  replaced: string[]
  secondRoundAdded: number
  newCandidates: string[]
  selectionChanged: boolean
}

/** Sondages retenus dans la fenêtre (2027, par jeu d'hypothèses) et pour la progression 2022. */
function selection(data: PollsData, ref: Reference2022, stats: Reference2022Stats): string {
  const sets = data.hypothesisSets.map((set) =>
    averagePolls(data, set)
      .usage.filter((u) => u.status === 'used')
      .map((u) => `${u.poll.id}:${u.matchedHypotheses.join('+')}`)
      .sort(),
  )
  const progression = computeProgression2022(data, ref, stats)
    .usage.filter((u) => u.status === 'used')
    .map((u) => `${u.poll.institute}:${u.poll.fieldwork.end}`)
    .sort()
  return JSON.stringify({ sets, progression })
}

/**
 * Fusionne les flux avec les données existantes. Les données ne changent (et la date de référence
 * n'avance) que si un sondage est ajouté ou modifié, ou si la fenêtre glissante retient d'autres
 * sondages : sans cela, aucun redéploiement n'est nécessaire.
 */
export function syncPolls(
  current: PollsData,
  feeds: SyncFeeds,
  today: string,
  ref: Reference2022,
  stats: Reference2022Stats,
): { data: PollsData; report: SyncReport } {
  const cutoff = addDays(today, -RETENTION_DAYS)
  const resolver = new CandidateResolver(current.candidates, current.otherCandidates)
  const simulated = new Set(current.candidates.map((c) => c.id))
  const imported: Poll[] = []
  let secondRound: SecondRoundPoll[] = []
  if (feeds.mieuxvoter) {
    const mv = fromMieuxVoter(feeds.mieuxvoter, resolver, simulated)
    imported.push(...mv.polls)
    secondRound = mv.secondRound
  }
  if (feeds.etmoi) imported.push(...fromEtmoi(feeds.etmoi, resolver))

  const polls = mergePolls(current.polls, imported, cutoff)
  const secondRoundPolls = mergeSecondRound(current.secondRoundPolls, secondRound, cutoff)
  const sources = [
    ...current.collection.sources.filter((s) => s.url !== FEEDS.etmoi.page && s.url !== FEEDS.mieuxvoter.page),
    ...(feeds.etmoi ? [{ label: FEEDS.etmoi.label, url: FEEDS.etmoi.page }] : []),
    ...(feeds.mieuxvoter ? [{ label: FEEDS.mieuxvoter.label, url: FEEDS.mieuxvoter.page }] : []),
  ]
  const next: PollsData = {
    ...current,
    asOf: today,
    collection: { ...current.collection, sources: feeds.etmoi || feeds.mieuxvoter ? sources : current.collection.sources },
    otherCandidates: resolver.others,
    polls,
    secondRoundPolls,
  }

  const before = new Map(current.polls.map((p) => [p.id, stableStringify(p)]))
  const added = polls.filter((p) => !before.has(p.id)).map((p) => p.id)
  const replaced = polls.filter((p) => before.has(p.id) && before.get(p.id) !== stableStringify(p)).map((p) => p.id)
  const contentChanged =
    added.length > 0 ||
    replaced.length > 0 ||
    !sameEntries(secondRoundPolls, current.secondRoundPolls) ||
    resolver.others.length !== current.otherCandidates.length
  const selectionChanged = selection(next, ref, stats) !== selection(current, ref, stats)
  const changed = contentChanged || selectionChanged

  return {
    data: changed ? next : current,
    report: {
      changed,
      asOf: changed ? today : current.asOf,
      added,
      replaced,
      secondRoundAdded: secondRoundPolls.length - current.secondRoundPolls.length,
      newCandidates: resolver.others.slice(current.otherCandidates.length).map((c) => c.name),
      selectionChanged,
    },
  }
}
