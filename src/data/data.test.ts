import {
  acceptAlliances,
  alliancesConflict,
  availableAlliances,
  comboWith,
  describingCombos,
  scenarioFilter,
  testedOptions,
  testedShare,
} from '../domain/alliances'
import type { Alliance, Poll } from '../domain/types'
import { computeCalibration } from '../domain/calibration'
import { TURNOUT_DISTANCE_TOLERANCE_DAYS, certainShare, closestMeasure, referenceShare } from '../domain/turnout'
import { daysBetween } from '../domain/pollAverage'
import { averagePolls, hypothesisMatches, latestPerInstitute, windowDaysOf } from '../domain/pollAverage'
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

  it('chaque hypothèse retenue décrite par une combinaison appartient à une option testée qui la décrit', () => {
    const { polls } = simulationData
    const { latest } = latestPerInstitute(polls.polls, polls.asOf, windowDaysOf(polls))
    const options = testedOptions(polls)
    const key = (c: Alliance[]) => c.map((a) => a.id).sort().join('|')
    for (const poll of latest) {
      for (const h of poll.hypotheses) {
        // Une hypothèse qui décrit déjà le scénario de base (un petit candidat absent n'est pas rallié) n'a pas d'option.
        if (hypothesisMatches(h, scenarioFilter(polls, []))) continue
        const described = describingCombos(polls, h).map(key)
        if (described.length === 0) continue
        const option = options.find((o) => o.testedBy.some((t) => t.institute === poll.institute))
        expect(option, `${poll.institute} / ${h.label ?? h.id}`).toBeDefined()
        expect(
          options.some((o) => described.includes(key(o.alliances)) && o.testedBy.some((t) => t.institute === poll.institute && t.hypothesis === h.label)),
          `${poll.institute} / ${h.label ?? h.id}`,
        ).toBe(true)
      }
    }
    // Chaque option est une combinaison que `acceptAlliances` retient telle quelle.
    for (const o of options) {
      expect(acceptAlliances(polls, Object.fromEntries(o.alliances.map((a) => [a.id, true])))).toEqual(o.alliances)
    }
  })

  it('une alliance groupée estimée comptant un candidat principal n’est jamais menée par un petit candidat', () => {
    const { candidates, alliances } = simulationData.polls
    const minor = (id: string) => candidates.find((c) => c.id === id)?.minor
    for (const a of alliances.filter((x) => x.grouped)) {
      if (a.members.some((id) => !minor(id))) expect(minor(a.leader), a.id).toBeFalsy()
    }
  })

  it('un petit candidat peut être requis par un jeu d’hypothèses autre que celui par défaut, pas par le jeu par défaut', () => {
    const broken = structuredClone(simulationData)
    const def = broken.polls.hypothesisSets.find((s) => s.default)!
    const minor = broken.polls.candidates.find((c) => c.minor)!.id
    def.require.push(minor)
    expect(validateData(broken)).toEqual([expect.stringMatching(new RegExp(`petit candidat « ${minor} »`))])
  })

  it('participation : à J−125, la référence 2022 est la moyenne des mesures de J−136, J−125 et J−116, pas la mesure bruitée de 60,7 %', () => {
    const { measures } = simulationData.turnoutCertainty
    const { electionDateRef } = computeCalibration(simulationData, simulationData.polls).turnout
    const ref = referenceShare(measures, 2022, electionDateRef, 125)!
    const noisy = measures.find((m) => m.fieldwork.end === '2021-12-06')!
    expect(certainShare(noisy)).toBeCloseTo(60.7, 1)
    expect(ref.measures.map((m) => daysBetween(m.fieldwork.end, electionDateRef))).toEqual([136, 125, 116])
    expect(ref.share).toBeCloseTo(66.1, 1)
    expect(ref.share).toBeCloseTo(ref.measures.reduce((t, m) => t + certainShare(m), 0) / 3, 10)
  })

  it('participation : toute mesure 2027 entre J−190 et J−5 trouve une référence 2022 à moins de 30 jours', () => {
    const { measures } = simulationData.turnoutCertainty
    const { electionDateRef } = computeCalibration(simulationData, simulationData.polls).turnout
    for (let distance = 5; distance <= 190; distance++) {
      const ref = closestMeasure(measures, 2022, electionDateRef, distance)!
      const gap = Math.abs(daysBetween(ref.fieldwork.end, electionDateRef) - distance)
      expect(gap, `J−${distance}`).toBeLessThanOrEqual(TURNOUT_DISTANCE_TOLERANCE_DAYS)
    }
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
  }, 30_000)

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
