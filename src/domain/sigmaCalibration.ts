/**
 * Calage de `SIGMA_CAMPAIGN_REF` sur plusieurs dates par élection (v2.2, amendements du 23/11/2026 à la règle 3,
 * voir `docs/changelog-methode.md`). Règle retenue (second amendement) : σ dont la couverture [P10 ; P90] moyenne
 * par élection est la plus proche de 80 % ; le CRPS est publié en diagnostic. Fonctions pures : le balayage
 * Monte-Carlo lui-même est lancé hors de l'application par `scripts/calibrate-sigma.ts`, qui écrit
 * `src/data/sigma-calibration.json`.
 */
import { addDays } from './pollAverage'

export const CALIBRATION_YEARS = [2012, 2017, 2022] as const
export type CalibrationYear = (typeof CALIBRATION_YEARS)[number]

/** Dates d'évaluation : J−150, J−136, …, J−24 (tous les 14 jours, jusqu'à J−14 au plus tard). */
export const CALIBRATION_MAX_DAYS_BEFORE = 150
export const CALIBRATION_MIN_DAYS_BEFORE = 14
export const CALIBRATION_STEP_DAYS = 14

/** Grille de σ : 0,30 à 1,20, pas 0,005. */
export const SIGMA_GRID_MIN = 0.3
export const SIGMA_GRID_MAX = 1.2
export const SIGMA_GRID_STEP = 0.005

/** Couverture nominale visée par les intervalles [P10 ; P90]. */
export const COVERAGE_TARGET = 0.8

/** Tirages et graine communs à toutes les valeurs de σ. */
export const CALIBRATION_ITERATIONS = 2000
export const CALIBRATION_SEED = 2027

export const HORIZON_BANDS = [
  { id: 'J-150..J-100', min: 100, max: 150 },
  { id: 'J-99..J-50', min: 50, max: 99 },
  { id: 'J-49..J-14', min: 14, max: 49 },
] as const

export function calibrationHorizons(): number[] {
  const out: number[] = []
  for (let d = CALIBRATION_MAX_DAYS_BEFORE; d >= CALIBRATION_MIN_DAYS_BEFORE; d -= CALIBRATION_STEP_DAYS) out.push(d)
  return out
}

/** Dates candidates (ISO) pour une élection : une par horizon, J = date du 1er tour. */
export function calibrationDates(electionDate: string): { daysBefore: number; date: string }[] {
  return calibrationHorizons().map((daysBefore) => ({ daysBefore, date: addDays(electionDate, -daysBefore) }))
}

export function horizonBand(daysBefore: number): string {
  return HORIZON_BANDS.find((b) => daysBefore >= b.min && daysBefore <= b.max)?.id ?? 'hors-tranche'
}

export function sigmaGrid(): number[] {
  const n = Math.round((SIGMA_GRID_MAX - SIGMA_GRID_MIN) / SIGMA_GRID_STEP)
  return Array.from({ length: n + 1 }, (_, i) => Math.round((SIGMA_GRID_MIN + i * SIGMA_GRID_STEP) * 1000) / 1000)
}

/**
 * CRPS empirique d'un échantillon `x` face à l'observation `y` : E|X − y| − ½ E|X − X'|.
 * E|X − X'| est calculé sur toutes les paires ordonnées (i = j inclus) par la formule des rangs :
 * (2/n²) Σ (2i − n − 1) x₍ᵢ₎ (i de 1 à n, échantillon trié).
 */
export function crpsFromSamples(samples: ArrayLike<number>, y: number): number {
  const n = samples.length
  if (n === 0) return Number.NaN
  const x = Float64Array.from(samples).sort()
  let sumAbs = 0
  let sumRank = 0
  for (let i = 0; i < n; i++) {
    sumAbs += Math.abs(x[i]! - y)
    sumRank += (2 * (i + 1) - n - 1) * x[i]!
  }
  const meanAbs = sumAbs / n
  const meanPair = (2 * sumRank) / (n * n)
  return meanAbs - 0.5 * meanPair
}

const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length

/** Un point de la grille de σ évalué sur une date : CRPS moyen sur les candidats évalués. */
export interface DateCrps {
  year: CalibrationYear
  daysBefore: number
  /** CRPS moyen par valeur de σ (même ordre que la grille). */
  crps: number[]
}

/** Moyenne par date (déjà faite), puis par élection : un vecteur (un CRPS par σ) par élection. */
export function crpsByElection(dates: readonly DateCrps[]): Record<CalibrationYear, number[]> {
  const out = {} as Record<CalibrationYear, number[]>
  for (const year of CALIBRATION_YEARS) {
    const mine = dates.filter((d) => d.year === year)
    if (mine.length === 0) continue
    const len = mine[0]!.crps.length
    out[year] = Array.from({ length: len }, (_, k) => mean(mine.map((d) => d.crps[k]!)))
  }
  return out
}

/** Moyenne simple (poids égal) des élections demandées, pour chaque σ de la grille. */
export function pooledCrps(byElection: Record<CalibrationYear, number[]>, years: readonly CalibrationYear[]): number[] {
  const curves = years.map((y) => byElection[y]).filter((c): c is number[] => c !== undefined)
  if (curves.length === 0) return []
  return curves[0]!.map((_, k) => mean(curves.map((c) => c[k]!)))
}

/** Indice du minimum (le plus petit σ en cas d'égalité exacte). */
export function argminIndex(curve: readonly number[]): number {
  let best = 0
  for (let i = 1; i < curve.length; i++) if (curve[i]! < curve[best]!) best = i
  return best
}

/** Couverture [P10 ; P90] d'une date : nombre de candidats couverts par valeur de σ (même ordre que la grille). */
export interface DateCoverage {
  year: CalibrationYear
  daysBefore: number
  covered: number[]
  total: number
}

/**
 * Taux de couverture par élection pour chaque σ : points candidat-date regroupés au sein de l'élection
 * (Σ couverts / Σ évalués sur ses dates).
 */
export function coverageByElection(dates: readonly DateCoverage[]): Record<CalibrationYear, number[]> {
  const out = {} as Record<CalibrationYear, number[]>
  for (const year of CALIBRATION_YEARS) {
    const mine = dates.filter((d) => d.year === year)
    if (mine.length === 0) continue
    const total = mine.reduce((s, d) => s + d.total, 0)
    const len = mine[0]!.covered.length
    out[year] = Array.from({ length: len }, (_, k) => mine.reduce((s, d) => s + d.covered[k]!, 0) / total)
  }
  return out
}

/** Moyenne simple (poids égal) des élections demandées, pour chaque σ (même agrégation que `pooledCrps`). */
export const meanByElection = pooledCrps

/** Indice de la valeur la plus proche de `target` (le plus petit σ en cas d'égalité). */
export function closestIndex(curve: readonly number[], target: number): number {
  let best = 0
  for (let i = 1; i < curve.length; i++) {
    if (Math.abs(curve[i]! - target) < Math.abs(curve[best]! - target) - 1e-12) best = i
  }
  return best
}

export interface LeaveOneOutRow {
  heldOut: CalibrationYear
  /** σ choisi sur les deux autres élections par la règle de couverture. */
  sigma: number
  /** Couverture [P10 ; P90] de l'élection exclue à ce σ. */
  coverage: number
  /** CRPS de l'élection exclue à ce σ (diagnostic). */
  crps: number
}

/** Validation hors échantillon de la règle de couverture : σ choisi sur deux élections, mesuré sur la troisième. */
export function leaveOneOutCoverage(
  coverage: Record<CalibrationYear, number[]>,
  crps: Record<CalibrationYear, number[]>,
  grid: readonly number[],
): LeaveOneOutRow[] {
  return CALIBRATION_YEARS.filter((y) => coverage[y] !== undefined).map((heldOut) => {
    const rest = CALIBRATION_YEARS.filter((y) => y !== heldOut)
    const k = closestIndex(meanByElection(coverage, rest), COVERAGE_TARGET)
    return { heldOut, sigma: grid[k]!, coverage: coverage[heldOut]![k]!, crps: crps[heldOut]?.[k] ?? Number.NaN }
  })
}

/** Intervalle binomial exact de Clopper-Pearson (bilatéral, niveau `1 − alpha`). */
export function clopperPearson(k: number, n: number, alpha = 0.05): [number, number] {
  if (n <= 0) return [0, 1]
  // P(X ≥ k | p) croissante en p ; P(X ≤ k | p) décroissante en p.
  const logChoose = (a: number, b: number) => logFact(a) - logFact(b) - logFact(a - b)
  const cdfLe = (kk: number, p: number) => {
    if (kk < 0) return 0
    if (kk >= n) return 1
    if (p <= 0) return 1
    if (p >= 1) return 0
    let s = 0
    for (let i = 0; i <= kk; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p))
    return Math.min(1, s)
  }
  const bisect = (f: (p: number) => number, target: number, increasing: boolean) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      const v = f(mid)
      if (increasing ? v < target : v > target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const lower = k <= 0 ? 0 : bisect((p) => 1 - cdfLe(k - 1, p), alpha / 2, true)
  const upper = k >= n ? 1 : bisect((p) => cdfLe(k, p), alpha / 2, false)
  return [lower, upper]
}

const factCache: number[] = [0, 0]
function logFact(n: number): number {
  for (let i = factCache.length; i <= n; i++) factCache[i] = factCache[i - 1]! + Math.log(i)
  return factCache[n]!
}

export interface CoverageStat {
  covered: number
  total: number
  rate: number
  ci95: [number, number]
}

export function coverageStat(covered: number, total: number): CoverageStat {
  return { covered, total, rate: total > 0 ? covered / total : 0, ci95: clopperPearson(covered, total) }
}

/** Point de la courbe publiée : CRPS (diagnostic) et couverture (critère) pour un σ. */
export interface SigmaCurvePoint {
  sigma: number
  /** CRPS moyen (poids égal par élection). */
  pooled: number
  byYear: Partial<Record<CalibrationYear, number>>
  /** Couverture [P10 ; P90] : moyenne simple des 3 élections (critère de choix). */
  coverageMean: number
  /** Couverture [P10 ; P90] : tous points candidat-date confondus. */
  coveragePooled: number
  coverageByYear: Partial<Record<CalibrationYear, number>>
}

/** Contenu de `src/data/sigma-calibration.json` (écrit par `scripts/calibrate-sigma.ts`). */
export interface SigmaCalibration {
  /** Date de génération (AAAA-MM-JJ). */
  generatedOn: string
  iterations: number
  seed: number
  grid: { min: number; max: number; step: number }
  coverageTarget: number
  /** σ retenu (couverture moyenne par élection la plus proche de 80 %), appliqué à `SIGMA_CAMPAIGN_REF`. */
  sigmaRef: number
  coverageAtSigmaRef: number
  crpsAtSigmaRef: number
  /** Diagnostic : minimum du CRPS (règle du premier amendement, abandonnée). */
  crpsArgmin: { sigma: number; crps: number; coverageMean: number }
  /** Valeurs antérieures, consignées pour comparaison (même prévision par défaut). */
  previous: { sigma: number; crps: number; coverageMean: number; label: string }[]
  /** Sélection de σ (grille grossière, voisinage du σ retenu et du minimum du CRPS, valeurs antérieures). */
  curve: SigmaCurvePoint[]
  leaveOneOut: LeaveOneOutRow[]
  /** Dates effectivement retenues par élection. */
  datesByElection: { year: CalibrationYear; daysBefore: number[]; skippedDaysBefore: number[] }[]
  /** Couverture détaillée au σ retenu. */
  coverage: {
    pooled: CoverageStat
    byYear: { year: CalibrationYear; stat: CoverageStat }[]
    byHorizonBand: { band: string; stat: CoverageStat }[]
  }
  /** Contrôle : prévision brute (sans projection) au σ retenu. */
  rawControl: { crps: number; coverage: CoverageStat }
}

/** Valide et renvoie le JSON de calibration ; lève une erreur explicite s'il est incomplet ou incohérent. */
export function parseSigmaCalibration(raw: unknown): SigmaCalibration {
  const r = raw as Partial<SigmaCalibration> | null
  const fail = (m: string): never => {
    throw new Error(`sigma-calibration.json invalide : ${m}`)
  }
  if (!r || typeof r !== 'object') return fail('objet attendu')
  if (typeof r.sigmaRef !== 'number' || !(r.sigmaRef > 0)) return fail('sigmaRef')
  if (typeof r.coverageTarget !== 'number') return fail('coverageTarget')
  if (typeof r.coverageAtSigmaRef !== 'number') return fail('coverageAtSigmaRef')
  if (typeof r.crpsAtSigmaRef !== 'number') return fail('crpsAtSigmaRef')
  if (!r.crpsArgmin || typeof r.crpsArgmin.sigma !== 'number') return fail('crpsArgmin')
  if (!Array.isArray(r.curve) || r.curve.length === 0) return fail('curve')
  if (!r.curve.every((c) => typeof c.coverageMean === 'number' && typeof c.coveragePooled === 'number'))
    return fail('curve (couverture)')
  if (!Array.isArray(r.leaveOneOut) || r.leaveOneOut.length !== CALIBRATION_YEARS.length) return fail('leaveOneOut')
  if (!Array.isArray(r.datesByElection) || r.datesByElection.length !== CALIBRATION_YEARS.length) return fail('datesByElection')
  if (!r.coverage || !r.coverage.pooled || !Array.isArray(r.coverage.byYear) || !Array.isArray(r.coverage.byHorizonBand))
    return fail('coverage')
  if (!r.rawControl) return fail('rawControl')
  if (!r.curve.some((c) => Math.abs(c.sigma - r.sigmaRef!) < 1e-9)) return fail('sigmaRef absent de la courbe')
  return r as SigmaCalibration
}
