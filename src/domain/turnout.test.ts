import { frozenData as simulationData } from '../test/frozenData'
import { computeCalibration } from './calibration'
import {
  blocShares,
  certainShare,
  closestMeasure,
  finalMeasure,
  latestMeasure,
  turnoutAffinity,
  turnoutBalance,
  turnoutCoverage,
  turnoutFactors,
  turnoutWarnings,
} from './turnout'
import type { TurnoutModel } from './turnout'
import type { Bloc, TurnoutMeasure } from './types'

const affinity = turnoutAffinity()
const { measures } = simulationData.turnoutCertainty
const model: TurnoutModel = computeCalibration(simulationData, simulationData.polls).turnout
const none = { campaign: 0, late: 0 }
const full = { campaign: 1, late: 1 }

describe('turnoutAffinity (Ifop-Fiducial, vote 2022 des abstentionnistes de 2017)', () => {
  it('la gauche et l’extrême droite gagnent à la hausse de participation, le centre et la droite y perdent', () => {
    expect(affinity.gauche).toBeCloseTo(1.431, 3)
    expect(affinity.centre).toBeCloseTo(0.53, 3)
    expect(affinity.droite).toBeCloseTo(0.434, 3)
    expect(affinity.extreme_droite).toBeCloseTo(1.057, 3)
  })
  it('les parts des blocs, sans Lassalle, font 100 %', () => {
    const shares = Object.values(blocShares({ melenchon: 22, macron: 27.5, lassalle: 3.2 }))
    expect(shares.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
  })
})

describe('mesures des certains d’aller voter', () => {
  const byId = (id: string) => measures.find((m) => m.id === id)!

  it('la part des inscrits se calcule : envisagent × tout à fait certains', () => {
    expect(certainShare(byId('ifop-2021-10'))).toBeCloseTo(65.65, 2)
    expect(certainShare(byId('ifop-2026-09'))).toBeCloseTo(74.51, 2)
    expect(certainShare(byId('ifop-2026-10'))).toBeCloseTo(74.05, 2)
    // Le rolling 2022 ne publie que l'indice, en % des inscrits.
    expect(certainShare(byId('ifop-rolling-2022-04'))).toBe(73)
  })
  it('E2027 : dernière mesure dont la fin de terrain est antérieure ou égale à la date des sondages', () => {
    expect(latestMeasure(measures, 2027, '2026-11-03')!.id).toBe('ifop-2026-10')
    expect(latestMeasure(measures, 2027, '2026-10-14')!.id).toBe('ifop-2026-10')
    expect(latestMeasure(measures, 2027, '2026-10-13')!.id).toBe('ifop-2026-09')
    expect(latestMeasure(measures, 2027, '2026-09-01')).toBeNull()
  })
  it('E2022 : mesure de campagne la plus proche en distance au scrutin ; F2022 : la vague finale', () => {
    expect(closestMeasure(measures, 2022, '2022-04-10', 186)!.id).toBe('ifop-2021-10')
    expect(finalMeasure(measures, 2022)!.id).toBe('ifop-rolling-2022-04')
  })
  it('E2022 : parmi plusieurs mesures, celle dont la distance est la plus proche', () => {
    const extra: TurnoutMeasure = {
      ...byId('ifop-2021-10'),
      id: 'proche',
      fieldwork: { start: '2021-09-01', end: '2021-10-01' },
    }
    // Fin au 01/10/2021 : J−191 ; le 13/10/2021 : J−179.
    expect(closestMeasure([extra, byId('ifop-2021-10')], 2022, '2022-04-10', 189)!.id).toBe('proche')
    expect(closestMeasure([extra, byId('ifop-2021-10')], 2022, '2022-04-10', 180)!.id).toBe('ifop-2021-10')
  })
})

describe('turnoutCoverage', () => {
  const off = { progressionEnabled: false, correctionsEnabled: false, correctionIntensity: 1 }
  it('la plus forte intensité de l’option dédiée et du billet, par composante', () => {
    expect(turnoutCoverage(off)).toEqual(none)
    expect(turnoutCoverage({ ...off, blogBiasEnabled: true, blogBiasIntensity: 0.5 })).toEqual({ campaign: 0.5, late: 0.5 })
    expect(turnoutCoverage({ ...off, progressionEnabled: true, progressionIntensity: 0.7 })).toEqual({
      campaign: 0.7,
      late: 0,
    })
    expect(
      turnoutCoverage({ ...off, correctionsEnabled: true, correctionIntensity: 0.3, blogBiasEnabled: true, blogBiasIntensity: 0.5 }),
    ).toEqual({ campaign: 0.5, late: 0.5 })
  })
})

describe('turnoutBalance', () => {
  const balance = (coverage = full, expected: number | null = null) => turnoutBalance(model, coverage, expected)!

  it('décompose la mobilisation de 2022 (valeurs vérifiées dans les notices)', () => {
    const b = balance()
    expect(b.certainNow.share).toBeCloseTo(74.05, 2)
    expect(b.certainRef.share).toBeCloseTo(65.65, 2)
    expect(b.finalRef.share).toBe(73)
    expect(b.turnoutRef).toBeCloseTo(73.69, 2)
    expect(b.campaign).toBeCloseTo(7.35, 2)
    expect(b.late).toBeCloseTo(0.69, 2)
    expect(b.defaultExpected).toBeCloseTo(82.09, 2)
  })
  it('couverture complète et participation par défaut : ΔV = 0 exactement', () => {
    const b = balance()
    expect(b.v0).toBeCloseTo(b.defaultExpected, 10)
    expect(b.delta).toBe(0)
  })
  it('aucune correction : V₀ = E2027 et ΔV = P2027 − E2027', () => {
    const b = balance(none)
    expect(b.v0).toBeCloseTo(b.certainNow.share, 10)
    expect(b.delta).toBeCloseTo(b.expected - b.certainNow.share, 10)
    expect(b.delta).toBeCloseTo(8.04, 1)
  })
  it('couvertures partielles : « Corriger la moyenne » seule, « Progression » seule', () => {
    const corr = balance({ campaign: 0, late: 1 })
    expect(corr.v0).toBeCloseTo(74.74, 1)
    expect(corr.delta).toBeCloseTo(7.35, 1)
    const prog = balance({ campaign: 1, late: 0 })
    expect(prog.v0).toBeCloseTo(81.4, 1)
    expect(prog.delta).toBeCloseTo(0.69, 1)
  })
  it('une participation réglée remplace le défaut ; ΔV peut être négatif', () => {
    const b = balance(full, 78)
    expect(b.expected).toBe(78)
    expect(b.delta).toBeCloseTo(78 - b.v0, 10)
    expect(b.delta).toBeLessThan(0)
  })
  it('sans mesure 2027 antérieure à la date des sondages : pas de bilan', () => {
    expect(turnoutBalance({ ...model, asOf: '2026-09-01' }, full, null)).toBeNull()
  })
})

describe('turnoutWarnings', () => {
  it('aucun avertissement avec les mesures actuelles', () => {
    expect(turnoutWarnings(turnoutBalance(model, full, null)!)).toEqual([])
  })
  it('mesure 2027 trop ancienne par rapport aux sondages', () => {
    const b = turnoutBalance({ ...model, asOf: '2026-12-01' }, full, null)!
    expect(turnoutWarnings(b)).toHaveLength(1)
    expect(turnoutWarnings(b)[0]).toMatch(/loin des sondages/)
  })
  it('mesure de 2021 trop éloignée de celle de 2026', () => {
    const only = measures.map((m) =>
      m.id === 'ifop-2021-10' ? { ...m, fieldwork: { start: '2021-06-01', end: '2021-06-05' } } : m,
    )
    const b = turnoutBalance({ ...model, measures: only }, full, null)!
    expect(turnoutWarnings(b).some((w) => w.includes('comparaison peu fiable'))).toBe(true)
  })
})

describe('turnoutFactors', () => {
  const blocs: Record<string, Bloc | undefined> = { g: 'gauche', c: 'centre', d: 'droite', e: 'extreme_droite' }
  const scores = { g: 35, c: 25, d: 10, e: 30 }
  const total = (f: Record<string, number>) => Object.entries(scores).reduce((s, [id, v]) => s + v * f[id]!, 0)

  it('ΔV > 0 : conserve le total, la gauche gagne et le centre perd', () => {
    const f = turnoutFactors(scores, (id) => blocs[id], { affinity }, 75, 7)
    expect(total(f)).toBeCloseTo(100, 10)
    expect(f.g).toBeGreaterThan(1)
    expect(f.c).toBeLessThan(1)
  })
  it('ΔV < 0 : conserve le total, les blocs d’affinité > 1 passent sous 1', () => {
    const f = turnoutFactors(scores, (id) => blocs[id], { affinity }, 82, -4)
    expect(total(f)).toBeCloseTo(100, 10)
    expect(f.g).toBeLessThan(1)
    expect(f.e).toBeLessThan(1)
    expect(f.c).toBeGreaterThan(1)
    expect(f.d).toBeGreaterThan(1)
  })
  it('ΔV = 0 ou V₀ + ΔV ≤ 0 : tous les facteurs valent 1', () => {
    expect(Object.values(turnoutFactors(scores, (id) => blocs[id], { affinity }, 75, 0))).toEqual([1, 1, 1, 1])
    expect(Object.values(turnoutFactors(scores, (id) => blocs[id], { affinity }, 5, -5))).toEqual([1, 1, 1, 1])
  })
  it('le numérateur est borné à 0', () => {
    const f = turnoutFactors(scores, (id) => blocs[id], { affinity }, 10, -9)
    for (const v of Object.values(f)) expect(v).toBeGreaterThanOrEqual(0)
  })
  it('un candidat sans bloc vote comme la moyenne (k = 1)', () => {
    const f = turnoutFactors({ x: 50, y: 50 }, () => undefined, { affinity }, 75, 7)
    expect(f.x).toBeCloseTo(1, 12)
    expect(f.y).toBeCloseTo(1, 12)
  })
})
