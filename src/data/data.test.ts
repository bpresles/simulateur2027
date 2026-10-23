import { acceptAlliances, alliancesConflict, availableAlliances, comboWith, testedShare } from '../domain/alliances'
import type { Alliance } from '../domain/types'
import { averagePolls } from '../domain/pollAverage'
import { defaultSettings, simulate } from '../domain/simulate'
import pollsJson from './polls-2027.json'
import { parseData, simulationData, validateData } from './schema'

describe('données', () => {
  it('les trois fichiers JSON passent la validation et les contrôles croisés', () => {
    expect(validateData(simulationData)).toEqual([])
  })

  it('chaque jeu d’hypothèses retient au moins un sondage', () => {
    for (const set of simulationData.polls.hypothesisSets) {
      expect(averagePolls(simulationData.polls, set).institutesUsed).toBeGreaterThan(0)
    }
  })

  it('sans alliance, au moins un sondage teste tous les candidats simulés', () => {
    expect(simulate(simulationData, defaultSettings()).institutesUsed).toBeGreaterThan(0)
  })

  it('chaque alliance proposée est retenue une fois activée (avec sa combinaison)', () => {
    for (const a of availableAlliances(simulationData.polls)) {
      const combo = comboWith(simulationData.polls, [], a)!
      const active = Object.fromEntries(combo.map((b) => [b.id, true]))
      expect(acceptAlliances(simulationData.polls, active)).toEqual(combo)
      expect(simulate(simulationData, { ...defaultSettings(), alliances: active }).institutesUsed).toBeGreaterThan(0)
    }
  })

  it('alliances non évaluées : une alliance compatible avec une alliance active est appliquée (lue ou estimée)', () => {
    const { polls } = simulationData
    const testable = (a: Alliance) => a.members.every((id) => testedShare(polls, id) > 0)
    for (const a of polls.alliances) {
      for (const b of polls.alliances.filter((x) => x !== a && testable(x) && !alliancesConflict(a, x))) {
        const res = simulate(simulationData, { ...defaultSettings(), untestedAlliances: true, alliances: { [a.id]: true, [b.id]: true } })
        expect([...res.allianceIds, ...res.estimatedAllianceIds], `${b.id} avec ${a.id}`).toContain(b.id)
      }
    }
  })

  it('rejette plus d’indécis que de personnes sans intention de vote dans un duel', () => {
    const broken = structuredClone(simulationData)
    const duel = broken.polls.secondRoundPolls[0]!
    duel.noIntention = { share: 20, base: 'votants', undecided: 25, source: { label: 'Notice', url: duel.url } }
    expect(validateData(broken)).toEqual([expect.stringMatching(/plus d'indécis/)])
  })

  it('rejette un candidat inconnu dans un sondage', () => {
    const broken = structuredClone(pollsJson)
    broken.polls[0]!.hypotheses[0]!.scores = { ...broken.polls[0]!.hypotheses[0]!.scores, inconnu: 1 } as never
    expect(() =>
      parseData({ polls: broken, reference2022: simulationData.reference2022, transfers: simulationData.transfers }),
    ).toThrow(/candidat inconnu/)
  })
})
