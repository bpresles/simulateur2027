import { frozenData as simulationData } from '../test/frozenData'
import { secondRoundDropout2022 } from './secondRound'
import { defaultSettings, simulate } from './simulate'

const run = (overrides: Partial<ReturnType<typeof defaultSettings>> = {}) =>
  simulate(simulationData, { ...defaultSettings(), ...overrides })

describe('simulate (données réelles)', () => {
  it('par défaut : hypothèse « Philippe seul », Le Pen et Mélenchon qualifiés', () => {
    const res = run()
    expect(res.hypothesisSet.id).toBe('philippe-seul')
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'melenchon'])
    expect(res.secondRound.duel.kind).toBe('sourced')
    expect(res.secondRound.pct.a + res.secondRound.pct.b).toBeCloseTo(100, 8)
  })

  it('par défaut : blancs, nuls et abstention calés sur le 2nd tour 2022', () => {
    const res = run()
    expect(res.secondRound.abstention.target).toBeCloseTo(secondRoundDropout2022(simulationData.reference2022), 10)
    expect(res.secondRound.votes.abstention).toBeCloseTo(res.secondRound.abstention.target!, 8)
    expect(res.secondRound.pct.b).toBeCloseTo(48, 0)
  })

  it('mode « dernier sondage » : base du sondage le plus récent, sans alerte de moyenne fragile', () => {
    const res = run({ pollMode: 'latest' })
    expect(res.pollMode).toBe('latest')
    expect(res.institutesUsed).toBe(1)
    expect(res.pollUsage.find((u) => u.status === 'used')!.poll.id).toBe('elabe-20261016')
    expect(res.firstRound.find((r) => r.candidateId === 'lepen')!.base).toBeCloseTo(33.59, 2)
    expect(res.warnings.some((w) => w.includes('moyenne fragile'))).toBe(false)
  })

  it('le calage peut être désactivé (taux bruts des législatives 2024)', () => {
    const res = run({ abstentionCalibration: false })
    expect(res.secondRound.abstention.target).toBeNull()
    expect(res.secondRound.votes.abstention).toBeCloseTo(res.secondRound.abstention.uncalibrated, 8)
  })

  it('chaque étape du 1er tour totalise 100', () => {
    const res = run({ alliances: { 'tondelier-melenchon': true, 'roussel-glucksmann': true } })
    expect(res.firstRound.reduce((s, r) => s + r.corrected, 0)).toBeCloseTo(100, 8)
    expect(res.entrants.reduce((s, e) => s + e.score, 0)).toBeCloseTo(100, 8)
  })

  it('les finalistes dépendent des corrections (Philippe qualifié si on corrige Mélenchon à la baisse)', () => {
    const res = run({ correctionOverrides: { melenchon: -3 } })
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound.duel.profileWeights).toEqual([{ profileId: 'ensemble_rn', weight: 1 }])
  })

  it('qualification serrée : les deux seconds tours possibles sont simulés, le choix bascule l’affichage', () => {
    const res = run({ correctionsEnabled: false })
    expect(res.qualification.tight).toBe(true)
    expect(res.qualification.gap).toBeLessThan(1)
    expect([res.qualification.withSecond.a, res.qualification.withSecond.b]).toEqual(['lepen', 'melenchon'])
    expect([res.qualification.withThird!.a, res.qualification.withThird!.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound).toBe(res.qualification.withSecond)

    const third = run({ correctionsEnabled: false, qualificationPick: 'third' })
    expect(third.qualification.picked).toBe('third')
    expect([third.secondRound.a, third.secondRound.b]).toEqual(['lepen', 'philippe'])
  })

  it('qualification nette : un seul second tour, le choix « 3e » est ignoré', () => {
    const res = run({ qualificationPick: 'third' })
    expect(res.qualification.tight).toBe(false)
    expect(res.qualification.withThird).toBeNull()
    expect(res.qualification.picked).toBe('second')
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'melenchon'])
  })

  it('alliance Tondelier → Mélenchon : profil pondéré LFI / écologiste', () => {
    const res = run({ alliances: { 'tondelier-melenchon': true } })
    const ids = res.secondRound.duel.profileWeights.map((w) => w.profileId)
    expect(ids).toEqual(['lfi_rn', 'ecolo_ps_pcf_rn'])
    expect(res.secondRound.duel.profileWeights[0]!.weight).toBeGreaterThan(0.8)
  })

  it('Tondelier et Roussel rejoignent Mélenchon ensemble ; Roussel ne rejoint alors pas Glucksmann', () => {
    const res = run({
      alliances: { 'tondelier-melenchon': true, 'roussel-melenchon': true, 'roussel-glucksmann': true },
    })
    const melenchon = res.entrants.find((e) => e.id === 'melenchon')!
    expect(melenchon.members.map((m) => m.candidateId)).toEqual(['melenchon', 'tondelier', 'roussel'])
    expect(res.entrants.find((e) => e.id === 'glucksmann')!.members).toHaveLength(1)
  })

  it('report d’alliance par défaut : taux constatés en 2024 (Tondelier → Mélenchon : 72 % suivent, 3 % RN)', () => {
    const res = run({ alliances: { 'tondelier-melenchon': true } })
    const tondelier = res.entrants.find((e) => e.id === 'melenchon')!.members[1]!
    expect(tondelier.rate).toBeCloseTo(0.72, 10)
    expect(res.allianceLeaks).toEqual([{ from: 'tondelier', to: 'lepen', points: expect.any(Number) }])
    const rate = res.allianceRates.find((r) => r.allianceId === 'tondelier-melenchon')!
    expect(rate.joining[0]).toMatchObject({ leader: 0.72, rn: 0.03, source: { profileId: 'lfi_rn', bloc: 'gauche' } })
  })

  it('une part modifiée remplace le taux 2024 ; le reste garde la répartition RN / abstention de 2024', () => {
    const res = run({ alliances: { 'tondelier-melenchon': true }, allianceOverrides: { 'tondelier-melenchon': 0.9 } })
    const rate = res.allianceRates.find((r) => r.allianceId === 'tondelier-melenchon')!.joining[0]!
    expect(rate).toMatchObject({ leader: 0.9, isOverride: true, default2024: { leader: 0.72, rn: 0.03 } })
    expect(rate.rn).toBeCloseTo((0.1 * 3) / 28, 10)
    expect(res.entrants.find((e) => e.id === 'melenchon')!.members[1]!.rate).toBe(0.9)
    const full = run({ alliances: { 'tondelier-melenchon': true }, allianceOverrides: { 'tondelier-melenchon': 1 } })
    expect(full.allianceLeaks).toEqual([])
  })

  it('Glucksmann rejoint Philippe : 72 % des électeurs de gauche suivent (taux NFP → Ensemble, 2024)', () => {
    const res = run({ alliances: { 'glucksmann-philippe': true } })
    const philippe = res.entrants.find((e) => e.id === 'philippe')!
    expect(philippe.members.map((m) => m.candidateId)).toEqual(['philippe', 'glucksmann'])
    expect(philippe.members[1]!.rate).toBeCloseTo(0.72, 10)
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expect(res.secondRound.duel.profileWeights.map((w) => w.profileId)).toEqual(['ensemble_rn', 'ecolo_ps_pcf_rn'])
  })

  it('Philippe et Roussel rejoignent Glucksmann ensemble : 54 % des électeurs de Philippe suivent, 15 % votent RN', () => {
    const res = run({ alliances: { 'roussel-glucksmann': true, 'philippe-glucksmann': true } })
    const glucksmann = res.entrants.find((e) => e.id === 'glucksmann')!
    expect(glucksmann.members.map((m) => m.candidateId)).toEqual(['glucksmann', 'roussel', 'philippe'])
    const philippe = glucksmann.members.find((m) => m.candidateId === 'philippe')!
    expect(philippe.rate).toBeCloseTo(0.54, 10)
    expect(res.allianceLeaks.find((l) => l.from === 'philippe')).toBeDefined()
    expect(res.entrants.reduce((s, e) => s + e.score, 0)).toBeCloseTo(100, 8)
  })

  it('Glucksmann rejoint Mélenchon : 72 % des électeurs de gauche suivent, 3 % votent RN (2024)', () => {
    const res = run({ alliances: { 'glucksmann-melenchon': true } })
    const melenchon = res.entrants.find((e) => e.id === 'melenchon')!
    expect(melenchon.members.map((m) => m.candidateId)).toEqual(['melenchon', 'glucksmann'])
    expect(res.entrants.find((e) => e.id === 'glucksmann')).toBeUndefined()
    const rate = res.allianceRates.find((r) => r.allianceId === 'glucksmann-melenchon')!
    expect(rate.joining[0]).toMatchObject({ leader: 0.72, rn: 0.03, source: { profileId: 'lfi_rn', bloc: 'gauche' } })
  })

  it('Attal rejoint Philippe : la base passe de « Philippe + Attal » à l’hypothèse « Philippe seul »', () => {
    const data = {
      ...simulationData,
      polls: {
        ...simulationData.polls,
        hypothesisSets: simulationData.polls.hypothesisSets.map((s) => ({ ...s, default: s.id === 'philippe-attal' })),
      },
    }
    const base = simulate(data, defaultSettings())
    expect(base.hypothesisSet.id).toBe('philippe-attal')
    expect(base.hypothesisAllianceId).toBeNull()
    expect(base.firstRound.some((r) => r.candidateId === 'attal')).toBe(true)
    expect(base.allianceRates.some((r) => r.allianceId === 'attal-philippe')).toBe(false)

    const allied = simulate(data, { ...defaultSettings(), alliances: { 'attal-philippe': true } })
    expect(allied.hypothesisSet.id).toBe('philippe-seul')
    expect(allied.hypothesisAllianceId).toBe('attal-philippe')
    expect(allied.firstRound.some((r) => r.candidateId === 'attal')).toBe(false)
    expect(allied.allianceLeaks).toEqual([])
    const philippeSeul = run()
    expect(philippeSeul.hypothesisSet.id).toBe('philippe-seul')
    expect(allied.secondRound.pct).toEqual(philippeSeul.secondRound.pct)

    const withGlucksmann = simulate(data, {
      ...defaultSettings(),
      alliances: { 'attal-philippe': true, 'philippe-glucksmann': true },
    })
    expect(withGlucksmann.hypothesisSet.id).toBe('philippe-seul')
    expect(withGlucksmann.entrants.find((e) => e.id === 'glucksmann')!.allianceIds).toEqual(['philippe-glucksmann'])
  })

  it('Retailleau rejoint Philippe :53 % des électeurs de droite suivent, 22,5 % votent RN (taux LR → Ensemble, 2024)', () => {
    const res = run({ alliances: { 'retailleau-philippe': true } })
    const philippe = res.entrants.find((e) => e.id === 'philippe')!
    expect(philippe.members.map((m) => m.candidateId)).toEqual(['philippe', 'retailleau'])
    const rate = res.allianceRates.find((r) => r.allianceId === 'retailleau-philippe')!
    expect(rate.joining[0]).toMatchObject({ leader: 0.53, rn: 0.225, source: { profileId: 'ensemble_rn', bloc: 'droite' } })
    expect(res.allianceLeaks).toEqual([{ from: 'retailleau', to: 'lepen', points: expect.any(Number) }])
  })

  it('une alliance entre candidats éliminés ne change pas le 2nd tour quand les finalistes sont les mêmes', () => {
    const finalists = (r: ReturnType<typeof run>) => [r.secondRound.a, r.secondRound.b].join('-')
    let checked = 0
    for (const progressionEnabled of [false, true]) {
      const without = run({ progressionEnabled })
      for (const id of ['philippe-glucksmann', 'glucksmann-philippe', 'roussel-glucksmann']) {
        const withAlliance = run({ progressionEnabled, alliances: { [id]: true } })
        if (finalists(withAlliance) !== finalists(without)) continue // l'alliance change les qualifiés
        expect(withAlliance.secondRound.pct.a).toBeCloseTo(without.secondRound.pct.a, 10)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4)
    // Cas signalé : progression + correction, Philippe et Glucksmann alliés, Le Pen contre Mélenchon.
    const reported = run({ progressionEnabled: true, alliances: { 'philippe-glucksmann': true } })
    expect(finalists(reported)).toBe('lepen-melenchon')
    expect(reported.secondRound.pct.b).toBeCloseTo(run({ progressionEnabled: true }).secondRound.pct.b, 10)
  })

  it('rallier un finaliste renforce le report de ses électeurs au 2nd tour (72 % → 90 %)', () => {
    const rate = (r: ReturnType<typeof run>, id: string) => {
      const f = r.secondRound.flows.find((x) => x.candidateId === id)!
      return f.toB / f.share
    }
    // Taux bruts, sans calage de l'abstention, pour comparer aux chiffres de 2024.
    const without = run({ abstentionCalibration: false })
    const withAlliances = run({
      abstentionCalibration: false,
      alliances: { 'tondelier-melenchon': true, 'roussel-melenchon': true },
    })
    expect(rate(without, 'tondelier')).toBeCloseTo(0.72, 10)
    // 72 % suivent Mélenchon dès le 1er tour ; les 25 % d'abstentionnistes se reportent à 72 %.
    expect(rate(withAlliances, 'tondelier')).toBeCloseTo(0.72 + 0.25 * 0.72, 10)
    expect(rate(withAlliances, 'roussel')).toBeCloseTo(0.72 + 0.25 * 0.72, 10)
    expect(run({ alliances: { 'tondelier-melenchon': true, 'roussel-melenchon': true } }).secondRound.pct.b).toBeGreaterThan(
      run().secondRound.pct.b,
    )
  })

  it('duel sans RN : modèle de repli et avertissement', () => {
    const res = run({ correctionOverrides: { lepen: -30 } })
    expect(res.secondRound.duel.kind).toBe('fallback')
    expect(res.warnings.some((w) => w.startsWith('Duel hors source'))).toBe(true)
  })

  it('associe les sondages directs de 2nd tour au duel simulé', () => {
    const res = run()
    expect(res.secondRound.directPolls.length).toBeGreaterThan(0)
    expect(res.secondRound.directPolls.every((p) => 'melenchon' in p.scores && 'lepen' in p.scores)).toBe(true)
  })
})
