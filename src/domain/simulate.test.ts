import { frozenData as simulationData } from '../test/frozenData'
import { secondRoundDropout2022 } from './secondRound'
import { defaultSettings, simulate } from './simulate'

const run = (overrides: Partial<ReturnType<typeof defaultSettings>> = {}) =>
  simulate(simulationData, { ...defaultSettings(), ...overrides })

describe('simulate (données réelles)', () => {
  it('par défaut : hypothèse « Philippe seul », Le Pen et Mélenchon qualifiés', () => {
    const res = run()
    expect(res.hypothesisSet.id).toBe('philippe-seul')
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'melenchon'])
    expect(res.secondRound.duel.kind).toBe('sourced')
    expect(res.secondRound.pct.a + res.secondRound.pct.b).toBeCloseTo(100, 8)
  })

  it('par défaut : blancs, nuls et abstention calés sur le 2nd tour 2022', () => {
    const res = run()
    expect(res.secondRound.abstention.target).toBeCloseTo(secondRoundDropout2022(simulationData.reference2022), 10)
    expect(res.secondRound.votes.abstention).toBeCloseTo(res.secondRound.abstention.target!, 8)
    expect(res.secondRound.pct.b).toBeCloseTo(48, 0)
  })

  it('un seul sondage coché : base de ce sondage, sans alerte de moyenne fragile', () => {
    const others = run()
      .pollUsage.filter((u) => u.status === 'used' && u.poll.id !== 'elabe-20261016')
      .map((u) => u.poll.id)
    const res = run({ excludedPolls: others })
    expect(res.institutesUsed).toBe(1)
    expect(res.pollUsage.find((u) => u.status === 'used')!.poll.id).toBe('elabe-20261016')
    expect(res.firstRound.find((r) => r.candidateId === 'lepen')!.base).toBeCloseTo(33.59, 2)
    expect(res.warnings.some((w) => w.includes('moyenne fragile'))).toBe(false)
  })

  it('aucun sondage coché pour l’hypothèse : tous retenus, avec une alerte', () => {
    const all = run().pollUsage.filter((u) => u.status === 'used').map((u) => u.poll.id)
    const res = run({ excludedPolls: all })
    expect(res.institutesUsed).toBe(all.length)
    expect(res.warnings.some((w) => w.includes('Aucun des sondages cochés'))).toBe(true)
  })

  it('le calage peut être désactivé (taux bruts des législatives 2024)', () => {
    const res = run({ abstentionCalibration: false })
    expect(res.secondRound.abstention.target).toBeNull()
    expect(res.secondRound.votes.abstention).toBeCloseTo(res.secondRound.abstention.uncalibrated, 8)
  })

  it('chaque étape du 1er tour totalise 100', () => {
    const res = run()
    expect(res.firstRound.reduce((s, r) => s + r.corrected, 0)).toBeCloseTo(100, 8)
    expect(res.entrants.reduce((s, e) => s + e.score, 0)).toBeCloseTo(100, 8)
  })

  it('les finalistes dépendent des corrections (Philippe qualifié si on corrige Mélenchon à la baisse)', () => {
    const res = run({ correctionOverrides: { melenchon: -3 } })
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound.duel.profileWeights).toEqual([{ profileId: 'ensemble_rn', weight: 1 }])
  })

  it('qualification serrée : les deux seconds tours possibles sont simulés, le choix bascule l’affichage', () => {
    const res = run({ correctionsEnabled: false })
    expect(res.qualification.tight).toBe(true)
    expect(res.qualification.gap).toBeLessThan(1)
    expect([res.qualification.withSecond.a, res.qualification.withSecond.b]).toEqual(['lepen', 'melenchon'])
    expect([res.qualification.withThird!.a, res.qualification.withThird!.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound).toBe(res.qualification.withSecond)

    const third = run({ correctionsEnabled: false, qualificationPick: 'third' })
    expect(third.qualification.picked).toBe('third')
    expect([third.secondRound.a, third.secondRound.b]).toEqual(['lepen', 'philippe'])
  })

  it('qualification nette : un seul second tour, le choix « 3e » est ignoré', () => {
    const res = run({ qualificationPick: 'third' })
    expect(res.qualification.tight).toBe(false)
    expect(res.qualification.withThird).toBeNull()
    expect(res.qualification.picked).toBe('second')
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'melenchon'])
  })

  it('Attal rejoint Philippe : hypothèse « Philippe seul » (Attal absent), sans taux de report', () => {
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
    expect(allied.entrants.every((e) => e.members.length === 1)).toBe(true)
  })

  it('duel sans RN : modèle de repli et avertissement', () => {
    const res = run({ correctionOverrides: { lepen: -30 } })
    expect(res.secondRound.duel.kind).toBe('fallback')
    expect(res.warnings.some((w) => w.startsWith('Duel hors source'))).toBe(true)
  })

  it('associe les sondages directs de 2nd tour au duel simulé', () => {
    const res = run()
    expect(res.secondRound.directPolls.length).toBeGreaterThan(0)
    expect(res.secondRound.directPolls.every((p) => 'melenchon' in p.scores && 'lepen' in p.scores)).toBe(true)
  })
})
