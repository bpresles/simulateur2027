// Mesures de participation (« certains d'aller voter ») lues dans le texte des notices et rapports de l'Ifop :
// fonctions pures, sans I/O. Le téléchargement des PDF et l'extraction du texte sont dans scripts/sync-polls.ts.
import type { TurnoutMeasure } from '../domain/types'
import { isoDate } from './feeds'
import { NO_SPONSOR, month, sponsorFromNotice } from './wikipedia'

/** Origine d'un document : son adresse et, si on la connaît, le titre de sa notice dans la liste de la Commission. */
export interface TurnoutSource {
  url: string
  title?: string
}

/** Un terrain qui se termine après cette date vise la présidentielle de 2027, sinon celle de 2022. */
const CYCLE_BOUNDARY = '2022-04-10'

const NUMBER = String.raw`\d+(?:,\d+)?`
/** Part (%) à virgule décimale. */
const toNumber = (raw: string) => Number(raw.replace(',', '.'))
/** Dernière valeur numérique d'une ligne : la colonne « Redressé », après la colonne « Brut ». */
const lastNumber = (line: string) => {
  const found = line.match(new RegExp(NUMBER, 'g'))
  return found ? toNumber(found.at(-1)!) : undefined
}

/** Date de terrain en toutes lettres : « du 27 au 29 octobre 2026 », « les 12 et 13 novembre 2026 », « le 14 novembre 2026 ». */
export function parseFieldworkText(raw: string): { start: string; end: string } | undefined {
  const t = raw.replace(/\s+/g, ' ')
  const day = String.raw`(\d{1,2})(?:er)?`
  const word = String.raw`(\p{L}+\.?)`
  const year = String.raw`(\d{4})`
  const range = t.match(
    new RegExp(String.raw`\bdu ${day}(?: ${word})?(?: ${year})? au ${day} ${word} ${year}`, 'iu'),
  )
  if (range) {
    const endMonth = month(range[5]!)
    const startMonth = range[2] ? month(range[2]) : endMonth
    if (endMonth < 0 || startMonth < 0) return undefined
    const end = isoDate(Number(range[6]), endMonth, Number(range[4]))
    const start = isoDate(range[3] ? Number(range[3]) : Number(range[6]), startMonth, Number(range[1]))
    return start && end && start <= end ? { start, end } : undefined
  }
  const pair = t.match(new RegExp(String.raw`\bles ${day} et ${day} ${word} ${year}`, 'iu'))
  if (pair) {
    const m = month(pair[3]!)
    const start = isoDate(Number(pair[4]), m, Number(pair[1]))
    const end = isoDate(Number(pair[4]), m, Number(pair[2]))
    return m >= 0 && start && end && start <= end ? { start, end } : undefined
  }
  const single = t.match(new RegExp(String.raw`\ble ${day} ${word} ${year}`, 'iu'))
  if (single) {
    const m = month(single[2]!)
    const end = isoDate(Number(single[3]), m, Number(single[1]))
    return m >= 0 && end ? { start: end, end } : undefined
  }
  return undefined
}

/** Jour et mois d'une date ISO (« 27/10 »), avec l'année si `withYear`. */
const dm = (iso: string, withYear = false) => {
  const [y, m, d] = iso.split('-')
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`
}

/** Dates de terrain d'un libellé : « 27–29/10/2026 », « 30/09–02/10/2026 », « 14/11/2026 ». */
function fieldworkLabel({ start, end }: { start: string; end: string }): string {
  if (start === end) return dm(end, true)
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${dm(start, true)}–${dm(end, true)}`
  if (start.slice(0, 7) === end.slice(0, 7)) return `${start.slice(8)}–${dm(end, true)}`
  return `${dm(start)}–${dm(end, true)}`
}

/** Commanditaire : « Etude réalisée par Ifop pour LCI » → « LCI », à défaut le nom de la notice. */
function sponsorOf(flat: string, source: TurnoutSource): string | undefined {
  const m = flat.match(/\bEtude(?: réalisée)?(?: par)? (?:l['’])?Ifop(?:-Fiducial)? pour (.+?) (?:Echantillon|Échantillon)\b/)
  if (m) return m[1]
  const fromUrl = sponsorFromNotice(source.url)
  return fromUrl === NO_SPONSOR ? undefined : fromUrl
}

/** Question sur la présidentielle (et non sur un autre scrutin) : « envisagez-vous d'aller voter … présidentielle ». */
const isPresidentialQuestion = (lines: string[], i: number) => {
  const question = lines.slice(i, i + 4).join(' ')
  const cut = question.search(/\?/)
  const head = cut >= 0 ? question.slice(0, cut) : question
  return /pr[ée]sidentielle/i.test(head) && !/municipal|législative|legislative|régional|regional|départemental|departemental|européen|europeen|sénatorial|senatorial/i.test(head)
}

/**
 * Mesure de participation d'une notice ou d'un rapport Ifop (texte extrait du PDF) : « envisagez-vous d'aller
 * voter à la prochaine élection présidentielle » (ligne « Oui ») puis « tout à fait certain », chiffres redressés
 * (dernière valeur de la ligne). Renvoie null si le document ne pose pas ces questions pour la présidentielle,
 * si la date de terrain est illisible ou si une valeur est invraisemblable (envisage entre 50 et 100, certain
 * entre 30 et 100) : un changement de format est ainsi signalé plutôt que mal lu.
 */
export function parseTurnoutNotice(text: string, source: TurnoutSource): TurnoutMeasure | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const flat = lines.join(' ').replace(/\s+/g, ' ')

  let envisage: number | undefined
  let certain: number | undefined
  for (let i = 0; i < lines.length && envisage === undefined; i++) {
    if (!/envisagez-vous d.aller voter/i.test(lines[i]!) || !isPresidentialQuestion(lines, i)) continue
    const yes = lines.findIndex((l, j) => j > i && j <= i + 12 && /^\W*Oui\b/i.test(l))
    if (yes < 0) continue
    const sure = lines.findIndex(
      (l, j) => j > yes && j <= yes + 25 && new RegExp(String.raw`^\W*(?:C.est )?tout à fait certain\W*(?:${NUMBER}\s*)+$`, 'i').test(l.replace(/[.…·]{2,}/g, ' ')),
    )
    if (sure < 0) continue
    envisage = lastNumber(lines[yes]!.replace(/^\W*Oui/i, ''))
    certain = lastNumber(lines[sure]!)
  }
  if (envisage === undefined || certain === undefined) return null
  if (envisage < 50 || envisage > 100 || certain < 30 || certain > 100) return null

  const online = flat.match(/en ligne ((?:du|les?) .{3,70}?\d{4})/i)
  // Sans « en ligne … » on ne devine pas : la date de l'élection citée dans la question serait prise pour le terrain.
  const fieldwork = online ? parseFieldworkText(online[1]!) : undefined
  if (!fieldwork) return null

  const sponsor = sponsorOf(flat, source)
  const origin = /commission-des-sondages\.fr/.test(source.url) ? 'notice de la Commission des sondages' : 'rapport Ifop'
  return {
    id: `ifop-${fieldwork.end}`,
    cycle: fieldwork.end > CYCLE_BOUNDARY ? 2027 : 2022,
    fieldwork,
    envisage,
    certain,
    source: {
      label: `Ifop-Fiducial${sponsor ? ` pour ${sponsor}` : ''}, ${fieldworkLabel(fieldwork)} (${origin})`,
      url: source.url,
    },
  }
}

/**
 * Ajoute les mesures trouvées à celles des données, sans doublon : même scrutin et même fin de terrain, ou même
 * adresse. Une mesure existante (saisie à la main ou non) n'est ni modifiée ni retirée. Le résultat est trié par
 * scrutin puis par date ; `added` liste les mesures effectivement ajoutées.
 */
export function mergeTurnoutMeasures(
  current: TurnoutMeasure[],
  found: TurnoutMeasure[],
): { measures: TurnoutMeasure[]; added: TurnoutMeasure[] } {
  const all = [...current]
  const added: TurnoutMeasure[] = []
  for (const m of found) {
    const duplicate = all.some(
      (c) => (c.cycle === m.cycle && c.fieldwork.end === m.fieldwork.end) || c.source.url === m.source.url,
    )
    if (duplicate) continue
    all.push(m)
    added.push(m)
  }
  const measures = all
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.cycle - b.m.cycle || a.m.fieldwork.end.localeCompare(b.m.fieldwork.end) || a.i - b.i)
    .map(({ m }) => m)
  return { measures, added }
}

/**
 * Texte du fichier des mesures : JSON indenté de 2 espaces, avec les dates de terrain et les mesures de
 * contrôle sur une ligne, comme dans la saisie manuelle (le diff d'une synchronisation ne porte que sur les
 * mesures ajoutées).
 */
export function serializeTurnout(data: unknown): string {
  const json = JSON.stringify(data, null, 2)
    .replace(/\{\s*("start": "[^"]*"),\s*("end": "[^"]*")\s*\}/g, '{ $1, $2 }')
    .replace(/\{\s*("fieldwork": \{[^}]*\}),\s*("share": [\d.]+),\s*("election": [^\n}]+?)\s*\}/g, '{ $1, $2, $3 }')
  return `${json}\n`
}
