import type { Fieldwork } from '../domain/types'

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
