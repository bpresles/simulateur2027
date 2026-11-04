import { frozenData as simulationData } from '../test/frozenData'
import { duelDropout, profileDropout, secondRoundDropout } from './secondRound'
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

  it('par défaut : blancs, nuls et abstention calés sur l’estimation du duel (législatives 2024)', () => {
    const res = run()
    expect(res.secondRound.abstention.target).toBeCloseTo(
      duelDropout(res.secondRound.duel, simulationData.secondRoundDropout),
      10,
    )
    expect(res.secondRound.votes.abstention).toBeCloseTo(res.secondRound.abstention.target!, 8)
    // Défauts : options du billet d'Eliot Thibault seules (biais et participation attendue par défaut, sans effet avec le billet à 100 %).
    // Duel Le Pen – Mélenchon : abandon des duels RN – LFI de 2024 (8,44 %) au lieu de la moyenne 2017-2022
    // (10,86 %) : Mélenchon 50,43 → 51,06 % sur les données figées (50,07 → 50,67 % sur les données vivantes).
    expect(res.secondRound.pct.b).toBeCloseTo(51.06, 1)
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
    const res = run({ correctionsEnabled: true, blogBiasEnabled: false, turnoutEnabled: false, correctionOverrides: { melenchon: -3 } })
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound.duel.profileWeights).toEqual([{ profileId: 'ensemble_rn', weight: 1 }])
  })

  it('qualification serrée : les deux seconds tours possibles sont simulés, le choix bascule l’affichage', () => {
    // Moyenne brute : aucune option d'ajustement.
    const res = run({ correctionsEnabled: false, blogBiasEnabled: false, turnoutEnabled: false })
    expect(res.qualification.tight).toBe(true)
    expect(res.qualification.gap).toBeLessThan(1)
    expect([res.qualification.withSecond.a, res.qualification.withSecond.b]).toEqual(['lepen', 'melenchon'])
    expect([res.qualification.withThird!.a, res.qualification.withThird!.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound).toBe(res.qualification.withSecond)

    const third = run({ correctionsEnabled: false, blogBiasEnabled: false, turnoutEnabled: false, qualificationPick: 'third' })
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
    const res = run({ correctionsEnabled: true, correctionOverrides: { lepen: -30 } })
    expect(res.secondRound.duel.kind).toBe('fallback')
    expect(res.warnings.some((w) => w.startsWith('Duel hors source'))).toBe(true)
  })

  it('associe les sondages directs de 2nd tour au duel simulé', () => {
    const res = run()
    expect(res.secondRound.directPolls.length).toBeGreaterThan(0)
    expect(res.secondRound.directPolls.every((p) => 'melenchon' in p.scores && 'lepen' in p.scores)).toBe(true)
  })
})

describe('simulate : abandon par duel et sensibilité', () => {
  const at = (settings: Partial<ReturnType<typeof defaultSettings>>) =>
    simulate(simulationData, { ...defaultSettings(), ...settings })
  const { reference2022, reference2017, secondRoundDropout: dropoutData } = simulationData
  const leader = (r: { pct: { a: number; b: number } }) => r.pct.a >= r.pct.b

  it('duel Le Pen – Mélenchon : cible des duels RN – LFI', () => {
    const res = at({})
    expect(res.secondRound.duel.profileWeights).toEqual([{ profileId: 'lfi_rn', weight: 1 }])
    expect(res.secondRound.abstention.target).toBeCloseTo(profileDropout(dropoutData.legislatives2024.profiles.lfi_rn), 10)
  })
  it('une cible saisie l’emporte sur l’estimation du duel', () => {
    expect(at({ abstentionTarget: 5 }).secondRound.abstention.target).toBe(5)
  })
  it('duel sans RN : repli sur les présidentielles 2007 et 2012', () => {
    const res = at({ correctionsEnabled: true, correctionOverrides: { lepen: -30 } })
    expect(res.secondRound.duel.kind).toBe('fallback')
    expect(res.secondRound.abstention.target).toBeCloseTo(duelDropout(res.secondRound.duel, dropoutData), 10)
    expect(res.secondRound.abstention.target).toBeLessThan(4)
  })
  it('expose le duel affiché et les variantes 2017 et 2022', () => {
    const sens = at({}).secondRoundSensitivity!
    expect(sens.variants[2017].target).toBeCloseTo(secondRoundDropout(reference2017), 10)
    expect(sens.variants[2022].target).toBeCloseTo(secondRoundDropout(reference2022), 10)
    expect(sens.variants[2017].pct.a + sens.variants[2017].pct.b).toBeCloseTo(100, 8)
  })
  it('calage désactivé : pas de sensibilité', () => {
    expect(at({ abstentionCalibration: false }).secondRoundSensitivity).toBeNull()
  })
  it('chaque variante égale le duel calé directement sur sa cible', () => {
    const sens = at({}).secondRoundSensitivity!
    for (const year of [2017, 2022] as const) {
      const res = at({ abstentionTarget: sens.variants[year].target })
      expect(res.secondRound.pct.a).toBeCloseTo(sens.variants[year].pct.a, 8)
    }
  })
  it('un vainqueur changé n’est signalé que par les variantes concernées, même avec une cible saisie', () => {
    for (const target of [null, 5, 8.44, 12.96, 20]) {
      const res = at({ abstentionTarget: target })
      const sens = res.secondRoundSensitivity!
      for (const year of [2017, 2022] as const) {
        expect(sens.variants[year].winnerChanges).toBe(leader(sens.variants[year]) !== leader(res.secondRound))
      }
      expect(sens.winnerChanges).toBe(sens.variants[2017].winnerChanges || sens.variants[2022].winnerChanges)
      expect(res.warnings.some((w) => w.startsWith('2nd tour serré'))).toBe(false)
    }
  })
})
