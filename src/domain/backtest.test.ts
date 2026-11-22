import { simulationData } from '../data/schema'
import { computeBacktest } from './backtest'

describe('backtest (validation historique 2017, 2022 et 2024)', () => {
  const report = computeBacktest(simulationData, simulationData.polls)

  it('évalue la dernière semaine 2017 et 2022 : sondages bruts cohérents (< 2 pts de RMSE)', () => {
    expect(report.firstRoundEve).toHaveLength(2)
    const y2017 = report.firstRoundEve.find((r) => r.year === 2017)!
    const y2022 = report.firstRoundEve.find((r) => r.year === 2022)!
    expect(y2017.rawRmse).toBeLessThan(1)
    expect(y2022.rawRmse).toBeLessThan(2.5)
    // En 2017, la correction par ratio croisé depuis 2022 dégrade nettement la précision.
    expect(y2017.crossCorrectedRmse).toBeGreaterThan(y2017.rawRmse)
  })

  it('évalue la campagne 1er tour à la même distance J−d (tous candidats inclus)', () => {
    expect(report.firstRoundCampaign).toHaveLength(2)
    for (const row of report.firstRoundCampaign) {
      expect(row.institutesUsed).toBeGreaterThan(0)
      expect(row.rmse).toBeGreaterThan(2)
      expect(row.rmse).toBeLessThan(10)
      expect(row.projectedRmse).toBeGreaterThan(0)
      expect(row.empiricalLogitRms).toBeGreaterThan(0.2)
    }
    const y2022 = report.firstRoundCampaign.find((r) => r.year === 2022)!
    expect(y2022.projectedRmse).toBeLessThan(y2022.rmse)
  })

  it('évalue le 2nd tour présidentiel 2017 et 2022 avec le modèle front républicain', () => {
    const y2017 = report.secondRoundPresidential.find((r) => r.year === 2017)!
    const y2022 = report.secondRoundPresidential.find((r) => r.year === 2022)!
    expect(y2017.actualAntiRn).toBeCloseTo(66.1, 1)
    expect(y2022.actualAntiRn).toBeCloseTo(58.55, 2)
    // Au repère de chaque scrutin (100 % en 2017, 75 % en 2022), le modèle reproduit 2022 à < 1 pt et 2017 à < 4 pts.
    expect(Math.abs(y2022.predRepublicanFront - y2022.actualAntiRn)).toBeLessThan(1)
    expect(Math.abs(y2017.predRepublicanFront - y2017.actualAntiRn)).toBeLessThan(4)
  })

  it('vérifie la cohérence agrégée de l’enquête Ipsos-Talan brute sur les 342 duels de 2024', () => {
    expect(report.legislatives2024Coherence).toHaveLength(4)
    for (const row of report.legislatives2024Coherence) {
      expect(row.constituenciesCount).toBeGreaterThan(40)
      expect(Math.abs(row.gapPts), row.profileId).toBeLessThan(2.5)
    }
  })
})
