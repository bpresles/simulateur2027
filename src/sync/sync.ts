// Synchronisation des sondages depuis la page Wikipedia de la liste des sondages : période la plus
// récente du 1er tour, dernier sondage de chaque institut avec toutes ses hypothèses.
import { meanByKey, normalize, pick } from '../domain/pollAverage'
import type { Candidate, CandidateId, Poll, PollsData, SecondRoundPoll } from '../domain/types'
import { CandidateResolver, FEEDS, canonicalInstitute } from './feeds'
import { NO_LINKS, addLinks } from './links'
import type { LinkSources } from './links'
import { NO_SPONSOR, fromWikipedia, surname } from './wikipedia'

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

const duelKey = (d: SecondRoundPoll) => `${pollKey(d)}|${Object.keys(d.scores).sort().join('-')}`

/**
 * Part sans intention de vote : saisie à la main d'après la notice (la page ne la donne pas), elle est gardée
 * tant que le duel (institut, fin de terrain, candidats) reste sur la page.
 */
export function keepNoIntention(current: SecondRoundPoll[], duels: SecondRoundPoll[]): SecondRoundPoll[] {
  const known = new Map(current.flatMap((d) => (d.noIntention ? [[duelKey(d), d.noIntention] as const] : [])))
  return duels.map((d) => {
    const noIntention = known.get(duelKey(d))
    return noIntention ? { ...d, noIntention } : d
  })
}

// ——— Candidats apparus dans les sondages ———

/** Couleurs neutres (fond clair, fond sombre) des candidats ajoutés automatiquement, à remplacer à la main. */
export const AUTO_COLORS: readonly (readonly [string, string])[] = [
  ['#6b7280', '#9ca3af'],
  ['#8a8170', '#b3aa98'],
  ['#4b5563', '#7b8492'],
  ['#7c8a96', '#a7b4bf'],
  ['#5c5a66', '#8e8b99'],
  ['#9a9187', '#c2b9ae'],
]

/**
 * Candidats non simulés testés dans au moins une hypothèse des sondages, autrement qu'à la place d'un autre
 * candidat (Hollande à la place de Glucksmann : une variante de candidature, pas un candidat de plus).
 */
export function testedNewcomers(polls: Poll[], simulated: ReadonlySet<CandidateId>): CandidateId[] {
  const tested = polls
    .flatMap((p) => p.hypotheses)
    .flatMap((h) => Object.keys(h.scores).filter((id) => !(id in (h.replacing ?? {}))))
  return [...new Set(tested)].filter((id) => !simulated.has(id))
}

/**
 * Répartition par défaut des électeurs d'un candidat ajouté : comme l'ensemble des électeurs des candidats
 * principaux dans les hypothèses qui le testent (scores normalisés, moyenne, poids arrondis à 5 points).
 */
function electorateParts(
  id: CandidateId,
  polls: Poll[],
  main: CandidateId[],
): { id: string; weight: number }[] {
  const ids = new Set(main)
  const shares = polls
    .flatMap((p) => p.hypotheses)
    .filter((h) => id in h.scores)
    .map((h) => {
      const scores = normalize(pick(h.scores, ids))
      return Object.fromEntries(main.map((m) => [m, scores[m] ?? 0]))
    })
  const parts = Object.entries(normalize(meanByKey(shares)))
    .map(([m, v]) => ({ id: m, weight: Math.round(v / 5) * 5 }))
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
  return parts.length ? parts : main.map((m) => ({ id: m, weight: 1 }))
}

/**
 * Candidat ajouté automatiquement : petit candidat (imputé dans les hypothèses qui ne le testent pas),
 * avec des valeurs par défaut (nom court, parti, bloc non classé, couleurs neutres, reports au prorata)
 * à compléter à la main.
 */
export function autoCandidate(
  id: CandidateId,
  name: string,
  polls: Poll[],
  candidates: Candidate[],
): Candidate {
  const used = new Set(candidates.map((c) => c.color))
  const autos = candidates.filter((c) => c.auto).length
  const [color, colorDark] =
    AUTO_COLORS.find(([c]) => !used.has(c)) ?? AUTO_COLORS[autos % AUTO_COLORS.length]!
  const main = candidates.filter((c) => !c.minor).map((c) => c.id)
  return {
    id,
    name,
    shortName: surname(name),
    party: 'Non renseigné',
    bloc: null,
    color,
    colorDark,
    duelProfile: null,
    ref2022: null,
    ref2022Note: 'aucune référence 2022 : pas de correction ni de progression.',
    minor: {
      transfers: [
        {
          id: 'ensemble',
          label: 'Comme l’ensemble des électeurs',
          parts: electorateParts(id, polls, main),
          note:
            'Hypothèse par défaut, sans source : candidat ajouté automatiquement par la synchronisation des ' +
            'sondages. Ses électeurs se reportent comme l’ensemble des électeurs des candidats principaux dans ' +
            'les hypothèses qui le testent (poids arrondis à 5 points). À remplacer par une répartition sourcée.',
        },
      ],
    },
    auto: true,
  }
}

/**
 * Fait passer dans les candidats simulés ceux qui sont testés dans les sondages (`testedNewcomers`) : ils
 * quittent les candidats non simulés et deviennent des candidats ajoutés automatiquement (`autoCandidate`).
 * Un candidat cité dans un jeu d'hypothèses (Hollande, exclu de tous) reste non simulé : son traitement
 * est déjà décidé dans les données, et un jeu d'hypothèses ne peut pas citer un petit candidat.
 */
export function promoteTested(data: PollsData): { data: PollsData; promoted: Candidate[] } {
  const listed = new Set(data.hypothesisSets.flatMap((s) => [...s.require, ...s.exclude]))
  const ids = testedNewcomers(data.polls, new Set(data.candidates.map((c) => c.id))).filter(
    (id) => !listed.has(id),
  )
  if (!ids.length) return { data, promoted: [] }
  const candidates = [...data.candidates]
  for (const id of ids) {
    const name = data.otherCandidates.find((c) => c.id === id)?.name ?? id
    candidates.push(autoCandidate(id, name, data.polls, candidates))
  }
  return {
    data: { ...data, candidates, otherCandidates: data.otherCandidates.filter((c) => !ids.includes(c.id)) },
    promoted: candidates.slice(data.candidates.length),
  }
}

export interface SyncReport {
  changed: boolean
  asOf: string
  period: string
  added: string[]
  replaced: string[]
  removed: string[]
  secondRound: number
  /** Duels sans part sans intention de vote, à saisir d'après la notice. */
  missingNoIntention: string[]
  /** Synthèses et notices nouvellement associées, par sondage. */
  newLinks: string[]
  /** Candidats apparus dans les sondages, ajoutés aux candidats simulés avec des valeurs par défaut. */
  promoted: string[]
  /** Nouveaux candidats non simulés (testés seulement à la place d'un autre candidat). */
  newCandidates: string[]
  /** Lignes de la période écartées. */
  skipped: string[]
}

/**
 * Remplace les sondages par ceux de la période la plus récente de la page, avec la synthèse de chaque
 * institut et la notice de la Commission des sondages quand elles sont repérées (`links`). Un candidat
 * apparu dans les sondages est ajouté aux candidats simulés (`promoteTested`). Les données ne changent (et
 * la date de référence n'avance) que si la période, un sondage, un candidat, un lien ou un duel change.
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
  const draft: PollsData = {
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
  }
  const { data: promotedData, promoted } = promoteTested(draft)
  // Les duels ne gardent que des candidats simulés : nouvelle lecture avec les candidats ajoutés.
  const duels = promoted.length
    ? fromWikipedia(wikitext, resolver, new Set(promotedData.candidates.map((c) => c.id)))!.secondRound
    : wiki.secondRound
  const secondRoundPolls = keepNoIntention(current.secondRoundPolls, selectDuels(duels))
  const next: PollsData = { ...promotedData, secondRoundPolls }

  const content = (d: PollsData) =>
    stableStringify([d.period, d.candidates, d.polls, d.secondRoundPolls, d.otherCandidates, d.collection])
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
      missingNoIntention: secondRoundPolls
        .filter((d) => !d.noIntention)
        .map((d) => `${d.institute} ${d.fieldwork.end} (${Object.keys(d.scores).join('-')})`),
      // Liens ajoutés par cette synchronisation : ni sur la page, ni dans les données précédentes.
      newLinks: polls.flatMap((p, i) => {
        const known = new Set([...selected[i]!.sources.map((s) => s.url), ...(urlsBefore.get(p.id) ?? [])])
        const added = p.sources.filter((s) => s.kind && !known.has(s.url))
        return added.length ? [`${p.id} (${added.map((s) => s.label).join(', ')})`] : []
      }),
      promoted: promoted.map((c) => c.name),
      newCandidates: next.otherCandidates
        .filter((c) => !current.otherCandidates.some((o) => o.id === c.id))
        .map((c) => c.name),
      skipped: wiki.skipped,
    },
  }
}
