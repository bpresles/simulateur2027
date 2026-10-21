// Synchronisation des sondages depuis la page Wikipedia de la liste des sondages : période la plus
// récente du 1er tour, dernier sondage de chaque institut avec toutes ses hypothèses.
import type { Poll, PollsData, SecondRoundPoll } from '../domain/types'
import { CandidateResolver, FEEDS, canonicalInstitute } from './feeds'
import { NO_LINKS, addLinks } from './links'
import type { LinkSources } from './links'
import { NO_SPONSOR, fromWikipedia } from './wikipedia'

/** Sérialisation à clés triées : compare le contenu indépendamment de l'ordre des champs. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

const pollKey = (p: Pick<Poll, 'institute' | 'fieldwork'>) =>
  `${canonicalInstitute(p.institute)}|${p.fieldwork.end}`

/** `a` est plus récent que `b` : date de fin de terrain, puis date de début. */
const newer = (a: Pick<Poll, 'fieldwork'>, b: Pick<Poll, 'fieldwork'>) =>
  a.fieldwork.end > b.fieldwork.end ||
  (a.fieldwork.end === b.fieldwork.end && a.fieldwork.start > b.fieldwork.start)

/**
 * Réunit les blocs d'un même sondage (même institut, même fin de terrain), que la page présente
 * parfois séparément, par exemple un bloc par commanditaire.
 */
function combine(polls: Poll[]): Poll {
  const [first, ...rest] = polls
  if (!first || rest.length === 0) return first!
  const sponsors = [...new Set(polls.map((p) => p.sponsor).filter((s) => s !== NO_SPONSOR))]
  return {
    ...first,
    sponsor: sponsors.length ? sponsors.join(' ; ') : NO_SPONSOR,
    sampleSize: Math.max(...polls.map((p) => p.sampleSize)),
    sources: polls
      .flatMap((p) => p.sources)
      .filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i)
      // Notices d'abord, lien vers la page en dernier.
      .sort((a, b) => Number(a.url === FEEDS.wikipedia.page) - Number(b.url === FEEDS.wikipedia.page)),
    hypotheses: polls.flatMap((p) => p.hypotheses).map((h, i) => ({ ...h, id: `H${i + 1}` })),
  }
}

/** Dernier sondage de chaque institut, du plus récent au plus ancien. */
export function latestPerInstitute<T extends Pick<Poll, 'institute' | 'fieldwork'>>(polls: T[]): T[] {
  const byInstitute = new Map<string, T>()
  for (const p of polls) {
    const current = byInstitute.get(canonicalInstitute(p.institute))
    if (!current || newer(p, current)) byInstitute.set(canonicalInstitute(p.institute), p)
  }
  return [...byInstitute.values()].sort(
    (a, b) => b.fieldwork.end.localeCompare(a.fieldwork.end) || a.institute.localeCompare(b.institute),
  )
}

/**
 * Sondages de la période : blocs d'un même sondage réunis, dernier sondage de chaque institut. Une saisie
 * manuelle de la période est gardée si elle est plus récente que le sondage de son institut sur la page.
 * Un sondage déjà présent garde son identifiant (référencé par les sondages décochés).
 */
export function selectPolls(current: Poll[], imported: Poll[], periodStart: string): Poll[] {
  const groups = new Map<string, Poll[]>()
  for (const p of imported) groups.set(pollKey(p), [...(groups.get(pollKey(p)) ?? []), p])
  const manual = current.filter((p) => (p.origin ?? 'manuel') === 'manuel' && p.fieldwork.end >= periodStart)
  const ids = new Map(current.map((p) => [pollKey(p), p.id]))
  return latestPerInstitute([...[...groups.values()].map(combine), ...manual]).map((p) => ({
    ...p,
    id: ids.get(pollKey(p)) ?? p.id,
  }))
}

/** Duels de la période : pour chaque institut et chaque paire de candidats, le plus récent. */
export function selectDuels(duels: SecondRoundPoll[]): SecondRoundPoll[] {
  const byPair = new Map<string, SecondRoundPoll[]>()
  for (const d of duels) {
    const pair = Object.keys(d.scores).sort().join('-')
    byPair.set(pair, [...(byPair.get(pair) ?? []), d])
  }
  return [...byPair.values()]
    .flatMap(latestPerInstitute)
    .sort((a, b) => b.fieldwork.end.localeCompare(a.fieldwork.end))
}

export interface SyncReport {
  changed: boolean
  asOf: string
  period: string
  added: string[]
  replaced: string[]
  removed: string[]
  secondRound: number
  /** Synthèses et notices nouvellement associées, par sondage. */
  newLinks: string[]
  newCandidates: string[]
  /** Lignes de la période écartées. */
  skipped: string[]
}

/**
 * Remplace les sondages par ceux de la période la plus récente de la page, avec la synthèse de chaque
 * institut et la notice de la Commission des sondages quand elles sont repérées (`links`). Les données ne
 * changent (et la date de référence n'avance) que si la période, un sondage, un lien ou un duel change.
 * Renvoie undefined si la page ne contient aucun sondage reconnaissable (format modifié) : les données
 * restent alors inchangées.
 */
export function syncPolls(
  current: PollsData,
  wikitext: string,
  today: string,
  links: LinkSources = NO_LINKS,
): { data: PollsData; report: SyncReport } | undefined {
  const resolver = new CandidateResolver(current.candidates, current.otherCandidates)
  const simulated = new Set(current.candidates.map((c) => c.id))
  const wiki = fromWikipedia(wikitext, resolver, simulated)
  if (!wiki) return undefined

  const selected = selectPolls(current.polls, wiki.polls, wiki.period.start)
  const polls = addLinks(selected, current.polls, links)
  const secondRoundPolls = selectDuels(wiki.secondRound)
  const next: PollsData = {
    ...current,
    asOf: today,
    period: wiki.period,
    collection: {
      ...current.collection,
      sources: [
        { label: FEEDS.wikipedia.label, url: FEEDS.wikipedia.page },
        ...current.collection.sources.filter((s) => s.url !== FEEDS.wikipedia.page),
      ],
    },
    otherCandidates: resolver.others,
    polls,
    secondRoundPolls,
  }

  const content = (d: PollsData) =>
    stableStringify([d.period, d.polls, d.secondRoundPolls, d.otherCandidates, d.collection])
  const changed = content(next) !== content(current)
  const before = new Map(current.polls.map((p) => [p.id, stableStringify(p)]))
  const urlsBefore = new Map(current.polls.map((p) => [p.id, p.sources.map((s) => s.url)]))
  const after = new Set(polls.map((p) => p.id))
  return {
    data: changed ? next : current,
    report: {
      changed,
      asOf: changed ? today : current.asOf,
      period: wiki.period.label,
      added: polls.filter((p) => !before.has(p.id)).map((p) => p.id),
      replaced: polls
        .filter((p) => before.has(p.id) && before.get(p.id) !== stableStringify(p))
        .map((p) => p.id),
      removed: current.polls.filter((p) => !after.has(p.id)).map((p) => p.id),
      secondRound: secondRoundPolls.length,
      // Liens ajoutés par cette synchronisation : ni sur la page, ni dans les données précédentes.
      newLinks: polls.flatMap((p, i) => {
        const known = new Set([...selected[i]!.sources.map((s) => s.url), ...(urlsBefore.get(p.id) ?? [])])
        const added = p.sources.filter((s) => s.kind && !known.has(s.url))
        return added.length ? [`${p.id} (${added.map((s) => s.label).join(', ')})`] : []
      }),
      newCandidates: resolver.others.slice(current.otherCandidates.length).map((c) => c.name),
      skipped: wiki.skipped,
    },
  }
}
