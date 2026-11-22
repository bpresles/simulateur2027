import { simulationData as liveData } from '../data/schema'
import {
  acceptAlliances,
  allianceCombos,
  alliancesConflict,
  availableAlliances,
  campRivals,
  comboWith,
  isOptionChecked,
  ralliedOf,
  scenarioFilter,
  scenarioSet,
  testedOptions,
} from './alliances'
import { defaultSettings, simulate } from './simulate'
import type { Hypothesis, Poll, PollsData } from './types'

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

  it('ralliedOf retourne les membres autres que le leader', () => {
    expect(ralliedOf(byId('attal-philippe'))).toEqual(['attal'])
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

  it('simulation : sans projection, seuls les sondages qui testent la combinaison sont retenus', () => {
    const res = simulate(data, {
      ...defaultSettings(),
      offerProjectionEnabled: false,
      alliances: { 'attal-philippe': true, 'retailleau-philippe': true },
    })
    expect(res.allianceIds).toEqual(['attal-philippe', 'retailleau-philippe'])
    expect(res.pollUsage.map((u) => [u.poll.id, u.status, u.matchedHypotheses])).toEqual([
      ['a', 'no-matching-hypothesis', []],
      ['b', 'used', ['H1']],
    ])
    expect(res.entrants.map((e) => e.id)).not.toContain('retailleau')
    expect(res.warnings).toContain(
      'Seulement 1 institut (Cluster17) pour l’hypothèse « Sans Gabriel Attal, Bruno Retailleau » : moyenne fragile.',
    )
  })

  it('simulation : une alliance non testée est ignorée', () => {
    const res = simulate(data, {
      ...defaultSettings(),
      offerProjectionEnabled: false,
      alliances: { 'tondelier-melenchon': true },
    })
    expect(res.allianceIds).toEqual([])
    expect(res.pollUsage.find((u) => u.poll.id === 'a')!.matchedHypotheses).toEqual(['H1'])
  })

  it('options testées : choisit la combinaison canonique et vérifie isOptionChecked', () => {
    const options = testedOptions(polls)
    expect(options.length).toBeGreaterThanOrEqual(2)
    const seul = options.find((o) => o.id === 'teste-attal-philippe')!
    expect(isOptionChecked(seul, [byId('attal-philippe')])).toBe(true)
    expect(isOptionChecked(seul, [])).toBe(false)
  })

  it('un petit candidat n’est requis que s’il mène une alliance', () => {
    const live = liveData.polls
    expect(scenarioFilter(live, []).require).not.toContain('lisnard')
    const filter = scenarioFilter(live, [live.alliances.find((a) => a.id === 'retailleau-lisnard')!])
    expect(filter.require).toContain('lisnard')
    expect(filter.exclude).toContain('retailleau')
  })
})
