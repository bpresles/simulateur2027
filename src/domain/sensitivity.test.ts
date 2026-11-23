import { frozenData } from '../test/frozenData'
import { computeSensitivity } from './sensitivity'
import { defaultSettings, simulate } from './simulate'

describe('tableau de sensibilité (sans Monte-Carlo)', () => {
  it('fournit des lignes pour les réglages non mesurés, projection activée par défaut', () => {
    const rows = computeSensitivity(frozenData, defaultSettings())
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['front', 'leak', 'centre', 'abstainers']))
    expect(rows.find((r) => r.id === 'leak')!.inactive).toBeUndefined()
    expect(rows.find((r) => r.id === 'leak')!.variants).toHaveLength(2)
    const front = rows.find((r) => r.id === 'front')!
    // Défaut leg2024 : deux alternatives (2022 et médiane).
    expect(front.variants).toHaveLength(2)
    for (const v of front.variants) expect(Number.isFinite(v.delta)).toBe(true)
  })

  it('neutralise la fuite et la concentration lorsque la projection est désactivée', () => {
    const s = defaultSettings()
    s.projection = { ...s.projection, enabled: false }
    const rows = computeSensitivity(frozenData, s)
    expect(rows.find((r) => r.id === 'leak')!.variants).toHaveLength(0)
    expect(rows.find((r) => r.id === 'centre')!.variants).toHaveLength(0)
    expect(rows.find((r) => r.id === 'leak')!.inactive).toBeTruthy()
  })

  it('mobilisation des abstentionnistes : bornes des repères 14 % et 22 %', () => {
    const rows = computeSensitivity(frozenData, defaultSettings())
    const mob = rows.find((r) => r.id === 'mobilization')!
    expect(mob.active).toBe('20\u202f%')
    expect(mob.variants).toHaveLength(2)
    expect(mob.variants[0]!.label).toContain('14\u202f%')
    expect(mob.variants[1]!.label).toContain('22\u202f%')
    for (const v of mob.variants) expect(Number.isFinite(v.delta)).toBe(true)
    // Aucune alternative identique à la valeur active.
    const s = defaultSettings()
    s.abstainerMobilization = 0.14
    const m2 = computeSensitivity(frozenData, s).find((r) => r.id === 'mobilization')!
    expect(m2.variants).toHaveLength(1)
  })

  it('fidélité : uniforme par défaut contre différenciée, et inversement', () => {
    const rows = computeSensitivity(frozenData, defaultSettings())
    const fid = rows.find((r) => r.id === 'fidelity')!
    expect(fid.active).toContain('différenciée')
    expect(fid.variants).toHaveLength(1)
    expect(fid.variants[0]!.label).toContain('Uniforme 95')
    expect(Number.isFinite(fid.variants[0]!.delta)).toBe(true)
    const s = defaultSettings()
    s.fidelity = 0.9
    const u = computeSensitivity(frozenData, s).find((r) => r.id === 'fidelity')!
    expect(u.active).toContain('uniforme')
    expect(u.variants[0]!.label).toContain('Différenciée')
  })

  it('projection : désactivée en alternative sur le même duel, activée en alternative si inactive', () => {
    const s = defaultSettings()
    const row = computeSensitivity(frozenData, s).find((r) => r.id === 'projection')!
    expect(row.active).toBe('activée (défaut)')
    expect(row.inactive).toBeUndefined()
    expect(row.variants).toHaveLength(1)
    expect(row.variants[0]!.label).toBe('Désactivée')
    const base = simulate(frozenData, s, { monteCarloIterations: 1 }).secondRound
    const off = simulate(
      frozenData,
      { ...s, selectedDuel: `${base.a}|${base.b}`, projection: { ...s.projection, enabled: false } },
      { monteCarloIterations: 1 },
    ).secondRound
    expect(`${off.a}|${off.b}`).toBe(`${base.a}|${base.b}`)
    expect(row.variants[0]!.scoreA).toBeCloseTo(off.pct.a, 10)
    s.projection = { ...s.projection, enabled: false }
    const r2 = computeSensitivity(frozenData, s).find((r) => r.id === 'projection')!
    expect(r2.active).toBe('désactivée')
    expect(r2.variants[0]!.label).toContain('Activée')
  })

  it('ne modifie pas les réglages d’entrée', () => {
    const s = defaultSettings()
    const before = JSON.stringify(s)
    computeSensitivity(frozenData, s)
    expect(JSON.stringify(s)).toBe(before)
  })
})
