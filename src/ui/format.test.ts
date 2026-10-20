import { simulationData } from '../data/schema'
import { defaultSettings, simulate } from '../domain/simulate'
import { roundToTotal, shownScore } from './format'

const total = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10

describe('arrondi des parts au dixième', () => {
  it('garde le total : le plus grand reste prend le dixième manquant', () => {
    // Arrondies une à une : 33,4 + 33,4 + 33,3 = 100,1.
    expect(roundToTotal([33.35, 33.35, 33.3])).toEqual([33.4, 33.3, 33.3])
    expect(roundToTotal([20.04, 30.07, 49.89])).toEqual([20, 30.1, 49.9])
    expect(roundToTotal([0.3, 99.7])).toEqual([0.3, 99.7])
  })

  it('les scores du 1er tour affichés totalisent 100,0 %, à un dixième au plus du score exact', () => {
    // Réglages par défaut : arrondis un à un, les scores totalisent 100,1 %.
    for (const untestedAlliances of [false, true]) {
      const result = simulate(simulationData, {
        ...defaultSettings(),
        untestedAlliances,
        alliances: { 'attal-philippe': true, 'glucksmann-philippe': true, 'retailleau-philippe': true },
      })
      const shown = result.entrants.map((e) => shownScore(result, e))
      expect(total(shown)).toBe(100)
      result.entrants.forEach((e, i) => expect(Math.abs(shown[i]! - e.score)).toBeLessThan(0.1 + 1e-9))
    }
  })
})
