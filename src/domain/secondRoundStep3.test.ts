import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import { computeBacktest } from './backtest'
import { computeR114ExtremeDroiteRow, computeStep3Report } from './secondRoundStep3'

describe('P1 étape 3 — sélection R1.3, ligne R1.14 et évaluation R1.4', () => {
  const report = computeStep3Report(simulationData, secondRoundReferenceMatrices)

  it('calcule exactement la ligne R1.14 (moyenne simple de Dupont-Aignan 2017 et Zemmour 2022)', () => {
    const ed = computeR114ExtremeDroiteRow(secondRoundReferenceMatrices, 'r1_1')
    expect(ed.row2017).toEqual({ finalist: 26.5, rn: 38, abstention: 35.5 })
    expect(ed.row2022).toEqual({ finalist: 9.5, rn: 75.5, abstention: 15 })
    expect(ed.pooled).toEqual({ finalist: 18, rn: 56.75, abstention: 25.25 })
    expect(ed.pooled.finalist + ed.pooled.rn + ed.pooled.abstention).toBeCloseTo(100, 9)
  })

  it('ne retient que (b) selon le seuil R1.3 (≥ 0,5 pt)', () => {
    expect(report.r13SelectedKeys).toEqual(['b'])
    expect(report.r13ExcludedByThreshold).toEqual(['a', 'd'])
  })

  it('concordance de la référence moteur actuel avec computeBacktest et stabilité exacte des législatives 2024', () => {
    const bt = computeBacktest(simulationData, simulationData.polls)
    const bt17 = bt.secondRoundPresidential.find((r) => r.year === 2017)!
    const bt22 = bt.secondRoundPresidential.find((r) => r.year === 2022)!

    expect(report.baseline.cross['2017'].predictedAntiRnPct).toBeCloseTo(bt17.predCrossPresidential, 9)
    expect(report.baseline.cross['2022'].predictedAntiRnPct).toBeCloseTo(bt22.predCrossPresidential, 9)
    expect(report.baseline.inSample['2022'].predictedAntiRnPct).toBeCloseTo(bt22.predPres2022, 9)

    // Avec (b) seul (R1.3), les agrégats législatives 2024 ne bougent pas (0,000 pt)
    expect(report.r13ByVariant.r1_1.leg2024.maxAbsDeltaPts).toBeCloseTo(0, 9)
    expect(report.r13ByVariant.r1_1.conditions.leg2024StableWithin05Pt).toBe(true)
  })

  it('évalue les trois conditions de R1.4 sans ajuster aucune donnée (rejet sur échantillon et croisé)', () => {
    const r = report.r13ByVariant.r1_1
    expect(r.conditions.inSampleBothUnder1Pt).toBe(false)
    expect(r.conditions.crossMeanNotDegraded).toBe(false)
    expect(r.conditions.leg2024StableWithin05Pt).toBe(true)
    expect(r.r14Passed).toBe(false)
    expect(r.crossMeanAbsErrorPts).toBeGreaterThan(report.baseline.crossMeanAbsErrorPts)
  })
})
