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

  it('mobilisation des non-exprimés : bornes des repères 14 % (Ifop) et 25,3 % (Insee)', () => {
    const rows = computeSensitivity(frozenData, defaultSettings())
    const mob = rows.find((r) => r.id === 'mobilization')!
    expect(mob.active).toBe('22,5\u202f%')
    expect(mob.variants).toHaveLength(2)
    expect(mob.variants[0]!.label).toContain('14\u202f%')
    expect(mob.variants[1]!.label).toContain('25,3\u202f%')
    for (const v of mob.variants) expect(Number.isFinite(v.delta)).toBe(true)
    // En mode neutre (abstainerAntiRnShare = null), l'orientation des nouveaux votants est active en miroir.
    const abst = rows.find((r) => r.id === 'abstainers')!
    expect(abst.active).toContain('miroir des exprimés')
    expect(abst.variants).toHaveLength(2)
    // Aucune alternative identique à la valeur active.
    const s = defaultSettings()
    s.abstainerMobilization = 0.14
    const m2 = computeSensitivity(frozenData, s).find((r) => r.id === 'mobilization')!
    expect(m2.variants).toHaveLength(1)
  })

  it('fidélité : symétrique neutre par défaut (S3) contre déclarée 2027 (Harris, logit), et uniforme manuel contre symétrique', () => {
    const rows = computeSensitivity(frozenData, defaultSettings())
    const fid = rows.find((r) => r.id === 'fidelity')!
    expect(fid.active).toContain('symétrique')
    expect(fid.variants).toHaveLength(1)
    expect(fid.variants[0]!.label).toContain('Déclarations Harris 2026')
    expect(Number.isFinite(fid.variants[0]!.delta)).toBe(true)
    const s = defaultSettings()
    s.fidelity = 0.9
    const u = computeSensitivity(frozenData, s).find((r) => r.id === 'fidelity')!
    expect(u.active).toContain('uniforme')
    expect(u.variants[0]!.label).toContain('Symétrique neutre')
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
