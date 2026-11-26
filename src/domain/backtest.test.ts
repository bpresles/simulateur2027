import { simulationData } from '../data/schema'
import { computeBacktest, computeUsefulVoteVariants } from './backtest'

describe('backtest (validation historique 2012, 2017, 2022 et 2024)', () => {
  const report = computeBacktest(simulationData, simulationData.polls)

  it('évalue la dernière semaine 2012, 2017 et 2022 : sondages bruts cohérents (< 2,5 pts de RMSE)', () => {
    expect(report.firstRoundEve).toHaveLength(3)
    const y2017 = report.firstRoundEve.find((r) => r.year === 2017)!
    const y2022 = report.firstRoundEve.find((r) => r.year === 2022)!
    expect(y2017.rawRmse).toBeLessThan(1)
    expect(y2022.rawRmse).toBeLessThan(2.5)
    // En 2017, la correction par ratio croisé depuis 2022 dégrade nettement la précision.
    expect(y2017.crossCorrectedRmse).toBeGreaterThan(y2017.rawRmse)
  })

  it('évalue la campagne 1er tour (filtre strict sans mélange Juppé/Fillon) et la projection croisée hors échantillon', () => {
    expect(report.firstRoundCampaign).toHaveLength(3)
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
      expect(row.empiricalLogitRms).toBeGreaterThan(0.1)
    }
    expect(y2022.usedStabilizedHorizon).toBe(false)
    expect(y2022.crossProjectedRmse).toBeLessThan(y2022.rmse)
  })

  it('calcule la couverture empirique des intervalles Monte-Carlo à 80 % sur 2012, 2017 et 2022', () => {
    expect(report.coverage80).toHaveLength(3)
    for (const row of report.coverage80) {
      expect(row.evaluatedCount).toBeGreaterThanOrEqual(4)
      expect(row.coveredRaw).toBeGreaterThanOrEqual(0)
      expect(row.coveredRaw).toBeLessThanOrEqual(row.evaluatedCount)
      expect(row.coveredCrossProjected).toBeGreaterThanOrEqual(0)
      expect(row.coveredCrossProjected).toBeLessThanOrEqual(row.evaluatedCount)
      if (row.year === 2012) {
        expect(row.secondRoundCovered).toBeNull()
        expect(row.secondRoundWidth80).toBeNull()
        expect(row.secondRoundCrps).toBeNull()
      } else {
        expect(row.secondRoundP10!).toBeLessThan(row.secondRoundP90!)
        expect(row.secondRoundWidth80!).toBeCloseTo(row.secondRoundP90! - row.secondRoundP10!, 8)
        expect(row.secondRoundCrps!).toBeGreaterThan(0)
        expect(row.secondRoundCrps!).toBeLessThan(15)
      }
    }
  })

  it('évalue le 2nd tour présidentiel 2017 et 2022 avec les deux ancres mesurées (2022 et 2024)', () => {
    const y2017 = report.secondRoundPresidential.find((r) => r.year === 2017)!
    const y2022 = report.secondRoundPresidential.find((r) => r.year === 2022)!
    expect(y2017.actualAntiRn).toBeCloseTo(66.1, 1)
    expect(y2022.actualAntiRn).toBeCloseTo(58.55, 2)
    // Sous P1-bis (S1–S5), l'ancre Lég. 2024 reproduit de près le front républicain fort de 2017 (< 1,5 pt)
    // et surestime logiquement le front républicain plus faible de 2022 (~+6,4 pts, sans les biais qui
    // masquaient cet écart en v2.2) ; l'ancre 2022 en échantillon est à ~−1,55 pt sur 2022 et coïncide avec
    // la présidentielle croisée sur 2017.
    expect(Math.abs(y2017.predLeg2024 - y2017.actualAntiRn)).toBeLessThan(1.5)
    expect(y2022.predLeg2024 - y2022.actualAntiRn).toBeGreaterThan(4)
    expect(y2022.predLeg2024 - y2022.actualAntiRn).toBeLessThan(8)
    expect(Math.abs(y2022.predPres2022 - y2022.actualAntiRn)).toBeLessThan(2)
    expect(y2017.predPres2022).toBeCloseTo(y2017.predCrossPresidential, 3)
    // Leave-one-out R2.4 sur les ancres (2017 sans ancre 2017 → [2022, 2024] ; 2022 sans ancre 2022 → [2017, 2024])
    expect(y2017.looAnchors).toEqual(['2022', '2024'])
    expect(y2022.looAnchors).toEqual(['2017', '2024'])
    expect(Math.abs(y2017.predLooUncertainMidpoint - y2017.actualAntiRn)).toBeLessThan(3)
    expect(Math.abs(y2022.predLooUncertainMidpoint - y2022.actualAntiRn)).toBeLessThan(6)
  })

  it('vérifie la cohérence agrégée de l’enquête Ipsos-Talan brute sur les 342 duels de 2024', () => {
    expect(report.legislatives2024Coherence).toHaveLength(4)
    for (const row of report.legislatives2024Coherence) {
      expect(row.constituenciesCount).toBeGreaterThan(40)
      expect(Math.abs(row.gapPts), row.profileId).toBeLessThan(2.5)
    }
  })

  it('2012 : année évaluée, sans 2nd tour du front républicain (pas de RN)', () => {
    expect(report.firstRoundEve.map((r) => r.year).sort()).toEqual([2012, 2017, 2022])
    expect(report.secondRoundPresidential.find((r) => (r.year as number) === 2012)).toBeUndefined()
    const row = report.coverage80.find((r) => r.year === 2012)!
    expect(row.secondRoundCovered).toBeNull()
  })

  it('compare les variantes de vote utile A/B/C sur 2012, 2017 et 2022 (RMSE finis, A déterministe)', () => {
    const variants = computeUsefulVoteVariants(simulationData)
    expect(variants.map((v) => v.year)).toEqual([2012, 2017, 2022])
    for (const v of variants) {
      for (const k of ['A', 'B', 'C', 'raw'] as const) expect(Number.isFinite(v.rmse[k])).toBe(true)
      expect(Object.keys(v.leadersAtDate).length).toBeGreaterThan(0)
    }
    expect(computeUsefulVoteVariants(simulationData)).toEqual(variants)
  })
})
