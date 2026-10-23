import type { CandidateId, Entrant, Fieldwork, NoIntention, SimulationResult } from '../domain/types'

const formatters = new Map<number, Intl.NumberFormat>()
function nf(digits: number): Intl.NumberFormat {
  let f = formatters.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(digits, f)
  }
  return f
}

const NNBSP = ' '
const MINUS = '−'

export const num = (v: number, digits = 1) => nf(digits).format(v).replace('-', MINUS)

/** 20,8 % (espace fine insécable, typographie française). */
export const pct = (v: number, digits = 1) => `${num(v, digits)}${NNBSP}%`

/** +4,6 pts / −1,2 pts */
export const pts = (v: number, digits = 1) => {
  const rounded = Number(v.toFixed(digits))
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '±'
  return `${sign}${nf(digits).format(Math.abs(rounded))}${NNBSP}pt${Math.abs(rounded) >= 2 ? 's' : ''}`
}

export const ratio = (v: number) => `×${num(v, 2)}`

/**
 * Arrondit des parts à `digits` décimales en gardant leur total, arrondi (méthode du plus fort reste) :
 * on tronque, puis on ajoute une unité aux plus grands restes. Arrondies une à une, les parts du 1er tour
 * totaliseraient parfois 100,1 % ou 99,9 %.
 */
export function roundToTotal(values: number[], digits = 1): number[] {
  const scale = 10 ** digits
  const scaled = values.map((v) => v * scale)
  const units = scaled.map((v) => Math.floor(v + 1e-9))
  const missing = Math.round(scaled.reduce((s, v) => s + v, 0)) - units.reduce((s, v) => s + v, 0)
  const byRemainder = scaled.map((_, i) => i).sort((i, j) => scaled[j]! - units[j]! - (scaled[i]! - units[i]!))
  for (const i of byRemainder.slice(0, Math.max(0, missing))) units[i]! += 1
  return units.map((u) => u / scale)
}

const shownScores = new WeakMap<SimulationResult, Map<CandidateId, number>>()

/** Score affiché d'un candidat au 1er tour : au dixième, les scores affichés totalisant 100,0 %. */
export function shownScore(result: SimulationResult, entrant: Entrant): number {
  let shown = shownScores.get(result)
  if (!shown) {
    const rounded = roundToTotal(result.entrants.map((e) => e.score))
    shown = new Map(result.entrants.map((e, i) => [e.id, rounded[i]!]))
    shownScores.set(result, shown)
  }
  return shown.get(entrant.id) ?? entrant.score
}

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function date(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Terrain : 14-16/10/2026, 24/09-07/10/2026 ou 08/04/2022. */
export function fieldwork({ start, end }: Fieldwork): string {
  if (start === end) return date(end)
  const [ys, ms, ds] = start.split('-')
  const [ye, me] = end.split('-')
  if (ys === ye && ms === me) return `${ds}-${date(end)}`
  if (ys === ye) return `${ds}/${ms}-${date(end)}`
  return `${date(start)}-${date(end)}`
}

export const integer = (v: number) => new Intl.NumberFormat('fr-FR').format(v)

export const NO_INTENTION_BASES: Record<NoIntention['base'], string> = {
  inscrits: 'des inscrits',
  votants: 'des inscrits comptant voter',
}

/** « 33 % des inscrits », « ≈ 36 % des inscrits » (part calculée), « 37 % des inscrits comptant voter, dont 14 % d’indécis ». */
export function noIntentionLabel(n: NoIntention): string {
  const undecided = n.undecided === undefined ? '' : `, dont ${pct(n.undecided, 0)} d’indécis`
  return `${n.calculation ? '≈ ' : ''}${pct(n.share, 0)} ${NO_INTENTION_BASES[n.base]}${undecided}`
}

/** « de 19 à 50 % » */
export const range = (min: number, max: number) => `de ${num(min, 0)} à ${pct(max, 0)}`
