import { acceptAlliances, alliancesConflict, availableAlliances, comboWith, testedShare } from '../domain/alliances'
import type { Alliance, Poll } from '../domain/types'
import { averagePolls } from '../domain/pollAverage'
import { defaultSettings, simulate } from '../domain/simulate'
import pollsJson from './polls-2027.json'
import { profileTotals } from '../domain/secondRound'
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

  it('les alliances de Lagarde et de Riner sont proposées par les hypothèses Cluster17 et Harris de novembre 2026', () => {
    // Hypothèses figées (et non les données vivantes) : une synchronisation qui retire ces sondages de la
    // période ne doit pas bloquer la mise à jour automatique des données.
    const poll = (id: string, institute: string, end: string, hypotheses: Poll['hypotheses']): Poll => ({
      id,
      institute,
      sponsor: 'Non indiqué',
      fieldwork: { start: end, end },
      sampleSize: 1000,
      sources: [],
      hypotheses,
    })
    const base = { arthaud: 1, roussel: 2, 'dupont-aignan': 2, zemmour: 3 }
    const polls = [
      poll('cluster17', 'Cluster17', '2026-11-10', [
        {
          id: 'H1',
          label: 'Lagarde',
          scores: {
            ...base,
            melenchon: 20.5,
            tondelier: 1.5,
            glucksmann: 10,
            lisnard: 10,
            retailleau: 5.5,
            lepen: 30.5,
            lagarde: 14,
          },
        },
        {
          id: 'H2',
          label: 'Philippe',
          scores: {
            ...base,
            melenchon: 20,
            tondelier: 1.5,
            glucksmann: 11,
            philippe: 13.5,
            lisnard: 10,
            retailleau: 5,
            lepen: 30.5,
          },
        },
      ]),
      poll('harris', 'Harris Interactive (Toluna)', '2026-11-05', [
        {
          id: 'H5',
          label: 'Attal',
          scores: {
            ...base,
            melenchon: 19,
            tondelier: 3,
            glucksmann: 13,
            attal: 10,
            retailleau: 10,
            lepen: 36,
          },
        },
      ]),
    ]
    const data = {
      ...simulationData.polls,
      asOf: '2026-11-12',
      period: { label: 'Novembre 2026', start: '2026-11-01' },
      polls,
    }
    const proposed = availableAlliances(data).map((a) => a.id)
    expect(proposed).toEqual(
      expect.arrayContaining([
        'lagarde-philippe',
        'lagarde-attal',
        'lagarde-retailleau',
        'philippe-lagarde',
        'attal-lagarde',
        'riner-attal',
        'riner-philippe',
      ]),
    )
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

  it('rejette un candidat à la fois simulé et non simulé', () => {
    const broken = structuredClone(simulationData)
    const c = broken.polls.candidates[0]!
    broken.polls.otherCandidates.push({ id: c.id, name: c.name })
    expect(validateData(broken)).toContainEqual(expect.stringMatching(/à la fois candidat simulé et non simulé/))
  })

  it('les candidats ajoutés automatiquement sont des petits candidats, sans bloc', () => {
    for (const c of simulationData.polls.candidates.filter((x) => x.auto)) {
      expect(c).toMatchObject({ bloc: null, minor: { transfers: [expect.objectContaining({ id: 'ensemble' })] } })
    }
  })

  it('rejette un candidat inconnu dans un sondage', () => {
    const broken = structuredClone(pollsJson)
    broken.polls[0]!.hypotheses[0]!.scores = { ...broken.polls[0]!.hypotheses[0]!.scores, inconnu: 1 } as never
    expect(() =>
      parseData({ ...simulationData, polls: broken }),
    ).toThrow(/candidat inconnu/)
  })

  it('le 2nd tour de 2017 est requis et cohérent (votants = blancs + nuls + exprimés)', () => {
    const { secondRound: _omitted, ...without } = structuredClone(simulationData.reference2017)
    expect(() => parseData({ ...simulationData, reference2017: without })).toThrow()
    const broken = structuredClone(simulationData)
    broken.reference2017.secondRound.blank += 1
    expect(validateData(broken)).toEqual([expect.stringMatching(/2017 : 2nd tour incohérent/)])
  })

  it('une estimation d’abandon 2024 existe pour chaque profil de reports', () => {
    const { profiles } = simulationData.secondRoundDropout.legislatives2024
    for (const p of simulationData.transfers.profiles) {
      expect(profiles[p.id].constituencies.length).toBeGreaterThan(0)
      const totals = profileTotals(profiles[p.id])
      expect(totals.first).toBeGreaterThan(totals.second)
    }
    const broken = structuredClone(simulationData)
    delete (broken.secondRoundDropout.legislatives2024.profiles as Partial<typeof profiles>).lr_rn
    expect(validateData(broken)).toEqual([expect.stringMatching(/aucune estimation pour le profil « lr_rn »/)])
  })

  it('rejette des voix par bloc qui ne totalisent pas les exprimés du 1er tour (tolérance de 5 voix)', () => {
    const broken = structuredClone(simulationData)
    const row = broken.secondRoundDropout.legislatives2024.profiles.lfi_rn.constituencies[0]!
    row.firstRoundVotesByBloc.gauche += 3
    expect(validateData(broken)).toEqual([])
    row.firstRoundVotesByBloc.gauche += 10
    expect(validateData(broken)).toEqual([expect.stringMatching(/voix par bloc/)])
  })

  it('rejette un profil d’abandon sans circonscription ni parti cohérents', () => {
    const broken = structuredClone(simulationData)
    broken.secondRoundDropout.legislatives2024.profiles.lfi_rn.constituencies.pop()
    expect(validateData(broken)).toEqual([expect.stringMatching(/partis de gauche incohérents/)])
  })
})
