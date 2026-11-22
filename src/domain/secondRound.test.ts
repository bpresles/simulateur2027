import { frozenData as simulationData } from '../test/frozenData'
import {
  aggregatedProfileDropout,
  computeSecondRound,
  noIntentionRange,
  pollBiasGaps,
  presidentialDropout,
  secondRoundDropout,
} from './secondRound'
import { defaultSettings } from './simulate'
import {
  REPUBLICAN_FRONT_PRESETS,
  applyRepublicanFrontRow,
  correctDeclaredRowLogit,
  effectiveAbstainerAntiRnShare,
  effectiveProfiles,
  fidelityFor,
  lfiLeftTransferRow,
  nonRnSplit,
  resolveDuel,
} from './transfers'
import { BLOCS } from './types'
import type { Candidate, ProfileId, SecondRoundPoll } from './types'

const { transfers, declaredTransfers, reference2022, reference2017, secondRoundDropout: dropoutData } = simulationData

const cand = (id: string, bloc: Candidate['bloc'], duelProfile: Candidate['duelProfile'], isRN = false) =>
  ({ id, bloc, duelProfile, isRN }) as Candidate
const candidates = [
  cand('melenchon', 'gauche', 'lfi_rn'),
  cand('eco', 'gauche', 'ecolo_ps_pcf_rn'),
  cand('ens', 'centre', 'ensemble_rn'),
  cand('lr', 'droite', 'lr_rn'),
  cand('lepen', 'extreme_droite', null, true),
  cand('rec', 'extreme_droite', null),
]
const byId = new Map(candidates.map((c) => [c.id, c]))

describe('resolveDuel & nonRnSplit', () => {
  it('utilise le profil sourcé face au RN', () => {
    const duel = resolveDuel('lepen', 'melenchon', byId)
    expect(duel).toMatchObject({ kind: 'rn-sourced', challengerId: 'melenchon', rnId: 'lepen' })
    expect(duel.profileWeights).toEqual([{ profileId: 'lfi_rn', weight: 1 }])
  })

  it('utilise les présidentielles 2007–2012 pour un duel gauche vs centre/droite hors RN', () => {
    expect(resolveDuel('melenchon', 'ens', byId).kind).toBe('non-rn-presidential')
    expect(resolveDuel('lr', 'eco', byId).kind).toBe('non-rn-presidential')
    const split = nonRnSplit('gauche', 'gauche', 'droite', transfers.nonRnPresidential)
    expect(split).toEqual({ toA: 75, toB: 6, abstention: 19 })
  })

  it('bascule sur sameSide pour un duel entre deux candidats du même côté', () => {
    expect(resolveDuel('ens', 'lr', byId).kind).toBe('non-rn-same-side')
    const split = nonRnSplit('centre', 'centre', 'droite', transfers.nonRnPresidential)
    expect(split.toA + split.toB + split.abstention).toBeCloseTo(100, 8)
    expect(split.toA).toBeGreaterThan(split.toB)
  })
})

describe('effectiveProfiles, interpolation 2022↔2024, report gauche hors LFI & correction logit', () => {
  it('différencie la fidélité par finaliste (Le Pen 96 %, Mélenchon 92 %, autres 95 %)', () => {
    expect(fidelityFor('lepen', transfers, null)).toEqual({ loyal: 96, cross: 1, abstention: 3 })
    expect(fidelityFor('melenchon', transfers, null)).toEqual({ loyal: 92, cross: 2, abstention: 6 })
    expect(fidelityFor('ens', transfers, null)).toEqual({ loyal: 95, cross: 1.5, abstention: 3.5 })
    expect(fidelityFor('melenchon', transfers, 0.9)).toEqual({ loyal: 90, cross: 0, abstention: 10 })
  })

  it('interpole proprement en logit entre Présidentielle 2022 (0 %) et Législatives 2024 (100 %) sur les 4 profils', () => {
    const prof2024 = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: REPUBLICAN_FRONT_PRESETS.leg2024,
    })
    const profMid = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: REPUBLICAN_FRONT_PRESETS.midpoint,
    })
    const prof2022 = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: REPUBLICAN_FRONT_PRESETS.pres2022,
    })

    // Conservation à 100 % sur tous les profils et blocs
    for (const table of [prof2022, profMid, prof2024]) {
      for (const pid of ['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn'] as ProfileId[]) {
        for (const b of BLOCS) {
          const r = table[pid][b]
          expect(r.finalist + r.rn + r.abstention).toBeCloseTo(100, 8)
          expect(r.finalist).toBeGreaterThanOrEqual(0)
          expect(r.rn).toBeGreaterThanOrEqual(0)
          expect(r.abstention).toBeGreaterThanOrEqual(0)
        }
      }
    }

    // Extrémités exactes sur ensemble_rn : 100 % = Ipsos-Talan 2024 (72 %), 0 % = Présidentielle 2022 (47 % gauche, 53 % droite)
    expect(prof2024.ensemble_rn.gauche.finalist).toBeCloseTo(72, 6)
    expect(prof2022.ensemble_rn.gauche.finalist).toBeCloseTo(47, 4)
    expect(prof2022.ensemble_rn.gauche.rn).toBeCloseTo(15, 4)
    expect(prof2022.ensemble_rn.droite.finalist).toBeCloseTo(53, 4)
    expect(prof2022.ensemble_rn.droite.rn).toBeCloseTo(18, 4)

    // Monotonie stricte entre 2022 (0 %) et 2024 (100 %) sur les 4 profils
    expect(prof2024.ensemble_rn.gauche.finalist).toBeGreaterThan(profMid.ensemble_rn.gauche.finalist)
    expect(profMid.ensemble_rn.gauche.finalist).toBeGreaterThan(prof2022.ensemble_rn.gauche.finalist)
    expect(prof2024.lr_rn.gauche.finalist).toBeGreaterThan(prof2022.lr_rn.gauche.finalist)
    expect(prof2024.ecolo_ps_pcf_rn.centre.finalist).toBeGreaterThan(prof2022.ecolo_ps_pcf_rn.centre.finalist)
    expect(prof2024.lfi_rn.centre.finalist).toBeGreaterThan(prof2022.lfi_rn.centre.finalist)
    expect(prof2024.lfi_rn.droite.finalist).toBeGreaterThan(prof2022.lfi_rn.droite.finalist)

    // Cohérence ordinale (aucune inversion)
    expect(prof2024.ensemble_rn.gauche.finalist).toBeGreaterThan(prof2024.lr_rn.gauche.finalist)
    expect(prof2022.lr_rn.centre.finalist).toBeGreaterThan(prof2022.ecolo_ps_pcf_rn.centre.finalist)
    expect(prof2022.ecolo_ps_pcf_rn.centre.finalist).toBeGreaterThan(prof2022.lfi_rn.centre.finalist)
    expect(prof2022.ensemble_rn.droite.finalist).toBeGreaterThan(prof2022.ecolo_ps_pcf_rn.droite.finalist)
    expect(prof2022.ecolo_ps_pcf_rn.droite.finalist).toBeGreaterThan(prof2022.lfi_rn.droite.finalist)

    // Nouveaux votants : 50 % hors RN, baseShare conservé face au RN (sans règle inventée)
    expect(effectiveAbstainerAntiRnShare(0.55, null)).toBe(0.5)
    expect(effectiveAbstainerAntiRnShare(0.55, 0)).toBeCloseTo(0.55, 8)
    expect(effectiveAbstainerAntiRnShare(0.55, 1)).toBeCloseTo(0.55, 8)
  })

  it('lfiLeftTransferRow interpole proprement le report gauche hors LFI → Mélenchon entre 36 % et 72 %', () => {
    const at72 = lfiLeftTransferRow(72, transfers, declaredTransfers)
    const at36 = lfiLeftTransferRow(36, transfers, declaredTransfers)
    const at54 = lfiLeftTransferRow(54, transfers, declaredTransfers)
    for (const r of [at72, at54, at36]) {
      expect(r.finalist + r.rn + r.abstention).toBeCloseTo(100, 8)
    }
    expect(at72.finalist).toBeCloseTo(72, 6)
    expect(at72.rn).toBeCloseTo(3, 6)
    expect(at36.finalist).toBeCloseTo(36, 6)
    expect(at36.rn).toBeGreaterThan(at72.rn)
    expect(at54.finalist).toBeCloseTo(54, 6)
  })

  it('corrige les déclarations 2027 sur échelle logit multinomial (dans [0 ; 100], somme 100)', () => {
    const raw = declaredTransfers.profiles.lfi_rn.centre
    const corr = correctDeclaredRowLogit(raw, declaredTransfers.logitCorrection)
    expect(corr.finalist + corr.rn + corr.abstention).toBeCloseTo(100, 8)
    expect(corr.finalist).toBeGreaterThan(raw.finalist)
    expect(corr.rn).toBeLessThan(raw.rn)
  })
})

describe('computeSecondRound (moteur unifié en flux bruts)', () => {
  const electorate = { lepen: 40, melenchon: 20, ens: 20, eco: 10, lr: 5, rec: 5 }
  const profiles = effectiveProfiles(transfers, declaredTransfers, defaultSettings())

  it('reproduit exactement un calcul à la main en % des inscrits (somme = 100 %)', () => {
    const res = computeSecondRound({
      electorate,
      a: 'lepen',
      b: 'melenchon',
      duel: resolveDuel('lepen', 'melenchon', byId),
      profiles,
      nonRnPresidential: transfers.nonRnPresidential,
      fidelityA: { loyal: 100, cross: 0, abstention: 0 },
      fidelityB: { loyal: 100, cross: 0, abstention: 0 },
      candidatesById: byId,
      firstRoundTurnout: 80,
      blankNullShare: 0.05,
      abstainerMobilization: 0.2,
      abstainerAntiRnShare: 0.55,
      republicanFrontStrength: 1,
      secondRoundPolls: [],
    })
    // P = 80, BN1 = 4, E1 = 76, scale = 0.76, abst1 = 20, newVoters = 4 (2.2 Mélenchon, 1.8 Le Pen)
    expect(res.blankNull1).toBeCloseTo(4, 10)
    expect(res.expressed1).toBeCloseTo(76, 10)
    expect(res.newVoters).toBeCloseTo(4, 10)
    const lfi = profiles.lfi_rn
    const melPts =
      20 + 20 * (lfi.centre.finalist / 100) + 10 * (lfi.gauche.finalist / 100) + 5 * (lfi.droite.finalist / 100)
    const rnPts =
      40 +
      20 * (lfi.centre.rn / 100) +
      10 * (lfi.gauche.rn / 100) +
      5 * (lfi.droite.rn / 100) +
      5 * (lfi.extreme_droite.rn / 100)
    const totB = melPts * 0.76 + 4 * 0.55
    const totA = rnPts * 0.76 + 4 * 0.45
    expect(res.totals.a).toBeCloseTo(totA, 8)
    expect(res.totals.b).toBeCloseTo(totB, 8)
    expect(res.pct.a).toBeCloseTo((100 * totA) / (totA + totB), 8)
    expect(res.totals.a + res.totals.b + res.totals.nonExpressed + res.blankNull1).toBeCloseTo(100, 10)
  })

  it('électeurs d’un petit candidat : chaque part suit l’électorat principal indiqué', () => {
    const minor = { ...cand('pt', 'gauche', null), minor: { transfers: [] } } as Candidate
    const map = new Map([...byId, ['pt', minor]])
    const prof24 = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: REPUBLICAN_FRONT_PRESETS.leg2024,
    })
    const expectedGauche = applyRepublicanFrontRow(
      'ensemble_rn',
      'gauche',
      transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows.gauche,
      transfers,
      1,
    )
    const res = computeSecondRound({
      electorate: { lepen: 40, ens: 30, melenchon: 20, pt: 10 },
      a: 'lepen',
      b: 'ens',
      duel: resolveDuel('lepen', 'ens', map),
      profiles: prof24,
      nonRnPresidential: transfers.nonRnPresidential,
      fidelityA: { loyal: 100, cross: 0, abstention: 0 },
      fidelityB: { loyal: 100, cross: 0, abstention: 0 },
      candidatesById: map,
      firstRoundTurnout: 100,
      blankNullShare: 0,
      abstainerMobilization: 0,
      abstainerAntiRnShare: 0.55,
      secondRoundPolls: [],
      minorTransfers: { pt: [{ id: 'ens', weight: 0.5 }, { id: 'melenchon', weight: 0.5 }] },
    })
    const pt = res.flows.find((f) => f.candidateId === 'pt')!
    expect(pt.toB).toBeCloseTo(5 + 5 * (expectedGauche.finalist / 100), 10)
    expect(pt.toA).toBeCloseTo(5 * (expectedGauche.rn / 100), 10)
    expect(pt.abstention).toBeCloseTo(5 * (expectedGauche.abstention / 100), 10)
  })
})

describe('indicateurs historiques (abandon, noIntention, pollBiasGaps)', () => {
  it('secondRoundDropout et presidentialDropout', () => {
    expect(secondRoundDropout(reference2022)).toBeCloseTo(8.754, 3)
    expect(secondRoundDropout(reference2017)).toBeCloseTo(12.96, 2)
    const byYear = Object.fromEntries(dropoutData.presidential.elections.map((e) => [e.year, presidentialDropout(e)]))
    expect(byYear[2002]).toBeCloseTo(-9.0, 1)
    expect(byYear[2007]).toBeCloseTo(2.58, 2)
    expect(byYear[2012]).toBeCloseTo(2.85, 2)
  })

  it('aggregatedProfileDropout sur les agrégats 2024', () => {
    const p = dropoutData.legislatives2024.profiles
    expect(aggregatedProfileDropout(p.lfi_rn)).toBeCloseTo(8.44, 2)
    expect(aggregatedProfileDropout(p.ecolo_ps_pcf_rn)).toBeCloseTo(5.22, 2)
    expect(aggregatedProfileDropout(p.ensemble_rn)).toBeCloseTo(2.37, 2)
    expect(aggregatedProfileDropout(p.lr_rn)).toBeCloseTo(1.45, 2)
  })

  it('noIntentionRange', () => {
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
    const polls = [duel({ a: 31, rn: 69 }, 33), duel({ b: 44, rn: 56 }, 19), duel({ c: 40, rn: 60 })]
    expect(noIntentionRange(polls)).toEqual({ min: 19, max: 33, polls: polls.slice(0, 2) })
    expect(noIntentionRange([duel({ a: 31, rn: 69 })])).toBeUndefined()
  })

  it('pollBiasGaps à J−166', () => {
    const live = { asOf: '2026-11-03', electionDate: '2027-04-18' }
    const g2022 = pollBiasGaps(simulationData.secondRoundPollBias, live).find((x) => x.year === 2022)!
    expect(g2022.pollCount).toBe(13)
    expect(g2022.estimate).toBeCloseTo(56.08, 2)
    const g2017 = pollBiasGaps(simulationData.secondRoundPollBias, live).find((x) => x.year === 2017)!
    expect(g2017.nearest).toEqual({ institute: 'Ifop', end: '2016-12-03', distance: 141 })
  })
})
