// Lecture de la page Wikipedia « Liste de sondages sur l'élection présidentielle française de 2027 »,
// à partir de son wikitext : sondages de 1er tour de la période la plus récente, duels de 2nd tour.
import type { Fieldwork, Hypothesis, Poll, SecondRoundPoll } from '../domain/types'
import { CandidateResolver, FEEDS, isoDate, knownInstitute, pollId } from './feeds'

export interface WikipediaPolls {
  /** Période la plus récente du 1er tour : titre de sa section et premier jour. */
  period: { label: string; start: string }
  /** Sondages de cette période, dans l'ordre de la page (une entrée par bloc institut / dates / échantillon). */
  polls: Poll[]
  /** Duels de 2nd tour entre candidats simulés terminés depuis le début de la période. */
  secondRound: SecondRoundPoll[]
  /** Lignes de la période écartées, pour le rapport. */
  skipped: string[]
}

/** Commanditaire : absent des tableaux, déduit quand c'est possible du nom de la notice officielle. */
export const NO_SPONSOR = 'Non indiqué'

/** Un total plus éloigné de 100 signale une ligne mal saisie ou décalée. */
const TOTAL_TOLERANCE = { firstRound: 3, secondRound: 1 }

interface Cell {
  attrs: string
  text: string
  header: boolean
}
type Row = Cell[]

interface Table {
  /** Titres des sections englobantes, par niveau (2 pour « == … == »). */
  headings: string[]
  rows: Row[]
}

interface Person {
  name: string
  keys: string[]
}

/** Une valeur de cellule ; `person` : candidat nommé dans la cellule (remplaçant ou colonne « Autres »). */
interface Entry {
  value: number
  person?: Person
}

interface PollRow {
  /** Cellules institut, dates et échantillon : identiques sur toutes les hypothèses d'un sondage. */
  head: string
  institute: string
  url?: string
  fieldwork: Fieldwork
  sampleSize: number
  /** Valeurs de chaque colonne, avec le candidat de la colonne (absent pour « Autres »). */
  columns: { candidate: Person | null; entries: Entry[] }[]
}

interface Period {
  label: string
  year?: number
  start?: string
  rows: PollRow[]
  skipped: string[]
}

// ——— Wikitext ———

/** Découpe au premier niveau : hors des liens [[…]], [url …] et des modèles {{…}}. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i))
      start = i + sep.length
      i += sep.length - 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/**
 * Une cellule « attributs | contenu » ou « contenu ». Les attributs peuvent être produits par un modèle :
 * « {{Infobox Parti politique français/couleurs|RN}} | '''{{blanc|32,5}}''' ».
 */
function cell(raw: string, header: boolean): Cell {
  const [first, ...rest] = splitTopLevel(raw, '|')
  const attributes = /=|^\s*$/.test(first!) || /^\s*(\{\{[^{}]*\}\}\s*)+$/.test(first!)
  return rest.length > 0 && attributes
    ? { attrs: first!, text: rest.join('|'), header }
    : { attrs: '', text: raw, header }
}

const span = (c: Cell, name: 'rowspan' | 'colspan') =>
  Math.max(1, Number(c.attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'))?.[1] ?? 1))

/** Texte affiché : modèles de mise en forme dépliés, notes, balises et gras retirés. */
const clean = (s: string) =>
  s
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*(?:blanc|nobr|nowrap|nombre|formatnum)\s*[|:]\s*([^{}|]*)[^{}]*\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    // Balises seulement : « <1 » est une valeur.
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/'''?|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Tous les tableaux de la page, avec les titres des sections qui les contiennent. */
function readTables(text: string): Table[] {
  const tables: Table[] = []
  const headings: string[] = []
  let table: Table | undefined
  let row: Row = []
  let depth = 0
  for (const line of text.split('\n').map((l) => l.trim())) {
    const heading = depth === 0 ? line.match(/^(={2,6})\s*(.+?)\s*\1$/) : null
    if (heading) {
      const level = heading[1]!.length
      headings.length = level
      headings[level] = clean(heading[2]!)
      continue
    }
    if (line.startsWith('{|')) {
      if (++depth === 1) [table, row] = [{ headings: [...headings], rows: [] }, []]
    } else if (line.startsWith('|}')) {
      if (--depth === 0 && table) {
        if (row.length) table.rows.push(row)
        tables.push(table)
        table = undefined
      }
    } else if (!table || depth > 1 || line.startsWith('|+')) {
      continue
    } else if (line.startsWith('|-')) {
      if (row.length) table.rows.push(row)
      row = []
    } else if (line.startsWith('!')) {
      row.push(
        ...splitTopLevel(line.slice(1), '!!')
          .flatMap((p) => splitTopLevel(p, '||'))
          .map((p) => cell(p, true)),
      )
    } else if (line.startsWith('|')) {
      row.push(...splitTopLevel(line.slice(1), '||').map((p) => cell(p, false)))
    } else if (row.length) {
      row.at(-1)!.text += `\n${line}`
    }
  }
  return tables
}

/** Développe les cellules fusionnées : chaque ligne reçoit une cellule par colonne (la même si fusionnée). */
function expand(rows: Row[]): Row[] {
  const pending: { cell: Cell; rows: number }[] = []
  return rows.map((row) => {
    const out: Row = []
    const queue = [...row]
    for (let col = 0; queue.length > 0 || (pending[col]?.rows ?? 0) > 0; col++) {
      const carried = pending[col]
      if (carried && carried.rows > 0) {
        carried.rows--
        out.push(carried.cell)
        continue
      }
      const c = queue.shift()!
      const [rows, cols] = [span(c, 'rowspan'), span(c, 'colspan')]
      for (let k = 0; k < cols; k++) {
        pending[col + k] = { cell: c, rows: rows - 1 }
        out.push(c)
      }
      col += cols - 1
    }
    return out
  })
}

// ——— Valeurs ———

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const MONTHS = ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec']
/** Numéro du mois (0 à 11) d'un nom de mois, éventuellement abrégé (« sept. »), sinon -1. */
const month = (name: string) => {
  const m = fold(name).replace(/\./g, '')
  return MONTHS.findIndex((p) => m.startsWith(p))
}

/**
 * Dates de terrain : « 14-16 octobre », « 24 septembre - 7 octobre », « 1er-3 octobre 2026 ».
 * Sans année, celle de la section (`year`) ; un mois de début postérieur au mois de fin tombe l'année
 * précédente.
 */
export function parseFieldwork(raw: string, year?: number): Fieldwork | undefined {
  const t = fold(clean(raw)).match(
    /^(?:(\d{1,2})(?:er)?\s*([a-z.]+)?\s*[-–]\s*)?(\d{1,2})(?:er)?\s+([a-z.]+)(?:\s+(\d{4}))?$/,
  )
  if (!t) return undefined
  const endYear = t[5] ? Number(t[5]) : year
  const endMonth = month(t[4]!)
  if (!endYear || endMonth < 0) return undefined
  const end = isoDate(endYear, endMonth, Number(t[3]))
  if (!end) return undefined
  if (!t[1]) return { start: end, end }
  const startMonth = t[2] ? month(t[2]) : endMonth
  if (startMonth < 0) return undefined
  const start = isoDate(startMonth > endMonth ? endYear - 1 : endYear, startMonth, Number(t[1]))
  return start && start <= end ? { start, end } : undefined
}

/** Score en % (« 15,5 », « <1 ») ; null si le candidat n'est pas testé (« — »), undefined si illisible. */
export function parsePercent(raw: string): number | null | undefined {
  const t = clean(raw).replace(/%/g, '').replace(',', '.').trim()
  if (t === '' || /^[–—-]$/.test(t)) return null
  // « <1 » : moitié du seuil, faute de chiffre publié.
  const below = t.match(/^<\s*(\d+(?:\.\d+)?)$/)
  if (below) return Number(below[1]) / 2
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : undefined
}

/** Premier lien interne qui n'est pas une image : le candidat nommé. */
function person(text: string): Person | undefined {
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const target = m[1]!.trim()
    if (/^(fichier|file|image):/i.test(target)) continue
    const name = target.replace(/\s*\([^)]*\)$/, '')
    return { name, keys: [name, clean(m[2] ?? name)] }
  }
  return undefined
}

/** Valeurs d'une cellule, séparées par <hr> : « 4<br><small>'''[[David Lisnard|Lisnard]]'''</small> ». */
function cellEntries(text: string): (Entry | null | undefined)[] {
  return text.split(/<hr\s*\/?>/i).map((segment) => {
    const value = parsePercent(segment.replace(/<small>[\s\S]*?<\/small>|\[\[[^\]]*\]\]/gi, ''))
    return value === null || value === undefined ? value : { value, person: person(segment) }
  })
}

/** Lien externe [url libellé] ou interne [[cible|libellé]] d'une cellule institut. */
function firm(raw: string): { label: string; url?: string } {
  const external = raw.match(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/)
  if (external) return { label: clean(external[2]!), url: external[1] }
  const internal = raw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  return { label: clean(internal ? (internal[2] ?? internal[1]!) : raw) }
}

const SPONSOR_NAMES: Record<string, string> = {
  bfmtv: 'BFMTV',
  cnews: 'CNews',
  huffpost: 'HuffPost',
  jdd: 'JDD',
  lci: 'LCI',
  lcp: 'LCP',
  m6: 'M6',
  rtl: 'RTL',
  tf1: 'TF1',
}

const INSTITUTE_SLUG =
  /(?:^|-)(?:ifop(?:-fiducial)?|elabe|yougov|opinionway|odoxa|cluster-?17|(?:toluna-)?harris(?:-interactive)?|ipsos(?:-bva)?|bva|verian|csa|viavoice)(?=-|$)/

/**
 * Commanditaire lu dans le nom de la notice de la Commission des sondages, après le nom de l'institut :
 * « 10323-pres-iv-yougov-le-huffpost-18-octobre.pdf » → « Le HuffPost ».
 */
export function sponsorFromNotice(url: string | undefined): string {
  const slug = url?.match(
    /commission-des-sondages\.fr\/.*\/\d+-pres-([a-z0-9-]+?)-\d{1,2}(?:er)?-[a-z]+\.pdf$/i,
  )?.[1]
  const parts = slug?.toLowerCase().split(INSTITUTE_SLUG)
  const words = parts && parts.length > 1 ? parts.at(-1)!.split('-').filter(Boolean) : []
  if (words.length === 0) return NO_SPONSOR
  return words
    .map((w, i) => SPONSOR_NAMES[w] ?? (i === 0 || w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

const frDate = (iso: string) => iso.split('-').reverse().join('/')

// ——— Tableaux ———

/** Lignes de sondages d'un tableau « sondeur | dates | échantillon | un candidat par colonne | autres ». */
function readPollRows(
  table: Table,
  year: number | undefined,
  tolerance: number,
  skipped: string[],
): PollRow[] {
  const grid = expand(table.rows)
  const headers = grid.filter((r) => r.every((c) => c.header))
  const meta = (headers[0] ?? []).slice(0, 3).map((c) => fold(clean(c.text)))
  if (!/sondeur/.test(meta[0] ?? '') || !/date/.test(meta[1] ?? '') || !/echantillon/.test(meta[2] ?? '')) {
    skipped.push(`Tableau « ${table.headings.at(-1)} » ignoré : colonnes inattendues (${meta.join(', ')})`)
    return []
  }
  const width = Math.max(...headers.map((r) => r.length))
  const candidates = Array.from(
    { length: width },
    (_, i) => headers.map((r) => (r[i] ? person(r[i].text) : undefined)).find(Boolean) ?? null,
  )

  const result: PollRow[] = []
  for (const row of grid.filter((r) => !r.every((c) => c.header))) {
    const values = row.slice(3)
    // Lignes de couleurs (aucune valeur chiffrée) ou d'événement (une cellule sur toute la largeur).
    if (!values.some((c) => /\d/.test(clean(c.text))) || row.some((c) => span(c, 'colspan') >= width - 3))
      continue
    const { label, url } = firm(row[0]?.text ?? '')
    const fieldwork = row[1] && parseFieldwork(row[1].text, year)
    const skip = (problem: string) =>
      skipped.push(`${label || '?'}${fieldwork ? ` (${frDate(fieldwork.end)})` : ''} : ${problem}`)
    if (row.length !== width) {
      skip(`${row.length} cellules pour ${width} colonnes`)
      continue
    }
    if (!fieldwork) {
      skip(`dates illisibles (« ${clean(row[1]!.text)} »)`)
      continue
    }
    const institute = knownInstitute(label)
    if (!institute) {
      skip('institut inconnu')
      continue
    }
    const sampleSize = Number(clean(row[2]!.text).replace(/\D/g, ''))
    // Une cellule fusionnée sur plusieurs colonnes (colonne PS double) ne compte qu'une fois.
    const columns = values.flatMap((c, i) =>
      i > 0 && values[i - 1] === c
        ? []
        : [{ candidate: candidates[i + 3] ?? null, entries: cellEntries(c.text) }],
    )
    const entries = columns.flatMap((col) => col.entries)
    if (!sampleSize || entries.some((e) => e === undefined)) {
      skip(`${sampleSize ? 'score' : 'échantillon'} illisible`)
      continue
    }
    const total = entries.reduce((s, e) => s + (e?.value ?? 0), 0)
    if (Math.abs(total - 100) > tolerance) {
      skip(`total de ${Math.round(total * 10) / 10} %`)
      continue
    }
    result.push({
      head: row
        .slice(0, 3)
        .map((c) => c.text)
        .join('|'),
      institute,
      url,
      fieldwork,
      sampleSize,
      columns: columns.map((col) => ({
        candidate: col.candidate,
        entries: col.entries.filter((e): e is Entry => !!e),
      })),
    })
  }
  return result
}

/** Année et premier jour d'une période : « Octobre-décembre 2026 », « Premier semestre 2026 », « Année 2025 ». */
function periodStart(label: string): { year?: number; start?: string } {
  const year = Number(label.match(/\b(\d{4})\b/)?.[1]) || undefined
  if (!year) return {}
  const folded = fold(label)
  const first = folded
    .match(/[a-z]+/g)
    ?.map(month)
    .find((m) => m >= 0)
  return { year, start: isoDate(year, first ?? (/second semestre/.test(folded) ? 6 : 0), 1) }
}

const surname = (name: string) => name.split(' ').slice(1).join(' ') || name

export function fromWikipedia(
  text: string,
  resolver: CandidateResolver,
  simulated: ReadonlySet<string>,
): WikipediaPolls | undefined {
  const tables = readTables(text)
  const idOf = (p: Person) => resolver.resolve(p.keys, p.name, surname(p.name))
  const names = new Map<string, string>()

  // 1er tour : sections « Année AAAA » (la section « Autres » compte le vote blanc comme exprimé).
  const periods = new Map<string, Period>()
  for (const table of tables) {
    if (
      !/premier tour/i.test(table.headings[2] ?? '') ||
      !/^annee \d{4}$/.test(fold(table.headings[3] ?? ''))
    )
      continue
    const label = table.headings.at(-1)!
    const yearHeading = [...table.headings].reverse().find((h) => h && /\b\d{4}\b/.test(h)) ?? ''
    const period = periods.get(label) ?? { label, ...periodStart(yearHeading), rows: [], skipped: [] }
    period.rows.push(...readPollRows(table, period.year, TOTAL_TOLERANCE.firstRound, period.skipped))
    periods.set(label, period)
  }
  const latestEnd = (p: Period) => p.rows.reduce((m, r) => (r.fieldwork.end > m ? r.fieldwork.end : m), '')
  // La période la plus récente est celle dont un sondage se termine le plus tard, quel que soit son titre.
  const current = [...periods.values()]
    .filter((p) => p.rows.length > 0)
    .reduce<Period | undefined>((best, p) => (!best || latestEnd(p) > latestEnd(best) ? p : best), undefined)
  if (!current) return undefined

  const byHead = new Map<string, Poll>()
  const skipped = [...current.skipped]
  for (const row of current.rows) {
    const scores: Record<string, number> = {}
    const replacing: Record<string, string> = {}
    let duplicate = false
    for (const { candidate, entries } of row.columns) {
      const columnId = candidate ? idOf(candidate) : undefined
      for (const { value, person: named } of entries) {
        const p = named ?? candidate
        // Valeur non nommée de la colonne « Autres » : comptée dans le total seulement.
        if (!p) continue
        const id = idOf(p)
        if (id in scores) duplicate = true
        scores[id] = value
        names.set(id, clean(p.keys[1] ?? p.name))
        if (columnId && id !== columnId) replacing[id] = columnId
      }
    }
    if (duplicate) {
      skipped.push(`${row.institute} (${frDate(row.fieldwork.end)}) : candidat en double`)
      continue
    }
    // Un candidat nommé dans la colonne d'un autre le remplace, sauf si celui-ci est aussi testé.
    const replaced = Object.entries(replacing).filter(([, col]) => !(col in scores))
    const poll = byHead.get(row.head) ?? {
      id: pollId(row.institute, row.fieldwork.end),
      origin: 'wikipedia' as const,
      institute: row.institute,
      sponsor: sponsorFromNotice(row.url),
      fieldwork: row.fieldwork,
      sampleSize: row.sampleSize,
      sources: [
        ...(row.url
          ? [
              {
                label: /commission-des-sondages/.test(row.url)
                  ? 'Notice (Commission des sondages)'
                  : 'Publication',
                url: row.url,
              },
            ]
          : []),
        { label: 'Wikipedia – liste des sondages', url: FEEDS.wikipedia.page },
      ],
      note: 'Repris de Wikipedia : chiffres non revérifiés.',
      hypotheses: [],
    }
    poll.hypotheses.push({
      id: `H${poll.hypotheses.length + 1}`,
      scores,
      ...(replaced.length ? { replacing: Object.fromEntries(replaced) } : {}),
    })
    byHead.set(row.head, poll)
  }
  const polls = [...byHead.values()].map((p) => ({ ...p, hypotheses: labelHypotheses(p.hypotheses, names) }))

  // 2nd tour : un duel par ligne, à partir du début de la période.
  const start = [current.start, ...current.rows.map((r) => r.fieldwork.end)]
    .filter((d): d is string => !!d)
    .sort()[0]!
  const secondRound: SecondRoundPoll[] = []
  for (const table of tables.filter((t) => /second tour/i.test(t.headings[2] ?? ''))) {
    for (const row of readPollRows(table, current.year, TOTAL_TOLERANCE.secondRound, [])) {
      if (row.fieldwork.end < start) continue
      const entries = row.columns.flatMap((col) =>
        col.entries.map((e) => ({ value: e.value, person: e.person ?? col.candidate })),
      )
      const ids = entries.map((e) => (e.person ? idOf(e.person) : ''))
      // Comme au 1er tour, seuls les duels entre candidats simulés servent de repères.
      if (ids.length !== 2 || ids[0] === ids[1] || !ids.every((id) => simulated.has(id))) continue
      secondRound.push({
        origin: 'wikipedia',
        institute: row.institute,
        sponsor: sponsorFromNotice(row.url),
        fieldwork: row.fieldwork,
        sampleSize: row.sampleSize,
        url: row.url ?? FEEDS.wikipedia.page,
        scores: Object.fromEntries(ids.map((id, i) => [id, entries[i]!.value])),
      })
    }
  }
  return { period: { label: current.label, start }, polls, secondRound, skipped }
}

/** Candidats propres à chaque hypothèse (ceux qui ne sont pas testés partout), comme libellé. */
function labelHypotheses(hypotheses: Hypothesis[], names: Map<string, string>): Hypothesis[] {
  if (hypotheses.length < 2) return hypotheses
  const everywhere = Object.keys(hypotheses[0]!.scores).filter((id) =>
    hypotheses.every((h) => id in h.scores),
  )
  return hypotheses.map(({ id, scores, replacing }) => {
    const own = Object.keys(scores).filter((c) => !everywhere.includes(c))
    const label = own.length ? own.map((c) => names.get(c) ?? c).join(', ') : undefined
    return { id, label, scores, ...(replacing ? { replacing } : {}) }
  })
}
