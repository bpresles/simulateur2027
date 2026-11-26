import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import {
  evaluateP2Report,
  interpolateAnchorsPiecewiseLogit,
  solveS2017,
} from './secondRoundP2'

describe('P2 (B4) — calcul de s_2017 (R2.5), interpolation 3 ancres et leave-one-out R2.4', () => {
  const report = evaluateP2Report(simulationData, secondRoundReferenceMatrices)

  it('calcule s_2017 dans [0 ; 1] pour toutes les variantes R2.5 et désigne unanimement uncertain sous R2.2', () => {
    const r25Meas = solveS2017(simulationData, secondRoundReferenceMatrices, 'r2_5_r1_1', 'measured_2017')
    const r25Pool = solveS2017(simulationData, secondRoundReferenceMatrices, 'r2_5_r1_1', 's4_pooled')
    const r17Meas = solveS2017(simulationData, secondRoundReferenceMatrices, 'r2_5_r1_7', 'measured_2017')
    const r17Pool = solveS2017(simulationData, secondRoundReferenceMatrices, 'r2_5_r1_7', 's4_pooled')

    expect(r25Meas.s2017).toBeCloseTo(0.55, 2)
    expect(r25Pool.s2017).toBeCloseTo(0.884, 2)
    expect(r17Meas.s2017).toBeCloseTo(0.453, 2)
    expect(r17Pool.s2017).toBeCloseTo(0.751, 2)

    for (const e of [r25Meas, r25Pool, r17Meas, r17Pool]) {
      expect(e.s2017!).toBeGreaterThan(0)
      expect(e.s2017!).toBeLessThan(1)
      expect(e.predAtS2017!).toBeCloseTo(e.actual2017Pct, 6)
      expect(e.scaleBounds).toEqual([0, 1])
      expect(e.r22Default).toBe('uncertain')
    }
    // Toutes les 8 variantes (y compris comparaisons S3 neutre et Harris 2026) donnent s_2017 ≥ 0,25 → uncertain
    expect(report.estimates.every((e) => e.r22Default === 'uncertain')).toBe(true)
  })

  it('l’interpolation logit linéaire par morceaux à 3 ancres reproduit exactement chaque ancre sans extrapoler', () => {
    const sc = report.scenarios.r25MeasuredEd
    const ens22 = simulationData.transfers.presidentialCenterRn.elections['2022']
    const ens17 = simulationData.transfers.presidentialCenterRn.elections['2017']
    const ens24 = simulationData.transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows

    for (const bloc of ['gauche', 'droite'] as const) {
      const at0 = interpolateAnchorsPiecewiseLogit(sc.anchors, bloc, 0)
      const at17 = interpolateAnchorsPiecewiseLogit(sc.anchors, bloc, sc.s2017)
      const at1 = interpolateAnchorsPiecewiseLogit(sc.anchors, bloc, 1)
      const below = interpolateAnchorsPiecewiseLogit(sc.anchors, bloc, -0.5)
      const above = interpolateAnchorsPiecewiseLogit(sc.anchors, bloc, 1.5)

      expect(at0.finalist).toBeCloseTo(ens22[bloc].finalist, 8)
      expect(at17.finalist).toBeCloseTo(ens17[bloc].finalist, 8)
      expect(at1.finalist).toBeCloseTo(ens24[bloc].finalist, 8)
      // R2.3 : aucune extrapolation hors des bornes des 3 ancres
      expect(below).toEqual(at0)
      expect(above).toEqual(at1)
    }
  })

  it('leave-one-out R2.4 exclut bien l’ancre de l’élection évaluée', () => {
    const loo = report.scenarios.r25MeasuredEd.leaveOneOut.s3Neutral_s4PooledEd
    expect(loo['2017'].availableAnchors).toEqual(['2022', '2024'])
    expect(loo['2022'].availableAnchors).toEqual(['2017', '2024'])
    expect(loo['2017'].span).toEqual([0, 1])
    expect(loo['2022'].span[1]).toBe(1)
  })
})
