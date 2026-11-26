import p3AuditJson from '../data/second-round-p3-audit.json'
import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import {
  CURRENT_SIGMA_ETA_NON_RN,
  CURRENT_SIGMA_ETA_RN,
  P3_SIGMA_ETA_GRID,
  computeP3Report,
  evaluateEtaCalibrationCurve,
  parseP3AuditJson,
} from './secondRoundP3'

describe('P3 — décomposition de variance du 2nd tour et calage CRPS conditionnel de σ_η', () => {
  const report = computeP3Report(simulationData, secondRoundReferenceMatrices, { controlIterations: 2000 })

  it('grille σ_η complète [0 ; 5] au pas 0,25 (21 valeurs) et non-recalage de 2012 (en échantillon)', () => {
    expect(P3_SIGMA_ETA_GRID).toHaveLength(21)
    expect(P3_SIGMA_ETA_GRID[0]).toBe(0)
    expect(P3_SIGMA_ETA_GRID.at(-1)).toBe(5)
    expect(report.nonRn2012Note.uses2012InModel).toBe(true)
    expect(report.nonRn2012Note.sigmaEtaNonRnRetained).toBe(CURRENT_SIGMA_ETA_NON_RN)
  })

  it('décomposition à 1er tour fixé : η et Dirichlet dominent la variance T2, mob et turnout sont quasi nuls sous S2', () => {
    const c17 = report.varianceFixedR1.find((c) => c.id === '2017_leg2024_loo')!
    const eta = c17.rows.find((r) => r.cut === 'eta')!
    const dir = c17.rows.find((r) => r.cut === 'dirichlet')!
    const mob = c17.rows.find((r) => r.cut === 'mob')!
    expect(eta.deltaVarPct).toBeGreaterThan(50)
    expect(dir.deltaVarPct).toBeGreaterThan(20)
    expect(Math.abs(mob.deltaVarPct)).toBeLessThan(1)
  })

  it('calage conditionnel CRPS (R2.4 LOO + R2.5) : sélectionne σ_η > 3,0 et échoue au critère §5.3 de réduction de largeur', () => {
    const prim = report.calibration.primary_leg2024_r25
    const para = report.calibration.parallel_uncertain_r25
    expect(prim.selected?.sigmaEta).toBeCloseTo(4.75, 6)
    expect(prim.currentAt3.bothCovered).toBe(false)
    expect(prim.selected?.bothCovered).toBe(true)
    expect(prim.selected!.meanCrps).toBeLessThan(prim.currentAt3.meanCrps)
    expect(prim.adoptionCriteria.meanWidthStrictlyReduced).toBe(false)
    expect(prim.adoptionCriteria.allPassed).toBe(false)

    expect(para.selected?.sigmaEta).toBeCloseTo(4.5, 6)
    expect(para.adoptionCriteria.meanWidthStrictlyReduced).toBe(false)
    expect(para.adoptionCriteria.allPassed).toBe(false)

    // Reproductibilité déterministe et concordance avec le JSON publié `second-round-p3-audit.json`
    const rerun = evaluateEtaCalibrationCurve(simulationData, secondRoundReferenceMatrices, 'leg2024_loo', 'r2_5_measured', 2000)
    expect(rerun.selected).toEqual(prim.selected)
    const parsed = parseP3AuditJson(p3AuditJson)
    expect(parsed.sigmaEtaRnRetained).toBe(CURRENT_SIGMA_ETA_RN)
    expect(parsed.sigmaEtaNonRnRetained).toBe(CURRENT_SIGMA_ETA_NON_RN)
    expect(parsed.verdict).toBe('rejected_width_not_reduced')
    expect(parsed.curves.primary_leg2024_r25.selected?.sigmaEta).toBeCloseTo(prim.selected!.sigmaEta, 6)
    expect(parsed.curves.primary_leg2024_r25.currentAt3.meanCrps).toBeCloseTo(prim.currentAt3.meanCrps, 3)
  })
})
