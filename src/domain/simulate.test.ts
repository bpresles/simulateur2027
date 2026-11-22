import { frozenData as simulationData } from '../test/frozenData'
import { defaultProjectionSettings } from './campaignProjection'
import { defaultSettings, simulate } from './simulate'

const run = (overrides: Partial<ReturnType<typeof defaultSettings>> = {}) =>
  simulate(simulationData, { ...defaultSettings(), ...overrides })

describe('simulate (données figées)', () => {
  it('par défaut : projection avril 2027 et incertitude des candidatures activées, flux unifiés à 100 % et Monte-Carlo actif', () => {
    const def = defaultSettings()
    expect(def.projection.enabled).toBe(true)
    expect(def.candidacyUncertaintyEnabled).toBe(true)

    const res = run()
    expect(res.hypothesisSet.id).toBe('philippe-seul')
    expect(res.projection.enabled).toBe(true)
    expect(res.secondRound.duel.kind).toBe('rn-sourced')
    expect(res.secondRound.pct.a + res.secondRound.pct.b).toBeCloseTo(100, 8)
    expect(res.firstRound.reduce((s, r) => s + r.score, 0)).toBeCloseTo(100, 8)
    expect(res.entrants.reduce((s, e) => s + e.score, 0)).toBeCloseTo(100, 8)
    expect(res.monteCarlo.iterations).toBe(2000)
    expect(res.selectableDuels.length).toBeGreaterThanOrEqual(2)

    // En photographie actuelle (projection désactivée) sur les données figées du 18/10/2026, Philippe devance Mélenchon.
    const now = run({ projection: { ...defaultProjectionSettings(), enabled: false } })
    expect([now.secondRound.a, now.secondRound.b]).toEqual(['lepen', 'philippe'])
  })

  it('un seul sondage coché : base de ce sondage, sans alerte de moyenne fragile', () => {
    const others = run()
      .pollUsage.filter((u) => u.status === 'used' && u.poll.id !== 'elabe-20261016')
      .map((u) => u.poll.id)
    const res = run({
      excludedPolls: others,
      projection: { ...defaultProjectionSettings(), enabled: false },
    })
    expect(res.institutesUsed).toBe(1)
    expect(res.pollUsage.find((u) => u.status === 'used')!.poll.id).toBe('elabe-20261016')
    expect(res.firstRound.find((r) => r.candidateId === 'lepen')!.score).toBeCloseTo(33.59, 2)
    expect(res.warnings.some((w) => w.includes('moyenne fragile'))).toBe(false)
  })

  it('aucun sondage coché pour l’hypothèse : tous retenus, avec une alerte', () => {
    const all = run().pollUsage.filter((u) => u.status === 'used').map((u) => u.poll.id)
    const res = run({ excludedPolls: all })
    expect(res.institutesUsed).toBe(all.length)
    expect(res.warnings.some((w) => w.includes('Aucun des sondages cochés'))).toBe(true)
  })

  it('sélection d’un duel alternatif (ex. Le Pen – Philippe) via selectedDuel', () => {
    const res = run({ selectedDuel: 'lepen|philippe' })
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound.duel.profileWeights).toEqual([{ profileId: 'ensemble_rn', weight: 1 }])
  })

  it('duel hors RN gauche vs centre utilise les reports présidentiels 2007–2012', () => {
    const res = run({ selectedDuel: 'melenchon|philippe' })
    expect(res.secondRound.duel.kind).toBe('non-rn-presidential')
    expect(res.warnings.some((w) => w.includes('même camp'))).toBe(false)
  })

  it('duel entre deux candidats du même camp émet un avertissement explicite', () => {
    const res = run({ selectedDuel: 'melenchon|glucksmann' })
    expect(res.secondRound.duel.kind).toBe('non-rn-same-side')
    expect(res.warnings.some((w) => w.includes('même camp'))).toBe(true)
  })

  it('option déclarations 2027 corrigées en logit et mélange pondéré', () => {
    const leg = run({ transferSource: 'legislatives2024' })
    const decl = run({ transferSource: 'declared2027' })
    const blend = run({ transferSource: 'blend', declaredWeight: 0.5 })
    // Les déclarations 2027 sont plus défavorables à Mélenchon face au RN que les législatives 2024
    expect(decl.secondRound.pct.b).toBeLessThan(leg.secondRound.pct.b)
    expect(blend.secondRound.pct.b).toBeGreaterThan(decl.secondRound.pct.b)
    expect(blend.secondRound.pct.b).toBeLessThan(leg.secondRound.pct.b)
  })

  it('surcharge manuelle des reports prioritaire sur la source choisie', () => {
    const override = { finalist: 40, rn: 20, abstention: 40 }
    const overrides = { lfi_rn: { centre: override, droite: override, gauche: override } }
    const a = run({ selectedDuel: 'lepen|melenchon', transferSource: 'legislatives2024', transferOverrides: overrides })
    const b = run({ selectedDuel: 'lepen|melenchon', transferSource: 'declared2027', transferOverrides: overrides })
    expect(a.secondRound.pct.b).toBeCloseTo(b.secondRound.pct.b, 10)
  })

  it('Attal rejoint Philippe : hypothèse « Philippe seul » (Attal absent)', () => {
    const data = {
      ...simulationData,
      polls: {
        ...simulationData.polls,
        hypothesisSets: simulationData.polls.hypothesisSets.map((s) => ({ ...s, default: s.id === 'philippe-attal' })),
      },
    }
    const base = simulate(data, defaultSettings())
    expect(base).toMatchObject({ allianceIds: [], hypothesisSet: { id: 'philippe-attal' } })
    expect(base.firstRound.some((r) => r.candidateId === 'attal')).toBe(true)

    const allied = simulate(data, { ...defaultSettings(), alliances: { 'attal-philippe': true } })
    expect(allied).toMatchObject({ allianceIds: ['attal-philippe'], hypothesisSet: { label: 'Philippe seul' } })
    expect(allied.firstRound.some((r) => r.candidateId === 'attal')).toBe(false)
  })

  it('associe les sondages directs de 2nd tour au duel affiché et expose la sensibilité gauche hors LFI sur LFI–RN', () => {
    const res = run({ selectedDuel: 'lepen|melenchon' })
    expect(res.secondRound.directPolls.length).toBeGreaterThan(0)
    expect(res.secondRound.directPolls.every((p) => 'melenchon' in p.scores && 'lepen' in p.scores)).toBe(true)
    const sens = res.secondRound.lfiLeftSensitivity
    expect(sens).not.toBeNull()
    expect(sens!.lowRate).toBe(35)
    expect(sens!.highRate).toBe(75)
    expect(sens!.rnAtLow).toBeGreaterThan(sens!.rnAtHigh + 2)
  })

  it('option candidacyUncertaintyEnabled fait varier les probabilités Monte-Carlo en intégrant plusieurs offres', () => {
    const fixed = run({ candidacyUncertaintyEnabled: false })
    const mixed = run({ candidacyUncertaintyEnabled: true })
    expect(mixed.monteCarlo.candidates.lepen!.winProb).toBeGreaterThan(0)
    expect(Object.values(mixed.monteCarlo.candidates).reduce((s, c) => s + c.winProb, 0)).toBeCloseTo(100, 6)
    // Avec incertitude des candidatures, les scores de Philippe / Attal diffèrent de l'offre fixe.
    expect(mixed.monteCarlo.candidates.philippe!.median).not.toBeCloseTo(fixed.monteCarlo.candidates.philippe!.median, 3)
  })
})
