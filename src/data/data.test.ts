import { averagePolls } from '../domain/pollAverage'
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

  it('rejette un candidat inconnu dans un sondage', () => {
    const broken = structuredClone(pollsJson)
    broken.polls[0]!.hypotheses[0]!.scores = { ...broken.polls[0]!.hypotheses[0]!.scores, inconnu: 1 } as never
    expect(() =>
      parseData({ polls: broken, reference2022: simulationData.reference2022, transfers: simulationData.transfers }),
    ).toThrow(/candidat inconnu/)
  })
})
