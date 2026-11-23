// Calage de SIGMA_CAMPAIGN_REF (v2.2, second amendement du 23/11/2026 à la règle 3, docs/changelog-methode.md) :
// σ dont la couverture [P10 ; P90] moyenne par élection est la plus proche de 80 % ; CRPS publié en diagnostic.
// Hors exécution de l'application : écrit src/data/sigma-calibration.json (versionné), lu par la page Méthodologie.
// Usage : bun scripts/calibrate-sigma.ts [--out chemin.json]
import { writeFile } from 'node:fs/promises'
import { simulationData } from '../src/data/schema'
import { buildSigmaCalibrationCases, sigmaCalibrationMcInput } from '../src/domain/backtest'
import type { SigmaCalibrationCase } from '../src/domain/backtest'
import { runMonteCarlo } from '../src/domain/monteCarlo'
import {
  CALIBRATION_ITERATIONS,
  CALIBRATION_SEED,
  CALIBRATION_YEARS,
  COVERAGE_TARGET,
  HORIZON_BANDS,
  SIGMA_GRID_MAX,
  SIGMA_GRID_MIN,
  SIGMA_GRID_STEP,
  argminIndex,
  closestIndex,
  coverageByElection,
  coverageStat,
  crpsByElection,
  crpsFromSamples,
  horizonBand,
  leaveOneOutCoverage,
  meanByElection,
  pooledCrps,
  sigmaGrid,
} from '../src/domain/sigmaCalibration'
import type { DateCoverage, DateCrps, SigmaCalibration } from '../src/domain/sigmaCalibration'

const outIdx = process.argv.indexOf('--out')
const outPath = outIdx >= 0 ? process.argv[outIdx + 1]! : new URL('../src/data/sigma-calibration.json', import.meta.url).pathname
const round = (x: number) => Math.round(x * 1e5) / 1e5

const data = simulationData
const { cases, skipped } = buildSigmaCalibrationCases(data)
const grid = sigmaGrid()
console.error(`${cases.length} dates retenues, ${skipped.length} écartées, ${grid.length} valeurs de σ`)

/** CRPS moyen sur les candidats évalués d'une date, plus couverture [P10 ; P90], pour un σ donné. */
function evaluate(c: SigmaCalibrationCase, base: Record<string, number>, sigma: number) {
  const mc = runMonteCarlo(
    sigmaCalibrationMcInput(data, c, base, sigma, CALIBRATION_ITERATIONS, CALIBRATION_SEED),
  )
  const ids = Object.keys(c.evaluated)
  let sum = 0
  let covered = 0
  for (const id of ids) {
    sum += crpsFromSamples(mc.firstRoundSamples![id]!, c.evaluated[id]!)
    const u = mc.candidates[id]
    if (u && c.evaluated[id]! >= u.p10 && c.evaluated[id]! <= u.p90) covered += 1
  }
  return { crps: sum / ids.length, covered, total: ids.length }
}

const t0 = Date.now()
const dateCrps: DateCrps[] = cases.map((c) => ({ year: c.year, daysBefore: c.daysBefore, crps: [] }))
const dateCov: DateCoverage[] = cases.map((c) => ({
  year: c.year,
  daysBefore: c.daysBefore,
  covered: [],
  total: Object.keys(c.evaluated).length,
}))
cases.forEach((c, ci) => {
  for (const sigma of grid) {
    const r = evaluate(c, c.crossProjectedScores, sigma)
    dateCrps[ci]!.crps.push(r.crps)
    dateCov[ci]!.covered.push(r.covered)
  }
  console.error(`  ${c.year} J−${c.daysBefore} fait (${Math.round((Date.now() - t0) / 1000)} s)`)
})

const byElection = crpsByElection(dateCrps)
const pooled = pooledCrps(byElection, CALIBRATION_YEARS)
const covByElection = coverageByElection(dateCov)
const covMean = meanByElection(covByElection, CALIBRATION_YEARS)
const totalPoints = dateCov.reduce((s, d) => s + d.total, 0)
const covPooled = grid.map((_, k) => dateCov.reduce((s, d) => s + d.covered[k]!, 0) / totalPoints)
const best = closestIndex(covMean, COVERAGE_TARGET)
const sigmaRef = grid[best]!
const crpsBest = argminIndex(pooled)
const loo = leaveOneOutCoverage(covByElection, byElection, grid)

// Contrôles au σ retenu : couverture (prévision par défaut) et prévision brute.
const cov = cases.map((c) => ({ c, r: evaluate(c, c.crossProjectedScores, sigmaRef) }))
const sum = (xs: { covered: number; total: number }[]) =>
  coverageStat(xs.reduce((s, x) => s + x.covered, 0), xs.reduce((s, x) => s + x.total, 0))
const raw = cases.map((c) => ({ c, r: evaluate(c, c.rawScores, sigmaRef) }))
const rawByElection = Object.fromEntries(
  CALIBRATION_YEARS.map((y) => {
    const mine = raw.filter((x) => x.c.year === y)
    return [y, mine.reduce((s, x) => s + x.r.crps, 0) / mine.length]
  }),
)
const rawCrps = CALIBRATION_YEARS.reduce((s, y) => s + rawByElection[y]!, 0) / CALIBRATION_YEARS.length

const PREVIOUS = [0.395, 0.595, 0.83]
const keep = new Set<number>()
grid.forEach((s, i) => {
  const onCoarse = Math.abs(s * 20 - Math.round(s * 20)) < 1e-6
  const special = PREVIOUS.some((p) => Math.abs(s - p) < 1e-9)
  if (onCoarse || special || Math.abs(i - best) <= 10 || Math.abs(i - crpsBest) <= 2) keep.add(i)
})
const at = (s: number) => grid.findIndex((g) => Math.abs(g - s) < 1e-9)
const byYear = (curves: Record<number, number[]>, i: number) =>
  Object.fromEntries(CALIBRATION_YEARS.map((y) => [y, round(curves[y]![i]!)]))

const result: SigmaCalibration = {
  generatedOn: new Date().toISOString().slice(0, 10),
  iterations: CALIBRATION_ITERATIONS,
  seed: CALIBRATION_SEED,
  grid: { min: SIGMA_GRID_MIN, max: SIGMA_GRID_MAX, step: SIGMA_GRID_STEP },
  coverageTarget: COVERAGE_TARGET,
  sigmaRef,
  coverageAtSigmaRef: round(covMean[best]!),
  crpsAtSigmaRef: round(pooled[best]!),
  crpsArgmin: { sigma: grid[crpsBest]!, crps: round(pooled[crpsBest]!), coverageMean: round(covMean[crpsBest]!) },
  previous: [
    { sigma: 0.395, label: 'minimum du CRPS (premier amendement du 23/11/2026, abandonné)' },
    { sigma: 0.83, label: 'règle de couverture v2.2 sur une date par élection (17/21 couverts)' },
    { sigma: 0.595, label: 'plus petit σ de la grille à 16/21 couverts (v2.2, avant recalage)' },
  ].map((p) => ({ ...p, crps: round(pooled[at(p.sigma)]!), coverageMean: round(covMean[at(p.sigma)]!) })),
  curve: [...keep]
    .sort((a, b) => a - b)
    .map((i) => ({
      sigma: grid[i]!,
      pooled: round(pooled[i]!),
      byYear: byYear(byElection, i),
      coverageMean: round(covMean[i]!),
      coveragePooled: round(covPooled[i]!),
      coverageByYear: byYear(covByElection, i),
    })),
  leaveOneOut: loo.map((r) => ({ ...r, coverage: round(r.coverage), crps: round(r.crps) })),
  datesByElection: CALIBRATION_YEARS.map((year) => ({
    year,
    daysBefore: cases.filter((c) => c.year === year).map((c) => c.daysBefore),
    skippedDaysBefore: skipped.filter((s) => s.year === year).map((s) => s.daysBefore),
  })),
  coverage: {
    pooled: sum(cov.map((x) => x.r)),
    byYear: CALIBRATION_YEARS.map((year) => ({ year, stat: sum(cov.filter((x) => x.c.year === year).map((x) => x.r)) })),
    byHorizonBand: HORIZON_BANDS.map((b) => ({
      band: b.id,
      stat: sum(cov.filter((x) => horizonBand(x.c.daysBefore) === b.id).map((x) => x.r)),
    })),
  },
  rawControl: { crps: round(rawCrps), coverage: sum(raw.map((x) => x.r)) },
}

await writeFile(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
console.error(
  `σ retenu ${sigmaRef} (couverture moyenne par élection ${(100 * covMean[best]!).toFixed(1)} %, poolée ${(100 * covPooled[best]!).toFixed(1)} %, CRPS ${pooled[best]!.toFixed(4)}) ; minimum du CRPS à ${grid[crpsBest]} ; écrit dans ${outPath} (${Math.round((Date.now() - t0) / 1000)} s)`,
)
