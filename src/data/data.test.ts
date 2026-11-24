import {
  acceptAlliances,
  availableAlliances,
  comboWith,
  describingCombos,
  scenarioFilter,
  testedOptions,
} from '../domain/alliances'
import { averagePolls, hypothesisMatches, latestPerInstitute, windowDaysOf } from '../domain/pollAverage'
import { aggregatedProfileDropout } from '../domain/secondRound'
import { defaultSettings, simulate } from '../domain/simulate'
import type { Alliance, Poll } from '../domain/types'
import pollsJson from './polls-2027.json'
import {
  legislativeDuelPolls2024,
  parseData,
  parseLegislativeDuelPolls2024,
  parseSecondRoundReferenceMatrices,
  secondRoundReferenceMatrices,
  simulationData,
  validateData,
  validateLegislativeDuelPolls2024,
  validateSecondRoundReferenceMatrices,
} from './schema'

describe('données', () => {
  it('tous les fichiers JSON passent la validation et les contrôles croisés', () => {
    expect(validateData(simulationData)).toEqual([])
  })

  it('le jeu d’hypothèses par défaut retient au moins un sondage et la simulation par défaut aboutit', () => {
    const defSet = simulationData.polls.hypothesisSets.find((s) => s.default)!
    expect(averagePolls(simulationData.polls, defSet).institutesUsed).toBeGreaterThan(0)
    const res = simulate(simulationData, defaultSettings())
    expect(res.institutesUsed).toBeGreaterThan(0)
    expect(res.firstRound.reduce((s, r) => s + r.score, 0)).toBeCloseTo(100, 6)
  })

  it('chaque hypothèse retenue décrite par une combinaison appartient à une option testée qui la décrit', () => {
    const { polls } = simulationData
    const { latest } = latestPerInstitute(polls.polls, polls.asOf, windowDaysOf(polls))
    const options = testedOptions(polls)
    const key = (c: Alliance[]) => c.map((a) => a.id).sort().join('|')
    for (const poll of latest) {
      for (const h of poll.hypotheses) {
        if (hypothesisMatches(h, scenarioFilter(polls, []))) continue
        const described = describingCombos(polls, h).map(key)
        if (described.length === 0) continue
        const option = options.find((o) => o.testedBy.some((t) => t.institute === poll.institute))
        expect(option, `${poll.institute} / ${h.label ?? h.id}`).toBeDefined()
        expect(
          options.some(
            (o) =>
              described.includes(key(o.alliances)) &&
              o.testedBy.some((t) => t.institute === poll.institute && t.hypothesis === h.label),
          ),
          `${poll.institute} / ${h.label ?? h.id}`,
        ).toBe(true)
      }
    }
    for (const o of options) {
      expect(acceptAlliances(polls, Object.fromEntries(o.alliances.map((a) => [a.id, true])))).toEqual(o.alliances)
    }
  })

  it('un petit candidat peut être requis par un jeu d’hypothèses autre que celui par défaut, pas par le jeu par défaut', () => {
    const broken = structuredClone(simulationData)
    const def = broken.polls.hypothesisSets.find((s) => s.default)!
    const minor = broken.polls.candidates.find((c) => c.minor)!.id
    def.require.push(minor)
    expect(validateData(broken)).toEqual([expect.stringMatching(new RegExp(`petit candidat « ${minor} »`))])
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

  it('rejette un candidat inconnu dans un sondage', () => {
    const broken = structuredClone(pollsJson)
    broken.polls[0]!.hypotheses[0]!.scores = { ...broken.polls[0]!.hypotheses[0]!.scores, inconnu: 1 } as never
    expect(() => parseData({ ...simulationData, polls: broken })).toThrow(/candidat inconnu/)
  })

  it('le 2nd tour de 2017 est requis et cohérent (votants = blancs + nuls + exprimés, voix = exprimés)', () => {
    const { secondRound: _omitted, ...without } = structuredClone(simulationData.reference2017)
    expect(() => parseData({ ...simulationData, reference2017: without })).toThrow()
    const broken = structuredClone(simulationData)
    broken.reference2017.secondRound.blank += 1
    expect(validateData(broken)).toEqual([expect.stringMatching(/2017 : 2nd tour incohérent/)])
    const broken2 = structuredClone(simulationData)
    broken2.reference2017.secondRound.candidates[0]!.votes += 1
    expect(validateData(broken2)).toEqual([expect.stringMatching(/2017 : total des voix des finalistes/)])
  })

  it('les matrices brutes de référence 2017–2022 passent la validation et rejettent toute incohérence', () => {
    const refs = { '2017': simulationData.reference2017, '2022': simulationData.reference2022 }
    expect(validateSecondRoundReferenceMatrices(secondRoundReferenceMatrices, refs)).toEqual([])

    const badSum = structuredClone(secondRoundReferenceMatrices)
    badSum.rows['2017'][0]!.bySurvey.ipsos_2017!.antiRn += 2
    expect(validateSecondRoundReferenceMatrices(badSum, refs)).toEqual([expect.stringMatching(/somme 102 hors/)])

    const badCand = structuredClone(secondRoundReferenceMatrices)
    badCand.rows['2022'][0]!.candidateId = 'inconnu'
    expect(validateSecondRoundReferenceMatrices(badCand, refs)).toEqual([expect.stringMatching(/candidat inconnu « inconnu »/)])

    const badSurvey = structuredClone(secondRoundReferenceMatrices)
    badSurvey.rows['2017'][0]!.bySurvey.inconnue = { antiRn: 50, rn: 20, nonExpressed: 30 }
    expect(() => parseSecondRoundReferenceMatrices(badSurvey, refs)).toThrow(/enquête non déclarée « inconnue »/)
  })

  it('un agrégat 2024 cohérent existe pour chaque profil de reports', () => {
    const { profiles } = simulationData.secondRoundDropout.legislatives2024
    for (const p of simulationData.transfers.profiles) {
      expect(profiles[p.id].constituenciesCount).toBeGreaterThan(0)
      expect(aggregatedProfileDropout(profiles[p.id])).toBeGreaterThan(0)
    }
    const broken = structuredClone(simulationData)
    delete (broken.secondRoundDropout.legislatives2024.profiles as Partial<typeof profiles>).lr_rn
    expect(validateData(broken)).toEqual([expect.stringMatching(/profil « lr_rn » absent/)])
  })

  it('rejette des voix par bloc incohérentes dans un agrégat 2024', () => {
    const broken = structuredClone(simulationData)
    broken.secondRoundDropout.legislatives2024.profiles.lfi_rn.firstRoundVotesByBloc.gauche += 5000
    expect(validateData(broken)).toEqual([expect.stringMatching(/voix par bloc/)])
  })

  it('le 2nd tour de 2012 est cohérent et chaque erreur est détectée', () => {
    expect(validateData(simulationData)).toEqual([])
    const broken = structuredClone(simulationData)
    broken.reference2012.secondRound.blankOrInvalid += 1
    expect(validateData(broken)).toEqual([expect.stringMatching(/2012 : 2nd tour incohérent/)])
    const broken2 = structuredClone(simulationData)
    broken2.reference2012.secondRound.candidates[0]!.votes += 1
    expect(validateData(broken2).join(' ')).toMatch(/2012 : total des voix/)
  })

  it('valide les phases avantPremierTour et entreDeuxTours dans second-round-poll-bias.json', () => {
    const brokenPre = structuredClone(simulationData)
    const prePoll = brokenPre.secondRoundPollBias.elections[0]!.polls.find((p) => p.phase === 'avantPremierTour')!
    prePoll.end = brokenPre.secondRoundPollBias.elections[0]!.electionDate
    expect(validateData(brokenPre)).toEqual([expect.stringMatching(/avantPremierTour postérieur au 1er tour/)])

    const brokenBetweenEarly = structuredClone(simulationData)
    const btPoll = brokenBetweenEarly.secondRoundPollBias.elections[0]!.polls.find((p) => p.phase === 'entreDeuxTours')!
    btPoll.end = '2022-04-09'
    expect(validateData(brokenBetweenEarly)).toEqual([expect.stringMatching(/entreDeuxTours hors/)])

    const brokenBetweenLate = structuredClone(simulationData)
    const btPoll2 = brokenBetweenLate.secondRoundPollBias.elections[0]!.polls.find((p) => p.phase === 'entreDeuxTours')!
    btPoll2.end = brokenBetweenLate.secondRoundPollBias.elections[0]!.secondRoundDate
    expect(validateData(brokenBetweenLate)).toEqual([expect.stringMatching(/entreDeuxTours hors/)])
  })

  it('valide legislative-duel-polls-2024.json et rejette triangulaires, dates hors entre-deux-tours et scores ≠ 100', () => {
    expect(validateLegislativeDuelPolls2024(legislativeDuelPolls2024, simulationData.polls)).toEqual([])

    const triangular = structuredClone(legislativeDuelPolls2024) as unknown as {
      polls: { candidates: unknown[] }[]
    }
    triangular.polls[0]!.candidates.push({ ...legislativeDuelPolls2024.polls[0]!.candidates[0], party: 'LFI' })
    expect(() => parseLegislativeDuelPolls2024(triangular, simulationData.polls)).toThrow()

    const beforeFirstRound = structuredClone(legislativeDuelPolls2024)
    beforeFirstRound.polls[0]!.fieldwork = { start: '2024-06-25', end: '2024-06-27' }
    expect(validateLegislativeDuelPolls2024(beforeFirstRound, simulationData.polls)).toEqual([
      expect.stringMatching(/terrain hors entre-deux-tours/),
    ])

    const badScoreSum = structuredClone(legislativeDuelPolls2024)
    badScoreSum.polls[0]!.candidates[0].pollScore = 60
    expect(validateLegislativeDuelPolls2024(badScoreSum, simulationData.polls)).toEqual([
      expect.stringMatching(/somme des scores du sondage/),
    ])

    const unknownCand = structuredClone(legislativeDuelPolls2024)
    unknownCand.candidateParties.inconnu = 'RN'
    expect(validateLegislativeDuelPolls2024(unknownCand, simulationData.polls)).toEqual([
      expect.stringMatching(/candidat inconnu « inconnu »/),
    ])
  })
})
