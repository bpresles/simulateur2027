import { frozenData as simulationData } from '../test/frozenData'
import { applyCorrections, computeReference2022 } from './corrections'
import { normalize } from './pollAverage'
import { computeProgression2022 } from './progression'
import { blendedRatio, referenceParts } from './references'
import { defaultSettings, simulate } from './simulate'

const reference = computeReference2022(simulationData.reference2022)
const progression = computeProgression2022(simulationData.polls, simulationData.reference2022, reference)

describe('computeProgression2022', () => {
  it('se place à la même distance du scrutin que la base 2027 (182 jours → 10/10/2021)', () => {
    expect(progression.daysBefore).toBe(182)
    expect(progression.asOf).toBe('2021-10-10')
  })

  it('retient le dernier sondage de 5 instituts, hypothèses avec Pécresse et Zemmour', () => {
    expect(progression.institutesUsed).toBe(5)
    expect(progression.usage.filter((u) => u.status === 'superseded')).toHaveLength(3)
  })

  it('couvre toute la campagne : la progression reste calculable quand la base 2027 avance', () => {
    for (const asOf of ['2026-11-15', '2027-01-10', '2027-03-01', '2027-04-10']) {
      const later = computeProgression2022({ ...simulationData.polls, asOf }, simulationData.reference2022, reference)
      expect(later.institutesUsed).toBeGreaterThanOrEqual(3)
      expect(later.ratio.melenchon).toBeGreaterThan(1)
    }
  })

  it('mesure la progression de chaque candidat de 2022 (Mélenchon ×1,93, Hidalgo ×0,37)', () => {
    expect(progression.ratio.melenchon).toBeCloseTo(1.93, 2)
    expect(progression.ratio.lepen).toBeCloseTo(1.28, 2)
    expect(progression.ratio.macron).toBeCloseTo(1.01, 2)
    expect(progression.ratio.hidalgo).toBeCloseTo(0.37, 2)
    expect(progression.ratio.zemmour).toBeCloseTo(0.68, 2)
  })
})

describe('progression appliquée au 1er tour', () => {
  const settings = { ...defaultSettings(), progressionEnabled: true }

  it('désactivée par défaut : sondages projetés = moyenne brute', () => {
    const res = simulate(simulationData, defaultSettings(), reference, progression)
    for (const r of res.firstRound) expect(r.projected).toBeCloseTo(r.base, 10)
  })

  it('se cumule avec la correction : moyenne × progression, puis × écart final 2022', () => {
    const res = simulate(simulationData, settings, reference, progression)
    const melenchon = res.firstRound.find((r) => r.candidateId === 'melenchon')!
    expect(melenchon.progressionRatio).toBeCloseTo(progression.ratio.melenchon!, 10)
    expect(melenchon.projected).toBeGreaterThan(melenchon.base * 1.5)

    const base = Object.fromEntries(res.firstRound.map((r) => [r.candidateId, r.base]))
    const candidates = simulationData.polls.candidates
    const projected = normalize(
      Object.fromEntries(
        candidates.map((c) => [c.id, (base[c.id] ?? 0) * (blendedRatio(referenceParts(c), progression.ratio) ?? 1)]),
      ),
    )
    const expected = normalize(
      Object.fromEntries(
        candidates.map((c) => [c.id, projected[c.id]! * (blendedRatio(referenceParts(c), reference.ratio) ?? 1)]),
      ),
    )
    for (const r of res.firstRound) expect(r.corrected).toBeCloseTo(expected[r.candidateId]!, 8)
  })

  it('peut changer les qualifiés du 2nd tour', () => {
    const rows = applyCorrections(
      { a: 30, b: 25, c: 24, x: 21 },
      [
        { id: 'a', ref2022: 'lepen' },
        { id: 'b', ref2022: 'hidalgo' },
        { id: 'c', ref2022: 'melenchon' },
        { id: 'x', ref2022: null },
      ] as never,
      reference,
      { progressionEnabled: true, correctionsEnabled: false, correctionIntensity: 1, correctionOverrides: {} },
      progression,
    )
    const score = (id: string) => rows.find((r) => r.candidateId === id)!.corrected
    expect(score('c')).toBeGreaterThan(score('b'))
  })
})
