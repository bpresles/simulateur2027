// Liens de chaque sondage au-delà de la page Wikipedia : synthèse publiée par l'institut (repérée dans le flux
// de ses publications) et notice déposée à la Commission des sondages (repérée dans la liste des notices).
import type { Poll, PollSource } from '../domain/types'
import { FEEDS, SYNTHESES, canonicalInstitute, isoDate, knownInstitute } from './feeds'
import { month } from './wikipedia'

/** Une notice de la liste de la Commission (« 10324 Pres IV ELABE 17 octobre ») et son jour de publication. */
export interface NoticeEntry {
  title: string
  url: string
  date: string
}

/** Une publication du flux d'un institut. */
export interface FeedItem {
  title: string
  url: string
  date: string
}

/** Notices et publications récentes des instituts (nom harmonisé) ; vides si leur site était injoignable. */
export interface LinkSources {
  notices: NoticeEntry[]
  publications: Record<string, FeedItem[]>
}

export const NO_LINKS: LinkSources = { notices: [], publications: {} }

export const SYNTHESIS_LABEL = 'Synthèse de l’institut'
export const NOTICE_LABEL = 'Notice (Commission des sondages)'

/** Délai maximal entre la fin du terrain et la publication de la synthèse ou de la notice. */
const PUBLICATION_DAYS = 10

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Texte d'un titre HTML ou RSS : entités décodées, section CDATA dépliée, espaces réduits. */
const text = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec?: string, hex?: string, name?: string) =>
      dec || hex ? String.fromCodePoint(dec ? Number(dec) : parseInt(hex!, 16)) : (ENTITIES[name!] ?? m),
    )
    .replace(/\s+/g, ' ')
    .trim()

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10)

/** Publié après la fin du terrain, dans le délai habituel. */
const publishedAfter = (date: string, poll: Poll) =>
  date >= poll.fieldwork.end && date <= addDays(poll.fieldwork.end, PUBLICATION_DAYS)

const earliest = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date))[0]

// ——— Notices de la Commission des sondages ———

/**
 * Notices de la liste de la Commission, rangées sous des titres de mois (« Octobre 2026 ») ; le jour de
 * publication termine le titre de chaque notice. Une notice de décembre listée en janvier tombe l'année
 * précédente.
 */
export function parseNoticeIndex(html: string): NoticeEntry[] {
  const entries: NoticeEntry[] = []
  let heading: { year: number; month: number } | undefined
  for (const m of html.matchAll(
    /<h2[^>]*notices-mois-titre[^>]*>([^<]*)<\/h2>|<a href="([^"]*\/notices\/medias\/fichiers\/add\/\d+)"[^>]*>([^<]*)<\/a>/g,
  )) {
    if (m[1] !== undefined) {
      const h = plain(text(m[1])).match(/([a-z]+)\s+(\d{4})/)
      heading = h && month(h[1]!) >= 0 ? { year: Number(h[2]), month: month(h[1]!) } : undefined
      continue
    }
    const title = text(m[3]!)
    const day = plain(title).match(/(\d{1,2})(?:er)?\s+([a-z]+)$/)
    const dayMonth = day ? month(day[2]!) : -1
    if (!heading || !day || dayMonth < 0) continue
    const date = isoDate(heading.year - (dayMonth > heading.month + 1 ? 1 : 0), dayMonth, Number(day[1]))
    if (date) entries.push({ title, url: new URL(m[2]!, FEEDS.notices.url).href, date })
  }
  return entries
}

/** Notice d'intentions de vote à la présidentielle : « Pres IV … », « Pres Presitrack … ». */
export function isVotingIntentionNotice(title: string): boolean {
  const t = plain(title)
  return (
    /^\d+\s+pres\b/.test(t) &&
    /\biv\b|intentions? de vote|presitrack|barometre (de l.)?(election )?presidentielle/.test(t)
  )
}

/** Notice d'intentions de vote de l'institut publiée le plus tôt après la fin du terrain. */
export function findNotice(poll: Poll, notices: NoticeEntry[]): NoticeEntry | undefined {
  const institute = canonicalInstitute(poll.institute)
  return earliest(
    notices.filter(
      (n) =>
        knownInstitute(n.title) === institute &&
        isVotingIntentionNotice(n.title) &&
        publishedAfter(n.date, poll),
    ),
  )
}

// ——— Synthèses des instituts ———

/** Publications d'un flux RSS, avec leur jour de publication. */
export function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const tag = (name: string) => text(item!.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '')
    const time = Date.parse(tag('pubDate'))
    const url = tag('link')
    return url && !Number.isNaN(time)
      ? [{ title: tag('title'), url, date: new Date(time).toISOString().slice(0, 10) }]
      : []
  })
}

/** Synthèse d'intentions de vote publiée par l'institut le plus tôt après la fin du terrain. */
export function findSynthesis(poll: Poll, items: FeedItem[]): FeedItem | undefined {
  const title = SYNTHESES[canonicalInstitute(poll.institute)]?.title
  return title && earliest(items.filter((i) => title.test(plain(i.title)) && publishedAfter(i.date, poll)))
}

// ——— Ajout aux sondages ———

const isNotice = (s: PollSource) => s.kind === 'notice' || /commission-des-sondages\.fr/.test(s.url)

/**
 * Ajoute à chaque sondage la synthèse de l'institut, en premier, et sa notice si la page n'en donne pas.
 * Un lien trouvé lors d'une synchronisation précédente est gardé quand il n'est plus repérable (site
 * injoignable, publication sortie du flux) ; une synthèse saisie à la main l'est aussi.
 */
export function addLinks(polls: Poll[], previous: Poll[], sources: LinkSources): Poll[] {
  const before = new Map(previous.map((p) => [p.id, p.sources]))
  return polls.map((poll) => {
    const kept = before.get(poll.id) ?? []
    const own = poll.sources.map((s): PollSource => (isNotice(s) ? { ...s, kind: 'notice' } : s))
    const item = findSynthesis(poll, sources.publications[canonicalInstitute(poll.institute)] ?? [])
    const synthesis: PollSource | undefined = item
      ? { label: SYNTHESIS_LABEL, url: item.url, kind: 'synthese' }
      : [...own, ...kept].find((s) => s.kind === 'synthese')
    const hasNotice = own.some(isNotice)
    const entry = hasNotice ? undefined : findNotice(poll, sources.notices)
    const notices: PollSource[] = hasNotice
      ? []
      : entry
        ? [{ label: NOTICE_LABEL, url: entry.url, kind: 'notice' }]
        : kept.filter((s) => s.kind === 'notice')
    const links = [...(synthesis ? [synthesis] : []), ...notices]
    return {
      ...poll,
      sources: [...links, ...own.filter((s) => s.kind !== 'synthese' && !links.some((l) => l.url === s.url))],
    }
  })
}
