import { legislativeDuelPolls2024, simulationData as liveSimulationData } from '../data/schema'
import { frozenData as simulationData } from '../test/frozenData'
import {
  aggregatedProfileDropout,
  betweenRoundsLastDayGap,
  betweenRoundsSummaries,
  computeSecondRound,
  directPollGapAlert,
  directPollRmse,
  implicitNoIntention,
  matchingLegislativeDuelPolls,
  noIntentionRange,
  pollBiasGaps,
  presidentialDropout,
  secondRoundDropout,
} from './secondRound'
import { defaultSettings, simulate } from './simulate'
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
import type { Candidate, LegislativeDuelPolls2024Data, ProfileId, SecondRoundPoll } from './types'

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
  it('applique la fidélité symétrique neutre par défaut (S3), la fidélité déclarée corrigée en mode declared2027 et le mode uniforme manuel', () => {
    expect(fidelityFor('lepen', transfers, null)).toEqual({ loyal: 94.75, cross: 1.75, abstention: 3.5 })
    expect(fidelityFor('melenchon', transfers, null)).toEqual({ loyal: 94.75, cross: 1.75, abstention: 3.5 })
    expect(fidelityFor('ens', transfers, null)).toEqual({ loyal: 94.75, cross: 1.75, abstention: 3.5 })
    expect(fidelityFor('melenchon', transfers, 0.9)).toEqual({ loyal: 90, cross: 0, abstention: 10 })

    const declLePen = fidelityFor('lepen', transfers, null, {
      declaredTransfers,
      transferSource: 'declared2027',
      isRnDuel: true,
      isRnFinalist: true,
    })
    const declMel = fidelityFor('melenchon', transfers, null, {
      declaredTransfers,
      transferSource: 'declared2027',
      isRnDuel: true,
      isRnFinalist: false,
    })
    expect(declLePen.loyal + declLePen.cross + declLePen.abstention).toBeCloseTo(100, 8)
    expect(declMel.loyal + declMel.cross + declMel.abstention).toBeCloseTo(100, 8)
    expect(declLePen.loyal).toBeLessThan(96)
    expect(declMel.loyal).toBeGreaterThan(92)

    const blendMel = fidelityFor('melenchon', transfers, null, {
      declaredTransfers,
      transferSource: 'blend',
      declaredWeight: 0.5,
      isRnDuel: true,
      isRnFinalist: false,
    })
    expect(blendMel.loyal).toBeCloseTo((94.75 + declMel.loyal) / 2, 8)
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

    // Extrémités et ancre 2017 exactes sur ensemble_rn (P2 : 0 = 2022, 0,5502 = 2017, 1 = 2024)
    const pos2017 = transfers.presidentialCenterRn.anchor2017Position
    const prof2017 = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: { gauche: pos2017, centre: pos2017, droite: pos2017 },
    })
    expect(prof2024.ensemble_rn.gauche.finalist).toBeCloseTo(72, 6)
    expect(prof2017.ensemble_rn.gauche.finalist).toBeCloseTo(56.65, 4)
    expect(prof2017.ensemble_rn.gauche.rn).toBeCloseTo(5.78, 4)
    expect(prof2017.ensemble_rn.droite.finalist).toBeCloseTo(48, 4)
    expect(prof2017.ensemble_rn.droite.rn).toBeCloseTo(20, 4)
    expect(prof2022.ensemble_rn.gauche.finalist).toBeCloseTo(45.92, 4)
    expect(prof2022.ensemble_rn.gauche.rn).toBeCloseTo(13.52, 4)
    expect(prof2022.ensemble_rn.droite.finalist).toBeCloseTo(52.5, 4)
    expect(prof2022.ensemble_rn.droite.rn).toBeCloseTo(18, 4)
    // Aucune extrapolation hors des 3 ancres [0 ; 1] (R2.3)
    expect(
      applyRepublicanFrontRow(
        'ensemble_rn',
        'gauche',
        transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows.gauche,
        transfers,
        -0.5,
      ),
    ).toEqual(prof2022.ensemble_rn.gauche)
    expect(
      applyRepublicanFrontRow(
        'ensemble_rn',
        'gauche',
        transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows.gauche,
        transfers,
        1.5,
      ),
    ).toEqual(prof2024.ensemble_rn.gauche)
    // Extrême droite hors finaliste : moyenne mesurée admissible S4 (18,25 / 52,75 / 29 %)
    expect(prof2024.ensemble_rn.extreme_droite).toEqual({ finalist: 18.25, rn: 52.75, abstention: 29 })
    expect(prof2022.ensemble_rn.extreme_droite).toEqual({ finalist: 18.25, rn: 52.75, abstention: 29 })

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

    // Pilotage par électorat qui se reporte : abaisser uniquement le centre impacte lfi_rn.centre et lr_rn.centre, pas ensemble_rn.gauche
    const lowCentre = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: { gauche: 1, centre: 0, droite: 1 },
    })
    expect(lowCentre.lfi_rn.centre.finalist).toBeLessThan(prof2024.lfi_rn.centre.finalist)
    expect(lowCentre.lr_rn.centre.finalist).toBeLessThan(prof2024.lr_rn.centre.finalist)
    expect(lowCentre.lfi_rn.droite.finalist).toBeCloseTo(prof2024.lfi_rn.droite.finalist, 8)
    expect(lowCentre.lfi_rn.gauche.finalist).toBeCloseTo(prof2024.lfi_rn.gauche.finalist, 8)
    expect(lowCentre.ensemble_rn.gauche.finalist).toBeCloseTo(prof2024.ensemble_rn.gauche.finalist, 8)

    // Abaisser uniquement la gauche impacte gauche hors LFI sur lfi_rn (72 % → 45,92 %) et ecolo_ps_pcf_rn, sans toucher centre ni droite
    const lowGauche = effectiveProfiles(transfers, declaredTransfers, {
      ...defaultSettings(),
      republicanFront: { gauche: 0, centre: 1, droite: 1 },
    })
    expect(prof2024.lfi_rn.gauche.finalist).toBeCloseTo(72, 6)
    expect(lowGauche.lfi_rn.gauche.finalist).toBeCloseTo(45.92, 4)
    expect(lowGauche.lfi_rn.gauche.rn).toBeCloseTo(13.52, 4)
    expect(lowGauche.ecolo_ps_pcf_rn.gauche.finalist).toBeCloseTo(45.92, 4)
    expect(lowGauche.lfi_rn.centre.finalist).toBeCloseTo(prof2024.lfi_rn.centre.finalist, 8)
    expect(lowGauche.lfi_rn.droite.finalist).toBeCloseTo(prof2024.lfi_rn.droite.finalist, 8)

    // Nouveaux votants : null en mode neutre (S2) ou hors RN, baseShare conservé face au RN en mode manuel
    expect(effectiveAbstainerAntiRnShare(null, null)).toBeNull()
    expect(effectiveAbstainerAntiRnShare(null, 1)).toBeNull()
    expect(effectiveAbstainerAntiRnShare(0.55, null)).toBeNull()
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

  it('corrige les déclarations 2027 sur échelle logit multinomial et conserve les replis historiques (S4)', () => {
    const raw = declaredTransfers.profiles.lfi_rn.centre
    const corr = correctDeclaredRowLogit(raw, declaredTransfers.logitCorrection)
    expect(corr.finalist + corr.rn + corr.abstention).toBeCloseTo(100, 8)
    expect(corr.finalist).toBeGreaterThan(raw.finalist)
    expect(corr.rn).toBeLessThan(raw.rn)

    const edRaw = declaredTransfers.profiles.lfi_rn.extreme_droite
    const edCorr = correctDeclaredRowLogit(edRaw, declaredTransfers.logitCorrection)
    expect(edCorr).toEqual({ finalist: edRaw.finalist, rn: edRaw.rn, abstention: edRaw.abstention })
  })
})

describe('computeSecondRound (moteur unifié en flux bruts)', () => {
  const electorate = { lepen: 40, melenchon: 20, ens: 20, eco: 10, lr: 5, rec: 5 }
  const profiles = effectiveProfiles(transfers, declaredTransfers, defaultSettings())

  it('reproduit exactement un calcul à la main en % des inscrits (S1 unifié, somme = 100 %)', () => {
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
    // P = 80, BN1 = 4, E1 = 76, scale = 0.76, nonExpressed1 = abst1 (20) + BN1 (4) = 24, newVoters = 4.8
    expect(res.blankNull1).toBeCloseTo(4, 10)
    expect(res.expressed1).toBeCloseTo(76, 10)
    expect(res.newVoters).toBeCloseTo(4.8, 10)
    const lfi = profiles.lfi_rn
    const melPts =
      20 +
      20 * (lfi.centre.finalist / 100) +
      10 * (lfi.gauche.finalist / 100) +
      5 * (lfi.droite.finalist / 100) +
      5 * (lfi.extreme_droite.finalist / 100)
    const rnPts =
      40 +
      20 * (lfi.centre.rn / 100) +
      10 * (lfi.gauche.rn / 100) +
      5 * (lfi.droite.rn / 100) +
      5 * (lfi.extreme_droite.rn / 100)
    const totB = melPts * 0.76 + 4.8 * 0.55
    const totA = rnPts * 0.76 + 4.8 * 0.45
    expect(res.totals.a).toBeCloseTo(totA, 8)
    expect(res.totals.b).toBeCloseTo(totB, 8)
    expect(res.pct.a).toBeCloseTo((100 * totA) / (totA + totB), 8)
    expect(res.totals.a + res.totals.b + res.totals.nonExpressed).toBeCloseTo(100, 10)
    expect(res.blankNull.toA + res.blankNull.toB + res.blankNull.nonExpressed).toBeCloseTo(4, 10)

    // Mode endogène neutre (S2) : abstainerAntiRnShare = null laisse pct.a invariant à la mobilisation
    const neutral1 = computeSecondRound({
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
      abstainerMobilization: 0.14,
      abstainerAntiRnShare: null,
      republicanFrontStrength: 1,
      secondRoundPolls: [],
    })
    const neutral2 = computeSecondRound({
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
      abstainerMobilization: 0.3,
      abstainerAntiRnShare: null,
      republicanFrontStrength: 1,
      secondRoundPolls: [],
    })
    expect(neutral1.pct.a).toBeCloseTo(neutral2.pct.a, 10)
    expect(neutral1.effectiveAbstainerAntiRnShare).toBeCloseTo(melPts / (melPts + rnPts), 10)
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

describe('alerte d’écart aux sondages directs et sans-intention implicite', () => {
  const live = { asOf: '2026-11-23', electionDate: '2027-04-11' }

  it('calcule le RMSE historique depuis les données (pas de constante)', () => {
    const r = directPollRmse(simulationData.secondRoundPollBias, live)!
    expect(r.count).toBeGreaterThan(0)
    expect(r.rmse).toBeGreaterThan(0)
    expect(r.rmse).toBeLessThan(10)
    expect(directPollRmse({ description: '', elections: [] }, live)).toBeUndefined()
  })

  it('déclenche l’alerte au-delà de 2 × RMSE seulement', () => {
    const polls = [{ scores: { a: 50 } }, { scores: { a: 54 } }]
    expect(directPollGapAlert(52, polls, 'a', 2)).toMatchObject({ pollMean: 52, gap: 0, threshold: 4, exceeded: false })
    expect(directPollGapAlert(57, polls, 'a', 2)!.exceeded).toBe(true)
    expect(directPollGapAlert(56, polls, 'a', 2)!.exceeded).toBe(false)
  })

  it('ne renvoie rien sans sondage ou sans RMSE', () => {
    expect(directPollGapAlert(50, [], 'a', 2)).toBeNull()
    expect(directPollGapAlert(50, [{ scores: { a: 50 } }], 'a', undefined)).toBeNull()
  })

  it('applique (m·E − p·I)/(E − I) sur base votants', () => {
    // s = 20 % sans intention, E = 100, I = 80 : q = (m·100 − p·80)/20 ; m = 55, p = 52 -> 67
    const r = implicitNoIntention(55, 52, { share: 20, base: 'votants' }, 70)
    expect(r).toEqual({ kind: 'ok', share: expect.closeTo(67, 6) })
  })

  it('gère les cas impossibles et la base absente', () => {
    expect(implicitNoIntention(55, 52, undefined, 70)).toBeUndefined()
    // inscrits : E = 70 < I = 80 -> aucune place
    expect(implicitNoIntention(55, 52, { share: 20, base: 'inscrits' }, 70)).toEqual({
      kind: 'impossible',
      reason: 'no-room',
      share: null,
    })
    // q hors [0 ; 100]
    const r = implicitNoIntention(70, 52, { share: 20, base: 'votants' }, 70)
    expect(r).toMatchObject({ kind: 'impossible', reason: 'out-of-range' })
    expect(implicitNoIntention(Number.NaN, 52, { share: 20, base: 'votants' }, 70)).toBeUndefined()
  })
})

describe('P4 — sondages de l’entre-deux-tours (affichage seulement) et règle d’identité stricte', () => {
  it('pollBiasGaps et directPollRmse renvoient des valeurs strictement identiques avec ou sans entreDeuxTours', () => {
    const onlyBefore = {
      ...liveSimulationData.secondRoundPollBias,
      elections: liveSimulationData.secondRoundPollBias.elections.map((e) => ({
        ...e,
        polls: e.polls.filter((p) => p.phase === 'avantPremierTour'),
      })),
    }

    // Invariance stricte sur les données vivantes et sur la date de référence du 23/11/2026
    expect(pollBiasGaps(liveSimulationData.secondRoundPollBias, liveSimulationData.polls)).toEqual(
      pollBiasGaps(onlyBefore, liveSimulationData.polls),
    )
    expect(directPollRmse(liveSimulationData.secondRoundPollBias, liveSimulationData.polls)).toEqual(
      directPollRmse(onlyBefore, liveSimulationData.polls),
    )

    const refDate = { asOf: '2026-11-23', electionDate: '2027-04-18' }
    const gapsWith = pollBiasGaps(liveSimulationData.secondRoundPollBias, refDate)
    const gapsWithout = pollBiasGaps(onlyBefore, refDate)
    expect(gapsWith).toEqual(gapsWithout)
    // Vérification directe des mesures de référence (−3,3 et −4,1 pts pour les sondages au 23/11/2026)
    expect(gapsWith.find((g) => g.year === 2022)!.gap).toBeCloseTo(3.277272727272724, 12)
    expect(gapsWith.find((g) => g.year === 2017)!.gap).toBeCloseTo(4.099999999999994, 12)

    const rmseWith = directPollRmse(liveSimulationData.secondRoundPollBias, refDate)
    const rmseWithout = directPollRmse(onlyBefore, refDate)
    expect(rmseWith).toEqual(rmseWithout)
    expect(rmseWith!.rmse).toBeCloseTo(3.525354592094245, 12)
    expect(rmseWith!.count).toBe(12)
  })

  it('betweenRoundsSummaries ne retient que les sondages entreDeuxTours (2017 et 2022)', () => {
    const summaries = betweenRoundsSummaries(liveSimulationData.secondRoundPollBias)
    expect(summaries.map((s) => s.year)).toEqual([2022, 2017])
    const s2022 = summaries.find((s) => s.year === 2022)!
    expect(s2022.pollCount).toBe(42)
    expect(s2022.lastDayDate).toBe('2022-04-22')
    expect(s2022.lastDayCount).toBe(5)
    expect(s2022.polls.every((p) => p.phase === 'entreDeuxTours')).toBe(true)

    const s2017 = summaries.find((s) => s.year === 2017)!
    expect(s2017.pollCount).toBe(22)
    expect(s2017.lastDayDate).toBe('2017-05-05')
    expect(s2017.lastDayCount).toBe(3)
    expect(s2017.polls.every((p) => p.phase === 'entreDeuxTours')).toBe(true)
  })

  it('la sortie de runMonteCarlo à graine fixe (2027) est strictement inchangée par l’ajout des sondages entreDeuxTours lorsque betweenRoundsBias = "none"', () => {
    const onlyBeforeData = {
      ...simulationData,
      secondRoundPollBias: {
        ...simulationData.secondRoundPollBias,
        elections: simulationData.secondRoundPollBias.elections.map((e) => ({
          ...e,
          polls: e.polls.filter((p) => p.phase === 'avantPremierTour'),
        })),
      },
    }
    const settings = { ...defaultSettings(), betweenRoundsBias: 'none' as const }
    const withBetween = simulate(simulationData, settings)
    const withoutBetween = simulate(onlyBeforeData, settings)
    expect(withBetween.monteCarlo).toEqual(withoutBetween.monteCarlo)
    expect(withBetween.secondRound).toEqual(withoutBetween.secondRound)
    expect(withBetween.monteCarlo.seed).toBe(2027)
  })

  it('règle d’identité stricte : associe exactement la paire de partis et exclut toute paire voisine ou alliée', () => {
    // Données réelles : Calvados 6e (Renaissance – RN) correspond à Attal – Le Pen (dans les deux ordres)
    const attalLePen = matchingLegislativeDuelPolls(legislativeDuelPolls2024, 'attal', 'lepen')
    expect(attalLePen).toHaveLength(1)
    expect(attalLePen[0]!.poll.constituencyCode).toBe('1406')
    expect(attalLePen[0]!.candidateA.party).toBe('Renaissance')
    expect(attalLePen[0]!.candidateB.party).toBe('RN')
    expect(attalLePen[0]!.gapA).toBeCloseTo(2.36, 6)

    const lePenAttal = matchingLegislativeDuelPolls(legislativeDuelPolls2024, 'lepen', 'attal')
    expect(lePenAttal).toHaveLength(1)
    expect(lePenAttal[0]!.candidateA.party).toBe('RN')
    expect(lePenAttal[0]!.gapA).toBeCloseTo(-2.36, 6)

    // Paire voisine exclue : Philippe (Horizons) – Le Pen (RN) ≠ Renaissance – RN
    expect(matchingLegislativeDuelPolls(legislativeDuelPolls2024, 'philippe', 'lepen')).toEqual([])
    // Aucun sondage d'entre-deux-tours LFI – RN dans les données réelles
    expect(matchingLegislativeDuelPolls(legislativeDuelPolls2024, 'melenchon', 'lepen')).toEqual([])
    // Candidat sans parti unique : toujours exclu
    expect(matchingLegislativeDuelPolls(legislativeDuelPolls2024, 'polony', 'lepen')).toEqual([])

    // Fixture explicite : LFI – RN inclus sur Mélenchon – Le Pen, mais allié du RN (UXD) – LFI et PS – RN exclus
    const src = { label: 'Source', url: 'https://example.org/source' }
    const fixture: LegislativeDuelPolls2024Data = {
      description: 'Fixture',
      inventoryNote: 'Fixture',
      electionDates: { firstRound: '2024-06-30', secondRound: '2024-07-07' },
      candidateParties: { melenchon: 'LFI', lepen: 'RN', glucksmann: 'Place publique' },
      polls: [
        {
          id: 'exact-lfi-rn',
          constituencyCode: '0001',
          constituencyLabel: 'Circo exacte',
          institute: 'Institut',
          sponsor: 'Média',
          fieldwork: { start: '2024-07-02', end: '2024-07-03' },
          sampleSize: 600,
          url: src.url,
          officialResultSource: src,
          candidates: [
            { name: 'Cand LFI', party: 'LFI', officialNuance: 'UG', partySource: src, pollScore: 48, officialScore: 51 },
            { name: 'Cand RN', party: 'RN', officialNuance: 'RN', partySource: src, pollScore: 52, officialScore: 49 },
          ],
        },
        {
          id: 'ally-uxd-lfi',
          constituencyCode: '0002',
          constituencyLabel: 'Circo allié RN',
          institute: 'Institut',
          sponsor: 'Média',
          fieldwork: { start: '2024-07-02', end: '2024-07-03' },
          sampleSize: 600,
          url: src.url,
          officialResultSource: src,
          candidates: [
            { name: 'Cand LFI', party: 'LFI', officialNuance: 'UG', partySource: src, pollScore: 50, officialScore: 52 },
            { name: 'Cand UXD', party: 'UXD', officialNuance: 'UXD', partySource: src, pollScore: 50, officialScore: 48 },
          ],
        },
        {
          id: 'neighbor-ps-rn',
          constituencyCode: '0003',
          constituencyLabel: 'Circo PS – RN',
          institute: 'Institut',
          sponsor: 'Média',
          fieldwork: { start: '2024-07-02', end: '2024-07-03' },
          sampleSize: 600,
          url: src.url,
          officialResultSource: src,
          candidates: [
            { name: 'Cand PS', party: 'PS', officialNuance: 'UG', partySource: src, pollScore: 53, officialScore: 55 },
            { name: 'Cand RN', party: 'RN', officialNuance: 'RN', partySource: src, pollScore: 47, officialScore: 45 },
          ],
        },
      ],
    }
    const matchedLfiRn = matchingLegislativeDuelPolls(fixture, 'melenchon', 'lepen')
    expect(matchedLfiRn.map((m) => m.poll.id)).toEqual(['exact-lfi-rn'])
    expect(matchedLfiRn[0]!.gapA).toBeCloseTo(3, 6)
    // Place publique – RN ≠ PS – RN
    expect(matchingLegislativeDuelPolls(fixture, 'glucksmann', 'lepen')).toEqual([])
  })

  it('option facultative betweenRoundsBias : calcule dynamiquement les écarts 2022/2017 et décale uniquement les duels face au RN', () => {
    const summaries = betweenRoundsSummaries(liveSimulationData.secondRoundPollBias)
    const gapNone = betweenRoundsLastDayGap(liveSimulationData.secondRoundPollBias, 'none')
    const gapMean = betweenRoundsLastDayGap(liveSimulationData.secondRoundPollBias, 'mean')
    const gap2022 = betweenRoundsLastDayGap(liveSimulationData.secondRoundPollBias, '2022')
    const gap2017 = betweenRoundsLastDayGap(liveSimulationData.secondRoundPollBias, '2017')
    expect(gapNone).toBe(0)
    expect(gap2022).toBeCloseTo(summaries.find((s) => s.year === 2022)!.lastDayGap, 10)
    expect(gap2017).toBeCloseTo(summaries.find((s) => s.year === 2017)!.lastDayGap, 10)
    expect(gapMean).toBeCloseTo((gap2022 + gap2017) / 2, 10)
    expect(gap2022).toBeCloseTo(2.35, 4)
    expect(gap2017).toBeCloseTo(3.4333, 3)

    const electorate = { lepen: 40, melenchon: 20, ens: 20, eco: 10, lr: 5, rec: 5 }
    const profiles = effectiveProfiles(transfers, declaredTransfers, defaultSettings())
    const common = {
      electorate,
      profiles,
      nonRnPresidential: transfers.nonRnPresidential,
      fidelityA: { loyal: 94.75, cross: 1.75, abstention: 3.5 },
      fidelityB: { loyal: 94.75, cross: 1.75, abstention: 3.5 },
      candidatesById: byId,
      firstRoundTurnout: 74,
      blankNullShare: 0.025,
      abstainerMobilization: 0.225,
      abstainerAntiRnShare: null,
      republicanFrontStrength: 1,
      secondRoundPolls: [],
    }

    // Duel RN (a = RN, b = adversaire) : l'adversaire gagne +shiftPts, le RN perd -shiftPts
    const baseRnA = computeSecondRound({
      ...common,
      a: 'lepen',
      b: 'melenchon',
      duel: resolveDuel('lepen', 'melenchon', byId),
      betweenRoundsBiasMode: 'none',
      betweenRoundsShiftPts: 0,
    })
    const shiftedRnA = computeSecondRound({
      ...common,
      a: 'lepen',
      b: 'melenchon',
      duel: resolveDuel('lepen', 'melenchon', byId),
      betweenRoundsBiasMode: '2022',
      betweenRoundsShiftPts: gap2022,
    })
    expect(baseRnA.betweenRoundsBiasApplied).toBeNull()
    expect(shiftedRnA.betweenRoundsBiasApplied).toEqual({ mode: '2022', shiftPts: gap2022 })
    expect(shiftedRnA.pct.b - baseRnA.pct.b).toBeCloseTo(gap2022, 8)
    expect(shiftedRnA.pct.a - baseRnA.pct.a).toBeCloseTo(-gap2022, 8)
    expect(shiftedRnA.pct.a + shiftedRnA.pct.b).toBeCloseTo(100, 10)
    expect(shiftedRnA.totals.a + shiftedRnA.totals.b + shiftedRnA.totals.nonExpressed).toBeCloseTo(100, 10)

    // Ordre inversé (a = adversaire, b = RN) : a gagne +shiftPts
    const baseRnB = computeSecondRound({
      ...common,
      a: 'melenchon',
      b: 'lepen',
      duel: resolveDuel('melenchon', 'lepen', byId),
      betweenRoundsBiasMode: 'none',
      betweenRoundsShiftPts: 0,
    })
    const shiftedRnB = computeSecondRound({
      ...common,
      a: 'melenchon',
      b: 'lepen',
      duel: resolveDuel('melenchon', 'lepen', byId),
      betweenRoundsBiasMode: '2017',
      betweenRoundsShiftPts: gap2017,
    })
    expect(shiftedRnB.pct.a - baseRnB.pct.a).toBeCloseTo(gap2017, 8)
    expect(shiftedRnB.pct.b - baseRnB.pct.b).toBeCloseTo(-gap2017, 8)
    expect(shiftedRnB.betweenRoundsBiasApplied).toEqual({ mode: '2017', shiftPts: gap2017 })

    // Duel hors RN : aucun effet même si l'option est active
    const baseNonRn = computeSecondRound({
      ...common,
      a: 'melenchon',
      b: 'ens',
      duel: resolveDuel('melenchon', 'ens', byId),
      betweenRoundsBiasMode: 'none',
      betweenRoundsShiftPts: 0,
    })
    const shiftedNonRn = computeSecondRound({
      ...common,
      a: 'melenchon',
      b: 'ens',
      duel: resolveDuel('melenchon', 'ens', byId),
      betweenRoundsBiasMode: '2017',
      betweenRoundsShiftPts: gap2017,
    })
    expect(shiftedNonRn.pct).toEqual(baseNonRn.pct)
    expect(shiftedNonRn.betweenRoundsBiasApplied).toBeNull()

    // Intégration complète simulate() : décale score déterministe ET médiane Monte-Carlo sur duel RN
    const baseSim = simulate(
      liveSimulationData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: 'none' },
      { monteCarloIterations: 200 },
    )
    const sim2022 = simulate(
      liveSimulationData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: '2022' },
      { monteCarloIterations: 200 },
    )
    const sim2017 = simulate(
      liveSimulationData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: '2017' },
      { monteCarloIterations: 200 },
    )
    const simMean = simulate(
      liveSimulationData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: 'mean' },
      { monteCarloIterations: 200 },
    )
    expect(simMean.secondRound.pct.b - baseSim.secondRound.pct.b).toBeCloseTo(gapMean, 6)
    expect(sim2022.secondRound.pct.b - baseSim.secondRound.pct.b).toBeCloseTo(gap2022, 6)
    expect(sim2017.secondRound.pct.b - baseSim.secondRound.pct.b).toBeCloseTo(gap2017, 6)
    const mcBase = baseSim.monteCarlo.displayedDuel
    const mcMean = simMean.monteCarlo.displayedDuel
    const mc2022 = sim2022.monteCarlo.displayedDuel
    const mc2017 = sim2017.monteCarlo.displayedDuel
    expect(mcBase.aScoreMedian - mcMean.aScoreMedian).toBeCloseTo(gapMean, 4)
    expect(mcBase.aScoreMedian - mc2022.aScoreMedian).toBeCloseTo(gap2022, 4)
    expect(mcBase.aScoreMedian - mc2017.aScoreMedian).toBeCloseTo(gap2017, 4)
    expect(mc2017.aWinProb).toBeLessThanOrEqual(mc2022.aWinProb)
    expect(mc2022.aWinProb).toBeLessThanOrEqual(mcBase.aWinProb)
  })
})
