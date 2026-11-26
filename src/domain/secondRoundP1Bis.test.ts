import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import {
  P1_BIS_DEFAULT_MOBILIZATION,
  computeInseeAdjustedMobilization,
  computeP1BisReport,
  computeSymmetricDayOfVoteFidelity,
  evaluateP1BisPresidential,
  evaluateSurveyAdmissibility,
} from './secondRoundP1Bis'

describe('Option B (B2) — évaluation P1-bis (S1–S5, R1.2-bis, R1.4-bis)', () => {
  const report = computeP1BisReport(simulationData, secondRoundReferenceMatrices)

  it('filtre automatiquement ifop_2017 par le contrôle comptable R1.8 (S5 / R1.1-bis)', () => {
    const adm = evaluateSurveyAdmissibility(simulationData, secondRoundReferenceMatrices)
    expect(adm.find((a) => a.surveyId === 'ifop_2017')?.feasible).toBe(false)
    expect(adm.find((a) => a.surveyId === 'ipsos_2017')?.feasible).toBe(true)
    expect(adm.find((a) => a.surveyId === 'ipsos_2022')?.feasible).toBe(true)
    expect(adm.find((a) => a.surveyId === 'ifop_2022')?.feasible).toBe(true)
    expect(report.excludedSurveyIds).toEqual(['ifop_2017'])
    expect(report.admissibleSurveyIds).toEqual(['ipsos_2017', 'ipsos_2022', 'ifop_2022'])
  })

  it('dérive exactement S1 (mobilisation Insee ajustée), S3 (fidélité symétrique) et S4 (ligne ED admissible)', () => {
    const mob = computeInseeAdjustedMobilization(simulationData)
    expect(mob.year2017).toBeCloseTo(0.21783, 4)
    expect(mob.year2022).toBeCloseTo(0.23146, 4)
    expect(mob.mean).toBeCloseTo(0.22464, 4)
    expect(mob.roundedDefault).toBe(P1_BIS_DEFAULT_MOBILIZATION)

    const fid = computeSymmetricDayOfVoteFidelity(secondRoundReferenceMatrices, new Set(report.admissibleSurveyIds))
    expect(fid).toEqual({ loyal: 94.75, cross: 1.75, abstention: 3.5 })
    expect(fid.loyal + fid.cross + fid.abstention).toBeCloseTo(100, 9)

    expect(report.admissibleEdRow.row2017).toEqual({ finalist: 27, rn: 30, abstention: 43 })
    expect(report.admissibleEdRow.row2022).toEqual({ finalist: 9.5, rn: 75.5, abstention: 15 })
    expect(report.admissibleEdRow.pooled).toEqual({ finalist: 18.25, rn: 52.75, abstention: 29 })
  })

  it('respecte l’identité comptable exacte totals.a + totals.b + totals.nonExpressed = 100 % et l’invariance de pct à a (S1 + S2)', () => {
    const e1 = evaluateP1BisPresidential('2022', simulationData.reference2022, report.admissibleBlocRows['2022'], {
      fidelityAntiRn: report.symmetricFidelity,
      fidelityRn: report.symmetricFidelity,
      mobilization: 0.14,
    })
    const e2 = evaluateP1BisPresidential('2022', simulationData.reference2022, report.admissibleBlocRows['2022'], {
      fidelityAntiRn: report.symmetricFidelity,
      fidelityRn: report.symmetricFidelity,
      mobilization: 0.25,
    })
    expect(e1.totals.a + e1.totals.b + e1.totals.nonExpressed).toBeCloseTo(100, 9)
    expect(e2.totals.a + e2.totals.b + e2.totals.nonExpressed).toBeCloseTo(100, 9)
    // Avec q endogène miroir (Δq = 0), la part exprimée ne dépend pas du taux de mobilisation a (seuls les volumes changent)
    expect(e1.predictedAntiRnPct).toBeCloseTo(e2.predictedAntiRnPct, 9)
    expect(e2.expressed2).toBeGreaterThan(e1.expressed2)
  })

  it('vérifie la cohérence de la référence v2.2 et la structure complète du rapport P1-bis', () => {
    expect(report.baseline.cross.worstAbsErrorPts).toBeCloseTo(8.2, 1)
    expect(report.baseline.cross.absSignedBiasPts).toBeCloseTo(4.69, 1)
    expect(report.leg2024.rows).toHaveLength(4)
    expect(report.diagnostic2012.predictedHollandePct).toBeGreaterThan(50)
    expect(report.diagnostic2012.predictedHollandePct).toBeLessThan(53)
  })
})
