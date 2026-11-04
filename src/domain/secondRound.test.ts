import { frozenData as simulationData } from '../test/frozenData'
import { computeSecondRound, campDropout, duelCampRates, pollBiasGaps, duelDropout, noIntentionRange, noRnDropout, presidentialDropout, profileDropout, secondRoundDropout } from './secondRound'
import { blendProfiles, effectiveProfiles, fallbackSplit, resolveDuel } from './transfers'
import type { Candidate, Entrant, SecondRoundPoll } from './types'

const { transfers, reference2022, reference2017, secondRoundDropout: dropoutData } = simulationData
const profiles = effectiveProfiles(transfers, {}, 1)

const cand = (id: string, bloc: Candidate['bloc'], duelProfile: Candidate['duelProfile'], isRN = false) =>
  ({ id, bloc, duelProfile, isRN }) as Candidate
const candidates = [
  cand('lfi', 'gauche', 'lfi_rn'),
  cand('eco', 'gauche', 'ecolo_ps_pcf_rn'),
  cand('ens', 'centre', 'ensemble_rn'),
  cand('lr', 'droite', 'lr_rn'),
  cand('rn', 'extreme_droite', null, true),
  cand('rec', 'extreme_droite', null),
]
const byId = new Map(candidates.map((c) => [c.id, c]))
const solo = (id: string, score: number): Entrant => ({
  id,
  allianceIds: [],
  score,
  members: [{ candidateId: id, contribution: score, weight: 1, rate: 1, rnRate: 0 }],
})
const run = (
  entrants: Entrant[],
  opts: {
    fidelity?: number
    abstentionTarget?: number | null
    campRates?: { camp: number; others: number } | null
    campScope?: 'bloc' | 'family'
  } = {},
) =>
  computeSecondRound({
    electorate: Object.fromEntries(entrants.flatMap((e) => e.members.map((m) => [m.candidateId, m.contribution]))),
    a: entrants[0]!,
    b: entrants[1]!,
    duel: resolveDuel(entrants[0]!, entrants[1]!, byId),
    profiles: effectiveProfiles(transfers, {}, opts.fidelity ?? 1),
    fallback: transfers.fallback,
    candidatesById: byId,
    fidelity: opts.fidelity ?? 1,
    abstentionTarget: opts.abstentionTarget ?? null,
    campRates: opts.campRates,
    campScope: opts.campScope,
    secondRoundPolls: [],
  })

describe('resolveDuel', () => {
  it('utilise le profil du challenger face au RN', () => {
    const duel = resolveDuel(solo('rn', 35), solo('lfi', 20), byId)
    expect(duel).toMatchObject({ kind: 'sourced', challengerId: 'lfi', rnId: 'rn' })
    expect(duel.profileWeights).toEqual([{ profileId: 'lfi_rn', weight: 1 }])
  })

  it('mélange les profils d’une alliance selon les poids des membres', () => {
    const alliance: Entrant = {
      id: 'lfi',
      allianceIds: ['x'],
      score: 23,
      members: [
        { candidateId: 'lfi', contribution: 20, weight: 20 / 23, rate: 1, rnRate: 0 },
        { candidateId: 'eco', contribution: 3, weight: 3 / 23, rate: 1, rnRate: 0 },
      ],
    }
    const duel = resolveDuel(alliance, solo('rn', 35), byId)
    expect(duel.profileWeights).toEqual([
      { profileId: 'lfi_rn', weight: 20 / 23 },
      { profileId: 'ecolo_ps_pcf_rn', weight: 3 / 23 },
    ])
    const centre = blendProfiles(profiles, duel.profileWeights).centre
    expect(centre.finalist).toBeCloseTo((43 * 20 + 54 * 3) / 23, 8)
  })

  it('bascule sur le modèle de repli sans RN', () => {
    expect(resolveDuel(solo('lfi', 20), solo('ens', 18), byId).kind).toBe('fallback')
  })
})

describe('effectiveProfiles', () => {
  it('l’extrême droite (camp RN) vote RN au taux de fidélité', () => {
    expect(effectiveProfiles(transfers, {}, 0.9).lfi_rn.extreme_droite).toEqual({
      finalist: 0,
      rn: 90,
      abstention: expect.closeTo(10, 8),
    })
  })
})

describe('computeSecondRound', () => {
  const entrants = [solo('rn', 40), solo('lfi', 20), solo('ens', 20), solo('eco', 10), solo('lr', 5), solo('rec', 5)]

  it('reproduit un calcul fait à la main (sans calage de l’abstention)', () => {
    const res = run(entrants)
    // lfi_rn : gauche 72/3/25 (taux NFP repris), centre 43/19/38, droite 26/38/36, extrême droite → RN
    const lfi = 20 + 20 * 0.43 + 10 * 0.72 + 5 * 0.26
    const rn = 40 + 20 * 0.19 + 10 * 0.03 + 5 * 0.38 + 5
    expect(res.votes.b).toBeCloseTo(lfi, 8)
    expect(res.votes.a).toBeCloseTo(rn, 8)
    expect(res.pct.b).toBeCloseTo((lfi * 100) / (lfi + rn), 8)
    expect(res.votes.a + res.votes.b + res.votes.abstention).toBeCloseTo(100, 8)
  })

  it('cale le total des blancs, nuls et abstentions sur la cible', () => {
    const raw = run(entrants)
    const res = run(entrants, { abstentionTarget: 8 })
    expect(res.votes.abstention).toBeCloseTo(8, 8)
    expect(res.abstention.factor).toBeCloseTo(8 / raw.votes.abstention, 8)
    // Chaque électorat garde sa répartition entre les deux finalistes.
    const centre = (r: typeof res) => r.flows.find((f) => f.candidateId === 'ens')!
    expect(centre(res).toB / centre(res).toA).toBeCloseTo(43 / 19, 8)
  })

  it('électeurs ralliés à un finaliste : suivent le leader, votent RN, ou se reportent comme leur bloc', () => {
    const melenchon: Entrant = {
      id: 'lfi',
      allianceIds: ['x'],
      score: 22,
      members: [
        { candidateId: 'lfi', contribution: 20, weight: 20 / 22, rate: 1, rnRate: 0 },
        { candidateId: 'eco', contribution: 2, weight: 2 / 22, rate: 0.5, rnRate: 0.1 },
      ],
    }
    const res = computeSecondRound({
      electorate: { rn: 40, lfi: 20, eco: 4, ens: 36 },
      a: solo('rn', 40),
      b: melenchon,
      duel: resolveDuel(solo('rn', 40), melenchon, byId),
      profiles,
      fallback: transfers.fallback,
      candidatesById: byId,
      fidelity: 1,
      abstentionTarget: null,
      secondRoundPolls: [],
    })
    const eco = res.flows.find((f) => f.candidateId === 'eco')!
    // 2 ont suivi le leader, 0,4 ont voté RN ; les 1,6 abstentionnistes du 1er tour se reportent
    // comme les électeurs de gauche (72 / 3 / 25).
    expect(eco).toMatchObject({ share: 4, isFinalistVoter: true })
    expect(eco.toB).toBeCloseTo(2 + 1.6 * 0.72, 10)
    expect(eco.toA).toBeCloseTo(0.4 + 1.6 * 0.03, 10)
    expect(eco.abstention).toBeCloseTo(1.6 * 0.25, 10)
  })

  it('électeurs d’un petit candidat : chaque part se reporte comme l’électorat principal indiqué', () => {
    const minor = { ...cand('pt', 'gauche', null), minor: { transfers: [] } } as Candidate
    const candidatesById = new Map([...byId, ['pt', minor]])
    const input = {
      electorate: { rn: 40, ens: 30, lfi: 20, pt: 10 },
      a: solo('rn', 40),
      b: solo('ens', 30),
      duel: resolveDuel(solo('rn', 40), solo('ens', 30), byId),
      profiles,
      fallback: transfers.fallback,
      candidatesById,
      fidelity: 1,
      abstentionTarget: null,
      secondRoundPolls: [],
      minorTransfers: { pt: [{ id: 'ens', weight: 0.5 }, { id: 'lfi', weight: 0.5 }] },
    }
    const pt = computeSecondRound(input).flows.find((f) => f.candidateId === 'pt')!
    // Moitié fidèle au finaliste Ensemble, moitié comme les électeurs de gauche (72 / 3 / 25).
    expect(pt).toMatchObject({ share: 10, isFinalistVoter: false, like: input.minorTransfers.pt })
    expect(pt.toB).toBeCloseTo(5 + 5 * 0.72, 10)
    expect(pt.toA).toBeCloseTo(5 * 0.03, 10)
    expect(pt.abstention).toBeCloseTo(5 * 0.25, 10)
    // Finaliste lui-même : ses électeurs le suivent, la répartition ne s'applique pas.
    const own = computeSecondRound({ ...input, b: solo('pt', 10), duel: resolveDuel(solo('rn', 40), solo('pt', 10), candidatesById) })
    expect(own.flows.find((f) => f.candidateId === 'pt')).toMatchObject({ toB: 10, isFinalistVoter: true })
  })

  it('applique la fidélité aux électeurs des finalistes', () => {
    const res = run([solo('rn', 60), solo('lfi', 40)], { fidelity: 0.9 })
    expect(res.votes).toEqual({ a: 54, b: 36, abstention: expect.closeTo(10, 8) })
  })
})

describe('secondRoundDropout', () => {
  it('vaut 1 − exprimés du 2nd tour ÷ exprimés du 1er tour (2022)', () => {
    expect(secondRoundDropout(reference2022)).toBeCloseTo(100 * (1 - 32_057_325 / 35_132_947), 10)
    expect(secondRoundDropout(reference2022)).toBeCloseTo(8.754, 3)
  })
  it('2017 : 12,96 % (Conseil constitutionnel, décision 2017-171 PDR)', () => {
    expect(secondRoundDropout(reference2017)).toBeCloseTo(100 * (1 - 31_381_603 / 36_054_394), 10)
    expect(secondRoundDropout(reference2017)).toBeCloseTo(12.96, 2)
  })
})

describe('abandon par camp (régression écologique, législatives 2024)', () => {
  const profiles = dropoutData.legislatives2024.profiles
  it('taux et erreurs types par profil (± 0,01)', () => {
    const expected = {
      lfi_rn: [1.99, 1.58, 25.38, 4.17],
      ecolo_ps_pcf_rn: [-1.05, 0.81, 22.6, 2.25],
      ensemble_rn: [-0.68, 0.69, 9.29, 1.59],
      lr_rn: [-1.65, 1.05, 9.53, 2.92],
    } as const
    for (const [id, [c, cse, o, ose]] of Object.entries(expected)) {
      const e = campDropout(profiles[id as keyof typeof profiles])
      expect(e.camp.value).toBeCloseTo(c, 1)
      expect(e.camp.se).toBeCloseTo(cse, 1)
      expect(e.others.value).toBeCloseTo(o, 1)
      expect(e.others.se).toBeCloseTo(ose, 1)
    }
  })
  it('les taux négatifs sont bornés à 0 pour le calcul', () => {
    const duel = resolveDuel(solo('rn', 35), solo('ens', 20), byId)
    expect(duelCampRates(duel, dropoutData)!.camp).toBe(0)
    expect(duelCampRates(duel, dropoutData)!.others).toBeCloseTo(campDropout(profiles.ensemble_rn).others.value, 10)
  })
  it('duel sans RN : pas de taux par camp', () => {
    const duel = resolveDuel(solo('lfi', 20), solo('ens', 20), byId)
    expect(duelCampRates(duel, dropoutData)).toBeNull()
  })

  const entrants = [solo('rn', 40), solo('lfi', 20), solo('ens', 20), solo('eco', 10), solo('lr', 5), solo('rec', 5)]
  const rates = { camp: 2, others: 25 }
  const flow = (res: ReturnType<typeof run>, id: string) => res.flows.find((f) => f.candidateId === id)!

  it('applique le taux du camp aux blocs des finalistes et celui des autres aux autres blocs', () => {
    const res = run(entrants, { campRates: rates })
    expect(res.abstention.mode).toBe('camps')
    // Finalistes : inchangés. Gauche non LFI (eco) et extrême droite (rec) : camp ; centre, droite : autres.
    expect(flow(res, 'eco').abstention).toBeCloseTo(10 * 0.02, 10)
    expect(flow(res, 'rec').abstention).toBeCloseTo(5 * 0.02, 10)
    expect(flow(res, 'ens').abstention).toBeCloseTo(20 * 0.25, 10)
    expect(flow(res, 'lr').abstention).toBeCloseTo(5 * 0.25, 10)
    expect(flow(res, 'lfi').abstention).toBeCloseTo(run(entrants).flows.find((f) => f.candidateId === 'lfi')!.abstention, 10)
    // Le total est un résultat ; chaque électorat garde sa répartition toA / toB.
    expect(res.abstention.total).toBeCloseTo(res.votes.abstention, 10)
    expect(flow(res, 'ens').toB / flow(res, 'ens').toA).toBeCloseTo(43 / 19, 8)
  })
  it('variante famille : seul le camp du finaliste (même profil de duel, extrême droite) garde le taux du camp', () => {
    const res = run(entrants, { campRates: rates, campScope: 'family' })
    expect(flow(res, 'eco').abstention).toBeCloseTo(10 * 0.25, 10)
    expect(flow(res, 'rec').abstention).toBeCloseTo(5 * 0.02, 10)
  })
  it('total imposé : mêmes rapports de taux, coefficient commun', () => {
    const free = run(entrants, { campRates: rates })
    const res = run(entrants, { campRates: rates, abstentionTarget: 12 })
    expect(res.abstention.total).toBeCloseTo(12, 8)
    expect(res.abstention.target).toBe(12)
    const rate = (r: typeof res, id: string, share: number) => flow(r, id).abstention / share
    expect(rate(res, 'ens', 20) / rate(res, 'eco', 10)).toBeCloseTo(rate(free, 'ens', 20) / rate(free, 'eco', 10), 8)
    expect(res.abstention.factor).toBeGreaterThan(1)
  })
  it('sans taux par camp (repli) : calage uniforme inchangé', () => {
    const res = run(entrants, { abstentionTarget: 8 })
    expect(res.abstention.mode).toBe('uniform')
    expect(res.abstention.camps).toBeNull()
  })
})

describe('abandon par duel (législatives 2024, présidentielles 2002-2012)', () => {
  const profiles = dropoutData.legislatives2024.profiles
  const duel = (weights: [string, number][], kind: 'sourced' | 'fallback' = 'sourced') =>
    ({
      kind,
      challengerId: null,
      rnId: null,
      profileWeights: weights.map(([profileId, weight]) => ({ profileId, weight })),
    }) as Parameters<typeof duelDropout>[0]

  it('taux par profil recalculés depuis les sommes d’exprimés', () => {
    expect(profileDropout(profiles.lfi_rn)).toBeCloseTo(100 * (1 - 2_435_772 / 2_660_391), 10)
    expect(profileDropout(profiles.lfi_rn)).toBeCloseTo(8.44, 2)
    expect(profileDropout(profiles.ecolo_ps_pcf_rn)).toBeCloseTo(5.22, 2)
    expect(profileDropout(profiles.ensemble_rn)).toBeCloseTo(2.37, 2)
    expect(profileDropout(profiles.lr_rn)).toBeCloseTo(1.45, 2)
  })
  it('séries présidentielles : 2002 négatif, 2007 et 2012 proches de 2,6 et 2,9 %', () => {
    const byYear = Object.fromEntries(dropoutData.presidential.elections.map((e) => [e.year, presidentialDropout(e)]))
    expect(byYear[2002]).toBeCloseTo(-9.0, 1)
    expect(byYear[2007]).toBeCloseTo(2.58, 2)
    expect(byYear[2012]).toBeCloseTo(2.85, 2)
  })
  it('repli sans RN : moyenne de 2007 et 2012 (≈ 2,72 %)', () => {
    expect(noRnDropout(dropoutData)).toBeCloseTo((2.58 + 2.85) / 2, 1)
    expect(duelDropout(duel([], 'fallback'), dropoutData)).toBeCloseTo(noRnDropout(dropoutData), 10)
  })
  it('duel sourcé : abandon de son profil ; alliance : moyenne pondérée des profils', () => {
    expect(duelDropout(duel([['lfi_rn', 1]]), dropoutData)).toBeCloseTo(profileDropout(profiles.lfi_rn), 10)
    expect(
      duelDropout(
        duel([
          ['lfi_rn', 0.75],
          ['ensemble_rn', 0.25],
        ]),
        dropoutData,
      ),
    ).toBeCloseTo(0.75 * profileDropout(profiles.lfi_rn) + 0.25 * profileDropout(profiles.ensemble_rn), 10)
  })
})

describe('noIntentionRange', () => {
  const source = { label: 'Notice', url: 'https://example.org/notice.pdf' }
  const duel = (scores: Record<string, number>, share?: number): SecondRoundPoll => ({
    institute: 'Institut',
    sponsor: 'Non indiqué',
    fieldwork: { start: '2026-10-01', end: '2026-10-02' },
    sampleSize: 1000,
    url: source.url,
    scores,
    ...(share === undefined ? {} : { noIntention: { share, base: 'inscrits' as const, source } }),
  })

  it('va de la part la plus basse à la plus haute, tous duels confondus, sans les duels non renseignés', () => {
    const polls = [duel({ a: 31, rn: 69 }, 33), duel({ b: 44, rn: 56 }, 19), duel({ a: 34, b: 66 }, 49.5), duel({ c: 40, rn: 60 })]
    expect(noIntentionRange(polls)).toEqual({ min: 19, max: 49.5, polls: polls.slice(0, 3) })
  })

  it('est indéfinie si aucun duel ne la renseigne', () => {
    expect(noIntentionRange([duel({ a: 31, rn: 69 })])).toBeUndefined()
  })
})

describe('fallbackSplit', () => {
  it('répartit selon les affinités après abstention', () => {
    const split = fallbackSplit('centre', 'gauche', 'droite', transfers.fallback)
    expect(split.toA + split.toB + split.abstention).toBeCloseTo(100, 8)
    expect(split.toB).toBeGreaterThan(split.toA)
  })
})

describe('pollBiasGaps (écart historique des sondages de 2nd tour)', () => {
  const live = { asOf: '2026-11-03', electionDate: '2027-04-18' }
  it('2022 : moyenne des sondages à la même distance du 1er tour (J−166, ± 20 jours)', () => {
    const g = pollBiasGaps(simulationData.secondRoundPollBias, live).find((x) => x.year === 2022)!
    expect(g.pollCount).toBe(13)
    expect(g.estimate).toBeCloseTo(56.08, 2)
    expect(g.gap).toBeCloseTo(2.47, 2)
    expect(g.nearest).toBeNull()
  })
  it('2017 : aucun sondage dans la fenêtre, repli sur le plus proche (Ifop, 03/12/2016)', () => {
    const g = pollBiasGaps(simulationData.secondRoundPollBias, live).find((x) => x.year === 2017)!
    expect(g.pollCount).toBe(0)
    expect(g.nearest).toEqual({ institute: 'Ifop', end: '2016-12-03', distance: 141 })
    expect(g.estimate).toBe(62)
    expect(g.gap).toBeCloseTo(4.1, 2)
  })
})
