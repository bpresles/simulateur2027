import { frozenData as simulationData } from '../test/frozenData'
import { computeSecondRound, noIntentionRange, secondRoundDropout2022 } from './secondRound'
import { blendProfiles, effectiveProfiles, fallbackSplit, resolveDuel } from './transfers'
import type { Candidate, Entrant, SecondRoundPoll } from './types'

const { transfers, reference2022 } = simulationData
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
const run = (entrants: Entrant[], opts: { fidelity?: number; abstentionTarget?: number | null } = {}) =>
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

describe('secondRoundDropout2022', () => {
  it('vaut 1 − exprimés du 2nd tour ÷ exprimés du 1er tour (2022)', () => {
    expect(secondRoundDropout2022(reference2022)).toBeCloseTo(100 * (1 - 32_057_325 / 35_132_947), 10)
    expect(secondRoundDropout2022(reference2022)).toBeCloseTo(8.754, 3)
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
