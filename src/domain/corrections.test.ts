import { frozenData as simulationData } from '../test/frozenData'
import { applyCorrections, computeReference2022, defaultCorrection } from './corrections'
import type { Candidate } from './types'

const stats = computeReference2022(simulationData.reference2022)

describe('computeReference2022', () => {
  it('utilise le dernier sondage de chaque institut de la dernière semaine (11 instituts)', () => {
    expect(stats.pollsUsed).toHaveLength(11)
  })
  it('calcule les résultats officiels depuis les voix (Conseil constitutionnel)', () => {
    expect(stats.result.macron).toBeCloseTo(27.85, 2)
    expect(stats.result.melenchon).toBeCloseTo(21.95, 2)
  })
  it('retrouve la sous-estimation de Mélenchon et la surestimation de Pécresse', () => {
    expect(stats.ratio.melenchon).toBeCloseTo(1.275, 2)
    expect(stats.ratio.pecresse).toBeCloseTo(0.608, 2)
    expect(stats.ratio.lepen).toBeCloseTo(1.0, 1)
  })
})

describe('correction strictement identique à 2022', () => {
  it('appliquée aux derniers sondages de 2022, elle redonne exactement le résultat officiel', () => {
    const candidates = simulationData.reference2022.candidates.map((c) => ({ id: c.id, ref2022: c.id })) as Candidate[]
    const rows = applyCorrections(stats.pollAverage, candidates, stats, {
      progressionEnabled: false,
      correctionsEnabled: true,
      correctionIntensity: 1,
      correctionOverrides: {},
    })
    for (const r of rows) expect(r.corrected).toBeCloseTo(stats.result[r.candidateId]!, 10)
  })
})

describe('applyCorrections', () => {
  const candidates = [
    { id: 'x', ref2022: 'melenchon' },
    { id: 'y', ref2022: 'pecresse' },
    { id: 'z', ref2022: null },
  ] as Candidate[]
  const base = { x: 20, y: 10, z: 70 }
  const on = { progressionEnabled: false, correctionsEnabled: true, correctionIntensity: 1, correctionOverrides: {} }

  it('correction par défaut = base × (ratio − 1)', () => {
    expect(defaultCorrection(20, 1.25)).toBeCloseTo(5)
    expect(defaultCorrection(20, null)).toBe(0)
  })
  it('désactivées : le score corrigé est la base', () => {
    const rows = applyCorrections(base, candidates, stats, { ...on, correctionsEnabled: false })
    expect(rows.map((r) => r.corrected)).toEqual([20, 10, 70])
  })
  it('activées : renormalise à 100 après correction', () => {
    const rows = applyCorrections(base, candidates, stats, on)
    expect(rows.reduce((s, r) => s + r.corrected, 0)).toBeCloseTo(100, 8)
    expect(rows[0]!.appliedCorrection).toBeCloseTo(20 * (stats.ratio.melenchon! - 1), 8)
    expect(rows[2]!.appliedCorrection).toBe(0)
  })
  it('l’intensité met la correction à l’échelle', () => {
    const rows = applyCorrections(base, candidates, stats, { ...on, correctionIntensity: 0.5 })
    expect(rows[0]!.appliedCorrection).toBeCloseTo(rows[0]!.defaultCorrection / 2, 8)
  })
  it('une valeur manuelle remplace la correction calculée', () => {
    const rows = applyCorrections(base, candidates, stats, { ...on, correctionOverrides: { y: 2 } })
    expect(rows[1]).toMatchObject({ appliedCorrection: 2, isOverride: true })
  })
})
