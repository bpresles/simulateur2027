import { simulationData } from '../data/schema'
import sigmaCalibrationJson from '../data/sigma-calibration.json'
import { buildSigmaCalibrationCases } from './backtest'
import { SIGMA_CAMPAIGN_REF, runMonteCarlo } from './monteCarlo'
import {
  CALIBRATION_YEARS,
  COVERAGE_TARGET,
  HORIZON_BANDS,
  argminIndex,
  calibrationDates,
  calibrationHorizons,
  clopperPearson,
  closestIndex,
  coverageByElection,
  coverageStat,
  crpsByElection,
  crpsFromSamples,
  horizonBand,
  leaveOneOutCoverage,
  meanByElection,
  parseSigmaCalibration,
  pooledCrps,
  sigmaGrid,
} from './sigmaCalibration'
import { defaultSettings, simulate } from './simulate'

describe('CRPS empirique', () => {
  it('vaut |x − y| pour un échantillon dégénéré', () => {
    expect(crpsFromSamples([3], 5)).toBeCloseTo(2, 12)
  })

  it('cas analytique à deux points : {0 ; 2} face à 1 → 1 − ½·1 = 0,5', () => {
    expect(crpsFromSamples([0, 2], 1)).toBeCloseTo(0.5, 12)
    expect(crpsFromSamples([2, 0], 1)).toBeCloseTo(0.5, 12)
  })

  it('loi uniforme [0 ; 1] face à 0,5 : E|X − y| = 0,25, E|X − X′| = 1/3 → CRPS = 1/12', () => {
    const n = 2000
    const x = Array.from({ length: n }, (_, i) => (i + 0.5) / n)
    expect(crpsFromSamples(x, 0.5)).toBeCloseTo(1 / 12, 3)
  })
})

describe('dates et grille', () => {
  it('J−150 à J−24 tous les 14 jours (10 horizons), jamais en deçà de J−14', () => {
    const h = calibrationHorizons()
    expect(h).toEqual([150, 136, 122, 108, 94, 80, 66, 52, 38, 24])
    expect(Math.min(...h)).toBeGreaterThanOrEqual(14)
  })

  it('convertit les horizons en dates ISO relatives au 1er tour', () => {
    const d = calibrationDates('2022-04-10')
    expect(d[0]).toEqual({ daysBefore: 150, date: '2021-11-11' })
    expect(d.at(-1)).toEqual({ daysBefore: 24, date: '2022-03-17' })
  })

  it('grille 0,30 à 1,20 de pas 0,005 (181 valeurs) ; tranches d’horizon', () => {
    const g = sigmaGrid()
    expect(g).toHaveLength(181)
    expect(g[0]).toBe(0.3)
    expect(g.at(-1)).toBe(1.2)
    expect(g).toContain(0.83)
    expect(HORIZON_BANDS.map((b) => horizonBand(b.max))).toEqual(HORIZON_BANDS.map((b) => b.id))
    expect(horizonBand(100)).toBe('J-150..J-100')
    expect(horizonBand(99)).toBe('J-99..J-50')
    expect(horizonBand(24)).toBe('J-49..J-14')
  })

  it('sélection des dates sur les données : seules les dates à moyenne calculable, sans repli de date', () => {
    const { cases, skipped } = buildSigmaCalibrationCases(simulationData)
    expect(cases.length + skipped.length).toBe(30)
    for (const c of cases) {
      expect(c.institutesUsed).toBeGreaterThan(0)
      expect(c.daysBefore).toBeLessThanOrEqual(150)
      expect(c.daysBefore).toBeGreaterThanOrEqual(14)
      expect(Object.keys(c.evaluated).length).toBeGreaterThan(0)
      for (const v of Object.values(c.evaluated)) expect(v).toBeGreaterThanOrEqual(2)
    }
    for (const y of CALIBRATION_YEARS) expect(cases.some((c) => c.year === y)).toBe(true)
    // 2012 : sondages conformes à l'offre (hors non-candidats) seulement à partir de mi-mars 2012
    expect(cases.filter((c) => c.year === 2012).every((c) => c.date >= '2012-03-17')).toBe(true)
  })
})

describe('agrégation et sélection', () => {
  it('CRPS : moyenne par date, puis par élection, puis poids égal par élection ; argmin au plus petit σ à égalité', () => {
    const by = crpsByElection([
      { year: 2012, daysBefore: 24, crps: [3, 1, 2] },
      { year: 2017, daysBefore: 24, crps: [1, 2, 3] },
      { year: 2017, daysBefore: 38, crps: [3, 2, 1] },
      { year: 2022, daysBefore: 24, crps: [2, 1, 3] },
    ])
    expect(by[2017]).toEqual([2, 2, 2])
    const pooled = pooledCrps(by, CALIBRATION_YEARS)
    expect(pooled).toEqual([7 / 3, 4 / 3, 7 / 3])
    expect(argminIndex(pooled)).toBe(1)
    expect(argminIndex([1, 1, 2])).toBe(0)
  })

  it('couverture : points regroupés au sein de chaque élection, puis poids égal par élection ; plus proche de 80 %', () => {
    const cov = coverageByElection([
      { year: 2012, daysBefore: 24, covered: [2, 3, 4], total: 4 },
      { year: 2017, daysBefore: 24, covered: [1, 2, 3], total: 3 },
      { year: 2017, daysBefore: 38, covered: [0, 4, 5], total: 7 },
      { year: 2022, daysBefore: 24, covered: [5, 8, 10], total: 10 },
    ])
    // 2017 : (1 + 0) / 10, (2 + 4) / 10, (3 + 5) / 10 — pas la moyenne des taux par date
    expect(cov[2017]).toEqual([0.1, 0.6, 0.8])
    const mean = meanByElection(cov, CALIBRATION_YEARS)
    expect(mean[1]).toBeCloseTo((0.75 + 0.6 + 0.8) / 3, 12)
    expect(closestIndex(mean, COVERAGE_TARGET)).toBe(1)
    // À égalité de distance, le plus petit σ
    expect(closestIndex([0.7, 0.9, 0.8, 0.8], 0.8)).toBe(2)
    expect(closestIndex([0.75, 0.85], 0.8)).toBe(0)
    const crps = { 2012: [1, 2, 3], 2017: [4, 5, 6], 2022: [7, 8, 9] }
    const loo = leaveOneOutCoverage(cov, crps, [0.3, 0.4, 0.5])
    expect(loo.map((r) => r.heldOut)).toEqual([2012, 2017, 2022])
    // 2012 exclue : 2017 (0,1 ; 0,6 ; 0,8) et 2022 (0,5 ; 0,8 ; 1) → moyenne (0,3 ; 0,7 ; 0,9) → 0,7 et 0,9 à égalité → σ = 0,4
    expect(loo[0]).toEqual({ heldOut: 2012, sigma: 0.4, coverage: 0.75, crps: 2 })
  })

  it('intervalle binomial exact de Clopper-Pearson', () => {
    const [lo0, hi0] = clopperPearson(0, 10)
    expect(lo0).toBe(0)
    expect(hi0).toBeCloseTo(1 - 0.025 ** (1 / 10), 6)
    const [loN, hiN] = clopperPearson(10, 10)
    expect(loN).toBeCloseTo(0.025 ** (1 / 10), 6)
    expect(hiN).toBe(1)
    const s = coverageStat(8, 10)
    expect(s.rate).toBe(0.8)
    expect(s.ci95[0]).toBeCloseTo(0.4439, 3)
    expect(s.ci95[1]).toBeCloseTo(0.9748, 3)
  })
})

describe('Monte-Carlo : tirages bruts de 1er tour', () => {
  it('renvoie les tirages sans modifier les quantiles, et firstRoundOnly donne les mêmes tirages de 1er tour pour σ identique', () => {
    const settings = defaultSettings()
    const sim = simulate(simulationData, settings)
    const base = {
      data: simulationData,
      settings,
      baseScores: Object.fromEntries(sim.firstRound.map((r) => [r.candidateId, r.score])),
      candidatesById: new Map(simulationData.polls.candidates.map((c) => [c.id, c])),
      minorTransfers: {},
      blankNullShare: 0.02,
      displayedDuel: [sim.secondRound.a, sim.secondRound.b] as [string, string],
      iterations: 100,
      seed: 7,
    }
    const plain = runMonteCarlo(base)
    const withSamples = runMonteCarlo({ ...base, returnSamples: true })
    expect(plain.firstRoundSamples).toBeUndefined()
    expect(withSamples.candidates).toEqual(plain.candidates)
    const id = sim.firstRound[0]!.candidateId
    expect(withSamples.firstRoundSamples![id]).toHaveLength(100)
    const only = runMonteCarlo({ ...base, returnSamples: true, firstRoundOnly: true })
    expect(Array.from(only.firstRoundSamples![id]!.slice(0, 1))).toEqual(Array.from(withSamples.firstRoundSamples![id]!.slice(0, 1)))
  })
})

describe('sigma-calibration.json', () => {
  const cal = parseSigmaCalibration(sigmaCalibrationJson)

  it('est valide et SIGMA_CAMPAIGN_REF en est la valeur appliquée', () => {
    expect(cal.sigmaRef).toBe(SIGMA_CAMPAIGN_REF)
    expect(cal.iterations).toBe(2000)
  })

  it('σ retenu = couverture moyenne par élection la plus proche de 80 % sur la courbe publiée (plus petit σ à égalité)', () => {
    expect(cal.coverageTarget).toBe(0.8)
    const ref = cal.curve.find((p) => p.sigma === cal.sigmaRef)!
    expect(ref.coverageMean).toBe(cal.coverageAtSigmaRef)
    expect(ref.pooled).toBe(cal.crpsAtSigmaRef)
    const dRef = Math.abs(ref.coverageMean - cal.coverageTarget)
    for (const p of cal.curve) {
      const d = Math.abs(p.coverageMean - cal.coverageTarget)
      expect(d).toBeGreaterThanOrEqual(dRef - 1e-9)
      if (Math.abs(d - dRef) < 1e-9) expect(p.sigma).toBeGreaterThanOrEqual(cal.sigmaRef)
    }
    expect(cal.sigmaRef).toBeGreaterThan(0.3)
    expect(cal.sigmaRef).toBeLessThan(1.2)
  })

  it('publie le minimum du CRPS en diagnostic, cohérent avec la courbe', () => {
    const min = cal.curve.reduce((a, b) => (b.pooled < a.pooled ? b : a))
    expect(min.sigma).toBe(cal.crpsArgmin.sigma)
    expect(cal.crpsArgmin.crps).toBeCloseTo(min.pooled, 10)
    expect(cal.coverage.pooled.rate).toBeCloseTo(cal.curve.find((p) => p.sigma === cal.sigmaRef)!.coveragePooled, 4)
  })

  it('publie 3 σ hors échantillon, la couverture poolée et par élection / tranche', () => {
    expect(cal.leaveOneOut.map((r) => r.heldOut)).toEqual([2012, 2017, 2022])
    expect(cal.coverage.pooled.total).toBe(cal.coverage.byYear.reduce((s, r) => s + r.stat.total, 0))
    expect(cal.coverage.pooled.total).toBe(cal.coverage.byHorizonBand.reduce((s, r) => s + r.stat.total, 0))
    expect(cal.coverage.pooled.ci95[0]).toBeLessThanOrEqual(cal.coverage.pooled.rate)
    expect(cal.coverage.pooled.ci95[1]).toBeGreaterThanOrEqual(cal.coverage.pooled.rate)
  })

  it('rejette un JSON incomplet', () => {
    expect(() => parseSigmaCalibration({ sigmaRef: 0.4 })).toThrow(/sigma-calibration/)
  })
})
