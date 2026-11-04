import { frozenData as simulationData } from '../test/frozenData'
import { computeCalibration } from './calibration'
import { blendedRatio, referenceParts } from './references'
import { defaultSettings, simulate } from './simulate'

// Écarts estimés sur 2022 et 2017 (ceux de « Corriger la moyenne »).
const stats = computeCalibration(simulationData, simulationData.polls).correction
const cand = (id: string) => simulationData.polls.candidates.find((c) => c.id === id)!
const row = (res: ReturnType<typeof simulate>, id: string) => res.firstRound.find((r) => r.candidateId === id)!

describe('références 2022 pondérées', () => {
  it('Glucksmann : 30 % Hidalgo, 70 % Macron par défaut', () => {
    expect(referenceParts(cand('glucksmann'))).toEqual([
      { id: 'hidalgo', weight: 0.3 },
      { id: 'macron', weight: 0.7 },
    ])
    const res = simulate(simulationData, defaultSettings())
    expect(row(res, 'glucksmann').correctionRatio).toBeCloseTo(0.3 * stats.ratio.hidalgo! + 0.7 * stats.ratio.macron!, 10)
  })

  it('Retailleau : 60 % Pécresse, 40 % Le Pen par défaut', () => {
    const res = simulate(simulationData, defaultSettings())
    expect(row(res, 'retailleau').correctionRatio).toBeCloseTo(0.6 * stats.ratio.pecresse! + 0.4 * stats.ratio.lepen!, 10)
  })

  it('le curseur remplace le poids de la seconde référence', () => {
    const res = simulate(simulationData, { ...defaultSettings(), referenceBlend: { glucksmann: 0 } })
    expect(row(res, 'glucksmann').correctionRatio).toBeCloseTo(stats.ratio.hidalgo!, 10)
    expect(row(res, 'glucksmann').references).toEqual([
      { id: 'hidalgo', weight: 1 },
      { id: 'macron', weight: 0 },
    ])
  })

  it('une référence simple garde son ratio', () => {
    expect(blendedRatio(referenceParts(cand('melenchon')), stats.ratio)).toBe(stats.ratio.melenchon)
  })
})
