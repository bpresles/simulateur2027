import { frozenData as simulationData } from '../test/frozenData'
import { baseTurnout, blocShares, BLOG_TURNOUT_RISE, turnoutAffinity, turnoutFactors } from './turnout'
import type { Bloc } from './types'

const affinity = turnoutAffinity()
const model = { base: 75, affinity }

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

describe('baseTurnout', () => {
  it('moyenne des participations au 1er tour de 2022 et 2017 (Conseil constitutionnel)', () => {
    const { reference2022, reference2017 } = simulationData
    expect(baseTurnout({ 2022: reference2022, 2017: reference2017 })).toBeCloseTo(75.73, 2)
  })
  it('un seul scrutin disponible : sa participation', () => {
    const r = simulationData.reference2022
    expect(baseTurnout({ 2022: r })).toBeCloseTo((r.voters * 100) / r.registered, 10)
  })
})

describe('turnoutFactors', () => {
  const blocs: Record<string, Bloc | undefined> = { g: 'gauche', c: 'centre', d: 'droite', e: 'extreme_droite' }
  const scores = { g: 35, c: 25, d: 10, e: 30 }

  it('conserve le total des scores', () => {
    const f = turnoutFactors(scores, (id) => blocs[id], model, BLOG_TURNOUT_RISE)
    const after = Object.entries(scores).reduce((s, [id, v]) => s + v * f[id]!, 0)
    expect(after).toBeCloseTo(100, 10)
    expect(f.g).toBeGreaterThan(1)
    expect(f.c).toBeLessThan(1)
  })
  it('sans hausse, tous les facteurs valent 1', () => {
    const f = turnoutFactors(scores, (id) => blocs[id], model, 0)
    expect(Object.values(f)).toEqual([1, 1, 1, 1])
  })
  it('un candidat sans bloc vote comme la moyenne (k = 1)', () => {
    const f = turnoutFactors({ x: 50, y: 50 }, () => undefined, model, BLOG_TURNOUT_RISE)
    expect(f.x).toBeCloseTo(1, 12)
    expect(f.y).toBeCloseTo(1, 12)
  })
})
