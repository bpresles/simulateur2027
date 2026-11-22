import { simulationData } from '../data/schema'
import { computeBacktest } from './backtest'

describe('backtest (validation historique 2017, 2022 et 2024)', () => {
  const report = computeBacktest(simulationData, simulationData.polls)

  it('évalue la dernière semaine 2017 et 2022 : sondages bruts cohérents (< 2,5 pts de RMSE)', () => {
    expect(report.firstRoundEve).toHaveLength(2)
    const y2017 = report.firstRoundEve.find((r) => r.year === 2017)!
    const y2022 = report.firstRoundEve.find((r) => r.year === 2022)!
    expect(y2017.rawRmse).toBeLessThan(1)
    expect(y2022.rawRmse).toBeLessThan(2.5)
    // En 2017, la correction par ratio croisé depuis 2022 dégrade nettement la précision.
    expect(y2017.crossCorrectedRmse).toBeGreaterThan(y2017.rawRmse)
  })

  it('évalue la campagne 1er tour (filtre strict sans mélange Juppé/Fillon) et la projection croisée hors échantillon', () => {
    expect(report.firstRoundCampaign).toHaveLength(2)
    const y2017 = report.firstRoundCampaign.find((r) => r.year === 2017)!
    const y2022 = report.firstRoundCampaign.find((r) => r.year === 2022)!

    // En 2017, les primaires excluent tout mélange Juppé/Fillon/Hollande à J−148 : on avance à l'offre stabilisée.
    expect(y2017.usedStabilizedHorizon).toBe(true)
    expect(y2017.institutesUsed).toBeGreaterThanOrEqual(3)
    expect(y2017.effectiveDaysBefore).toBeLessThan(y2017.daysBefore)

    for (const row of report.firstRoundCampaign) {
      expect(row.institutesUsed).toBeGreaterThan(0)
      expect(row.rmse).toBeGreaterThan(1)
      expect(row.rmse).toBeLessThan(10)
      expect(row.projectedRmse).toBeGreaterThan(0)
      expect(row.crossProjectedRmse).toBeGreaterThan(0)
      expect(row.empiricalLogitRms).toBeGreaterThan(0.2)
    }
    expect(y2022.usedStabilizedHorizon).toBe(false)
    expect(y2022.crossProjectedRmse).toBeLessThan(y2022.rmse)
  })

  it('calcule la couverture empirique des intervalles Monte-Carlo à 80 % sur 2017 et 2022', () => {
    expect(report.coverage80).toHaveLength(2)
    for (const row of report.coverage80) {
      expect(row.evaluatedCount).toBeGreaterThanOrEqual(4)
      expect(row.coveredRaw).toBeGreaterThanOrEqual(0)
      expect(row.coveredRaw).toBeLessThanOrEqual(row.evaluatedCount)
      expect(row.coveredCrossProjected).toBeGreaterThanOrEqual(0)
      expect(row.coveredCrossProjected).toBeLessThanOrEqual(row.evaluatedCount)
      expect(row.secondRoundP10).toBeLessThan(row.secondRoundP90)
    }
  })

  it('évalue le 2nd tour présidentiel 2017 et 2022 avec les deux ancres mesurées (2022 et 2024)', () => {
    const y2017 = report.secondRoundPresidential.find((r) => r.year === 2017)!
    const y2022 = report.secondRoundPresidential.find((r) => r.year === 2022)!
    expect(y2017.actualAntiRn).toBeCloseTo(66.1, 1)
    expect(y2022.actualAntiRn).toBeCloseTo(58.55, 2)
    // L'ancre 2024 (hors échantillon) reste à < 3 pts sur 2022 et < 4 pts sur 2017 ;
    // l'ancre 2022 sur 2017 coïncide avec la présidentielle croisée et sous-estime 2022 (~3,6 pts) car Zemmour/NDA sont traités au taux de fidélité RN (96 %).
    expect(Math.abs(y2022.predLeg2024 - y2022.actualAntiRn)).toBeLessThan(3)
    expect(Math.abs(y2017.predLeg2024 - y2017.actualAntiRn)).toBeLessThan(4)
    expect(Math.abs(y2022.predPres2022 - y2022.actualAntiRn)).toBeLessThan(4)
    expect(y2017.predPres2022).toBeCloseTo(y2017.predCrossPresidential, 3)
  })

  it('vérifie la cohérence agrégée de l’enquête Ipsos-Talan brute sur les 342 duels de 2024', () => {
    expect(report.legislatives2024Coherence).toHaveLength(4)
    for (const row of report.legislatives2024Coherence) {
      expect(row.constituenciesCount).toBeGreaterThan(40)
      expect(Math.abs(row.gapPts), row.profileId).toBeLessThan(2.5)
    }
  })
})
