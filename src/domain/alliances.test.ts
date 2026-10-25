import { simulationData as liveData } from '../data/schema'
import {
  acceptAlliances,
  allianceCombos,
  alliancesConflict,
  applyAlliances,
  availableAlliances,
  campRivals,
  comboWith,
  insertMinor,
  scenarioFilter,
  scenarioSet,
  testedShare,
} from './alliances'
import { defaultSettings, simulate } from './simulate'
import type { Alliance, Hypothesis, Poll, PollsData } from './types'

// Catalogue d'alliances et candidats des données, avec des sondages construits pour les tests.
const FULL = {
  arthaud: 1,
  melenchon: 17,
  roussel: 2,
  tondelier: 3,
  glucksmann: 13,
  attal: 6,
  philippe: 13,
  retailleau: 7,
  'dupont-aignan': 2,
  lepen: 33,
  zemmour: 3,
}
/** Hypothèse sans certains candidats, leurs points donnés à `to`. */
const without = (id: string, ids: (keyof typeof FULL)[], to: keyof typeof FULL, extra: Hypothesis['scores'] = {}) => {
  const scores: Record<string, number> = { ...FULL, ...extra }
  for (const x of ids) {
    scores[to]! += scores[x]!
    delete scores[x]
  }
  return { id, scores }
}
const poll = (id: string, institute: string, hypotheses: Hypothesis[]): Poll => ({
  id,
  institute,
  sponsor: 'x',
  fieldwork: { start: '2026-10-12', end: '2026-10-14' },
  sampleSize: 1000,
  sources: [{ label: 'x', url: 'https://example.org' }],
  hypotheses,
})
// Candidats principaux et leurs alliances : les petits candidats sont testés à part.
const main = liveData.polls.candidates.filter((c) => !c.minor)
const polls: PollsData = {
  ...liveData.polls,
  candidates: main,
  alliances: liveData.polls.alliances.filter((a) => a.members.every((id) => main.some((c) => c.id === id))),
  asOf: '2026-10-20',
  period: { label: 'Octobre-décembre 2026', start: '2026-10-01' },
  polls: [
    poll('a', 'Elabe', [
      { id: 'H1', scores: FULL },
      without('H2', ['attal'], 'philippe'),
      // Hollande à la place de Glucksmann : ce n'est pas un ralliement de Glucksmann.
      { ...without('H3', ['attal', 'glucksmann'], 'philippe', { hollande: 0 }), replacing: { hollande: 'glucksmann' } },
    ]),
    poll('b', 'Cluster17', [
      without('H1', ['attal', 'retailleau'], 'philippe'),
      without('H2', ['attal', 'philippe'], 'retailleau'),
    ]),
  ],
}
const data = { ...liveData, polls }
const byId = (id: string) => polls.alliances.find((a) => a.id === id)!
const ids = (alliances: { id: string }[]) => alliances.map((a) => a.id)

describe('incompatibilités entre alliances', () => {
  it('un candidat ne rallie qu’une alliance, un rallié n’en mène pas d’autre ; même leader : cumul', () => {
    expect(alliancesConflict(byId('tondelier-melenchon'), byId('roussel-melenchon'))).toBe(false)
    expect(alliancesConflict(byId('roussel-melenchon'), byId('roussel-glucksmann'))).toBe(true)
    expect(alliancesConflict(byId('attal-philippe'), byId('philippe-attal'))).toBe(true)
    expect(alliancesConflict(byId('attal-philippe'), byId('philippe-glucksmann'))).toBe(true)
    expect(alliancesConflict(byId('attal-philippe'), byId('retailleau-philippe'))).toBe(false)
  })

  it('un ralliement ne se lit dans un sondage que si le leader reste le seul candidat principal du camp', () => {
    expect(campRivals(polls, [byId('attal-philippe')])).toEqual([])
    expect(campRivals(polls, [byId('retailleau-philippe')])).toEqual(['attal'])
    expect(campRivals(polls, [byId('attal-philippe'), byId('retailleau-philippe')])).toEqual([])
    expect(campRivals(polls, [byId('philippe-glucksmann')])).toEqual(['melenchon', 'attal'])
  })
})

describe('alliances testées par les sondages', () => {
  it('combinaisons testées par une hypothèse (tous les candidats simulés sauf les ralliés, sans remplaçant)', () => {
    expect(allianceCombos(polls).map(ids)).toEqual([
      ['attal-philippe'],
      ['attal-philippe', 'retailleau-philippe'],
      ['philippe-retailleau', 'attal-retailleau'],
    ])
    expect(ids(availableAlliances(polls))).toEqual([
      'attal-philippe',
      'retailleau-philippe',
      'philippe-retailleau',
      'attal-retailleau',
    ])
  })

  it('une alliance testée seulement avec une autre n’est retenue qu’avec elle', () => {
    expect(acceptAlliances(polls, { 'retailleau-philippe': true })).toEqual([])
    expect(ids(acceptAlliances(polls, { 'retailleau-philippe': true, 'attal-philippe': true }))).toEqual([
      'attal-philippe',
      'retailleau-philippe',
    ])
    expect(ids(comboWith(polls, [], byId('retailleau-philippe'))!)).toEqual(['attal-philippe', 'retailleau-philippe'])
    expect(comboWith(polls, [byId('attal-philippe')], byId('philippe-retailleau'))).toBeUndefined()
  })

  it('nomme le scénario d’après un jeu des données, sinon par les ralliés absents', () => {
    const name = (id: string) => polls.candidates.find((c) => c.id === id)!.name
    expect(scenarioSet(polls, [byId('attal-philippe')], name).label).toBe('Philippe seul')
    expect(scenarioSet(polls, [byId('attal-philippe'), byId('retailleau-philippe')], name).label).toBe(
      'Sans Gabriel Attal, Bruno Retailleau',
    )
  })

  it('simulation : seuls les sondages qui testent la combinaison sont retenus, sans taux de report', () => {
    const res = simulate(data, {
      ...defaultSettings(),
      alliances: { 'attal-philippe': true, 'retailleau-philippe': true },
    })
    expect(res.allianceIds).toEqual(['attal-philippe', 'retailleau-philippe'])
    expect(res.pollUsage.map((u) => [u.poll.id, u.status, u.matchedHypotheses])).toEqual([
      ['a', 'no-matching-hypothesis', []],
      ['b', 'used', ['H1']],
    ])
    expect(res.entrants.map((e) => e.id)).not.toContain('retailleau')
    expect(res.entrants.find((e) => e.id === 'philippe')!.members).toHaveLength(1)
    expect(res.warnings).toContain(
      'Seulement 1 institut (Cluster17) pour l’hypothèse « Sans Gabriel Attal, Bruno Retailleau » : moyenne fragile.',
    )
  })

  it('simulation : une alliance non testée est ignorée', () => {
    const res = simulate(data, { ...defaultSettings(), alliances: { 'tondelier-melenchon': true } })
    expect(res.allianceIds).toEqual([])
    expect(res.pollUsage.find((u) => u.poll.id === 'a')!.matchedHypotheses).toEqual(['H1'])
  })
})

describe('alliances estimées (option) : reports de 2024', () => {
  const alliance: Alliance = { id: 'al', label: 'T rejoint M', members: ['m', 't'], leader: 'm' }
  const follow = (leader: number, rn = 0) => () => ({ leader, rn })

  it('sans alliance, chaque candidat reste seul', () => {
    const { entrants } = applyAlliances({ m: 20, t: 3, x: 77 }, [], follow(1), null)
    expect(entrants.map((e) => [e.id, e.members.length])).toEqual([
      ['x', 1],
      ['m', 1],
      ['t', 1],
    ])
  })

  it('fusionne les scores et calcule les poids (20 + 3 → 0,87 / 0,13)', () => {
    const m = applyAlliances({ m: 20, t: 3, x: 77 }, [alliance], follow(1), null).entrants.find((e) => e.id === 'm')!
    expect(m.score).toBeCloseTo(23, 8)
    expect(m.allianceIds).toEqual(['al'])
    expect(m.members[1]!.weight).toBeCloseTo(3 / 23, 8)
  })

  it('la part qui vote RN rejoint le candidat RN, celle qui ne suit pas s’abstient', () => {
    const { entrants, leaks } = applyAlliances({ m: 20, t: 10, rn: 30, x: 40 }, [alliance], follow(0.7, 0.2), 'rn')
    // m : 20 + 7, rn : 30 + 2, 1 point s'abstient → total 99
    expect(entrants.find((e) => e.id === 'rn')!.score).toBeCloseTo((32 * 100) / 99, 8)
    expect(entrants.find((e) => e.id === 'm')!.score).toBeCloseTo((27 * 100) / 99, 8)
    expect(leaks).toEqual([{ from: 't', to: 'rn', points: expect.closeTo((2 * 100) / 99, 8) }])
  })

  it('simulation : option désactivée par défaut, une alliance non testée est ignorée', () => {
    expect(defaultSettings().untestedAlliances).toBe(false)
    const res = simulate(data, { ...defaultSettings(), alliances: { 'tondelier-melenchon': true } })
    expect(res).toMatchObject({ allianceIds: [], estimatedAllianceIds: [], allianceRates: [] })
  })

  it('simulation avec l’option : alliance non testée estimée (72 % suivent, 3 % RN), testées en priorité', () => {
    const settings = { ...defaultSettings(), untestedAlliances: true }
    const res = simulate(data, { ...settings, alliances: { 'tondelier-melenchon': true } })
    expect(res).toMatchObject({ allianceIds: [], estimatedAllianceIds: ['tondelier-melenchon'] })
    const melenchon = res.entrants.find((e) => e.id === 'melenchon')!
    expect(melenchon.members.map((m) => [m.candidateId, m.rate])).toEqual([
      ['melenchon', 1],
      ['tondelier', 0.72],
    ])
    expect(res.allianceLeaks).toEqual([{ from: 'tondelier', to: 'lepen', points: expect.any(Number) }])

    // Retailleau rejoint Philippe : estimée seule (Attal en lice).
    const alone = simulate(data, { ...settings, alliances: { 'retailleau-philippe': true } })
    expect(alone).toMatchObject({ allianceIds: [], estimatedAllianceIds: ['retailleau-philippe'] })

    // Retailleau rejoint Le Pen n'est jamais lue : Cluster17 teste une hypothèse sans Attal ni Retailleau, mais
    // les électeurs de Retailleau n'y vont pas tous vers Le Pen. Elle est estimée.
    const lepen = simulate(data, { ...settings, alliances: { 'attal-philippe': true, 'retailleau-lepen': true } })
    expect(lepen).toMatchObject({ allianceIds: ['attal-philippe'], estimatedAllianceIds: ['retailleau-lepen'] })
    expect(simulate(data, { ...defaultSettings(), alliances: { 'retailleau-lepen': true } }).allianceIds).toEqual([])

    // Une alliance estimée incompatible avec une alliance testée est ignorée.
    const conflict = simulate(data, { ...settings, alliances: { 'attal-philippe': true, 'philippe-glucksmann': true } })
    expect(conflict).toMatchObject({ allianceIds: ['attal-philippe'], estimatedAllianceIds: [] })
  })

  it('simulation avec l’option : une alliance testée garde les mêmes sondages et le même résultat', () => {
    const alliances = { 'attal-philippe': true }
    const without = simulate(data, { ...defaultSettings(), alliances })
    const withOption = simulate(data, { ...defaultSettings(), untestedAlliances: true, alliances })
    expect(withOption.pollUsage).toEqual(without.pollUsage)
    expect(withOption.hypothesisGroups).toEqual(without.hypothesisGroups)
    expect(withOption.entrants).toEqual(without.entrants)
    expect(withOption.secondRound.pct).toEqual(without.secondRound.pct)
    expect(withOption.estimatedAllianceIds).toEqual([])
  })

  it('simulation avec l’option : les sondages de la combinaison testée, les autres alliances y sont estimées', () => {
    const settings = { ...defaultSettings(), untestedAlliances: true }
    const alliances = { 'attal-philippe': true, 'retailleau-philippe': true, 'tondelier-melenchon': true }
    const res = simulate(data, { ...settings, alliances })
    // Cluster17 teste les deux ralliements, Elabe seulement Attal rejoint Philippe : seul Cluster17 est retenu,
    // comme sans l'option, et Tondelier rejoint Mélenchon, testée nulle part, y est estimée.
    expect(res.hypothesisGroups).toEqual([
      {
        set: expect.objectContaining({ label: 'Sans Gabriel Attal, Bruno Retailleau' }),
        allianceIds: ['attal-philippe', 'retailleau-philippe'],
        estimatedAllianceIds: ['tondelier-melenchon'],
        pollIds: ['b'],
      },
    ])
    expect(res).toMatchObject({
      institutesUsed: 1,
      allianceIds: ['attal-philippe', 'retailleau-philippe'],
      estimatedAllianceIds: ['tondelier-melenchon'],
    })
    const philippe = res.entrants.find((e) => e.id === 'philippe')!
    expect(philippe.members.map((m) => m.candidateId)).toEqual(['philippe'])
    expect(res.entrants.reduce((sum, e) => sum + e.score, 0)).toBeCloseTo(100, 8)
    expect(res.warnings).toContain(
      'Alliance estimée par les reports des législatives 2024, faute d’hypothèse de sondage : Tondelier rejoint Mélenchon.',
    )
  })

  it('simulation avec l’option : une part modifiée remplace le taux 2024', () => {
    const res = simulate(data, {
      ...defaultSettings(),
      untestedAlliances: true,
      alliances: { 'tondelier-melenchon': true },
      allianceOverrides: { 'tondelier-melenchon': 0.9 },
    })
    const rate = res.allianceRates.find((r) => r.allianceId === 'tondelier-melenchon')!.joining[0]!
    expect(rate).toMatchObject({ leader: 0.9, isOverride: true, default2024: { leader: 0.72, rn: 0.03 } })
  })
})

describe('petits candidats : alliances lues dans les hypothèses', () => {
  // Lisnard testé (H1), absent (H2), puis seul candidat de la droite à la place de Retailleau (H3).
  const { retailleau, ...noRetailleau } = FULL
  const withMinors: PollsData = {
    ...liveData.polls,
    asOf: '2026-10-20',
    period: { label: 'Octobre-décembre 2026', start: '2026-10-01' },
    polls: [
      poll('a', 'Elabe', [
        { id: 'H1', scores: { ...FULL, melenchon: 15, retailleau: 3, lisnard: 4, ruffin: 2 } },
        { id: 'H2', scores: FULL },
        { id: 'H3', scores: { ...noRetailleau, lisnard: retailleau + 1 } },
      ]),
    ],
  }
  const minorData = { ...liveData, polls: withMinors }
  const byIdLive = (id: string) => withMinors.alliances.find((a) => a.id === id)!

  it('un petit candidat n’est requis que s’il mène une alliance', () => {
    expect(scenarioFilter(withMinors, []).require).not.toContain('lisnard')
    const filter = scenarioFilter(withMinors, [byIdLive('retailleau-lisnard')])
    expect(filter.require).toContain('lisnard')
    expect(filter.exclude).toContain('retailleau')
  })

  it('ralliement lu par l’absence du petit candidat, si son leader reste seul dans le camp', () => {
    const combos = allianceCombos(withMinors).map(ids)
    expect(combos).toContainEqual(['lisnard-retailleau'])
    expect(combos).toContainEqual(['retailleau-lisnard'])
    // Glucksmann reste en lice à gauche : l'absence de Ruffin ne dit pas qu'il rallie Mélenchon.
    expect(combos.flat()).not.toContain('ruffin-melenchon')
  })

  it('simulation : 0 % dans les hypothèses sans lui, retiré quand il rallie son leader', () => {
    const base = simulate(minorData, defaultSettings())
    expect(base.pollUsage[0]!.matchedHypotheses).toEqual(['H1', 'H2'])
    const lisnard = base.firstRound.find((r) => r.candidateId === 'lisnard')!
    // (4 + 0) / 2 dans le seul sondage retenu.
    expect(lisnard.base).toBeCloseTo(2, 8)
    expect(base.firstRound.map((r) => r.candidateId)).not.toContain('villepin')

    const rallied = simulate(minorData, { ...defaultSettings(), alliances: { 'lisnard-retailleau': true } })
    expect(rallied.allianceIds).toEqual(['lisnard-retailleau'])
    expect(rallied.pollUsage[0]!.matchedHypotheses).toEqual(['H2'])
    expect(rallied.firstRound.map((r) => r.candidateId)).not.toContain('lisnard')

    const leader = simulate(minorData, { ...defaultSettings(), alliances: { 'retailleau-lisnard': true } })
    expect(leader.pollUsage[0]!.matchedHypotheses).toEqual(['H3'])
    expect(leader.entrants.map((e) => e.id)).toContain('lisnard')
    expect(leader.entrants.map((e) => e.id)).not.toContain('retailleau')
  })
})

describe('petit candidat testé seulement avec un rallié', () => {
  // Ruffin n'est testé qu'avec Attal (H1) ; H2 mesure « Attal rejoint Philippe », sans Ruffin.
  const withRuffin: PollsData = {
    ...liveData.polls,
    asOf: '2026-10-20',
    period: { label: 'Octobre-décembre 2026', start: '2026-10-01' },
    polls: [poll('a', 'Elabe', [{ id: 'H1', scores: { ...FULL, melenchon: 15, ruffin: 2 } }, without('H2', ['attal'], 'philippe')])],
  }
  const ruffinData = { ...liveData, polls: withRuffin }

  it('sa part : moyenne des hypothèses qui le testent (0 si aucune)', () => {
    expect(testedShare(withRuffin, 'ruffin')).toBeCloseTo(2, 8)
    expect(testedShare(withRuffin, 'bouamrane')).toBe(0)
    // Aucun sondage coché ne le teste : tous les sondages disponibles sont retenus, comme pour la base.
    expect(testedShare(withRuffin, 'ruffin', new Set(['a']))).toBeCloseTo(2, 8)
  })

  it('sa part est prise aux candidats vers lesquels vont ses électeurs, au prorata de ceux en lice', () => {
    const donors = [
      { id: 'a', weight: 0.6 },
      { id: 'b', weight: 0.2 },
      { id: 'absent', weight: 0.2 },
    ]
    expect(insertMinor({ a: 30, b: 20, c: 50 }, 'm', 4, donors)).toEqual({ a: 27, b: 19, c: 50, m: 4 })
    // Aucun donneur en lice : prélèvement sur tous, au prorata de leur score.
    expect(insertMinor({ a: 50, c: 50 }, 'm', 4, [{ id: 'x', weight: 1 }])).toEqual({ a: 48, c: 48, m: 4 })
  })

  it('simulation : son ralliement est estimé (reports 2024) même quand Attal rejoint Philippe', () => {
    const settings = { ...defaultSettings(), untestedAlliances: true }
    const alone = simulate(ruffinData, { ...settings, alliances: { 'attal-philippe': true } })
    expect(alone.firstRound.map((r) => r.candidateId)).not.toContain('ruffin')

    const res = simulate(ruffinData, { ...settings, alliances: { 'attal-philippe': true, 'ruffin-melenchon': true } })
    expect(res.allianceIds).toEqual(['attal-philippe'])
    expect(res.estimatedAllianceIds).toEqual(['ruffin-melenchon'])
    // 2 % de H1, prélevés sur Mélenchon (ses électeurs votent comme les siens en son absence).
    expect(res.firstRound.find((r) => r.candidateId === 'ruffin')!.base).toBeCloseTo(2, 8)
    const melenchon = res.entrants.find((e) => e.id === 'melenchon')!
    const ruffin = melenchon.members.find((m) => m.candidateId === 'ruffin')!
    expect(ruffin.rate).toBeGreaterThan(0)
    expect(res.warnings.some((w) => w.startsWith('Aucune hypothèse retenue ne teste François Ruffin'))).toBe(true)
  })

  it('sa part est prélevée après les corrections : ses donneurs gardent leur correction 2022', () => {
    const settings = { ...defaultSettings(), untestedAlliances: true, progressionEnabled: true }
    const alone = simulate(ruffinData, { ...settings, alliances: { 'attal-philippe': true } })
    const res = simulate(ruffinData, { ...settings, alliances: { 'attal-philippe': true, 'ruffin-melenchon': true } })
    const rows = new Map(res.firstRound.map((r) => [r.candidateId, r]))
    for (const r of alone.firstRound) {
      expect(rows.get(r.candidateId)!.corrected + rows.get(r.candidateId)!.ceded).toBeCloseTo(r.corrected, 8)
      expect(rows.get(r.candidateId)!.base).toBeCloseTo(r.base, 8)
    }
    const ruffin = rows.get('ruffin')!
    expect(ruffin.corrected).toBeCloseTo(2, 8)
    expect(res.firstRound.reduce((s, r) => s + r.ceded, 0)).toBeCloseTo(ruffin.corrected, 8)
  })
})
