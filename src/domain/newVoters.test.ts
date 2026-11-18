import { frozenData } from '../test/frozenData'
import { firstRoundParticipation, grossFlows, newVoterRates } from './newVoters'
import type { NewVoterData } from './newVoters'
import { defaultSettings, simulate } from './simulate'
import type { Settings, SecondRoundResult } from './types'

const run = (overrides: Partial<Settings> = {}) => simulate(frozenData, { ...defaultSettings(), ...overrides })
const rates = newVoterRates(frozenData)

/** Tous les flux, en % des inscrits : électorats, abstentionnistes et blancs ou nuls du 1er tour. */
const totalLeft = (g: ReturnType<typeof grossFlows>) =>
  g.flows.reduce((t, f) => t + f.share, 0) + g.abstainers.volume + g.blankNull.volume
const totalRight = (g: ReturnType<typeof grossFlows>) => g.totals.a + g.totals.b + g.totals.nonExpressed + g.blankNull.volume

/** Vérifie les propriétés qui valent pour tout résultat : score inchangé, exprimés inchangés, total de 100 %. */
function expectInvariants(sr: SecondRoundResult, participation: number) {
  const before = structuredClone(sr)
  const g = grossFlows(sr, participation, rates)
  expect(sr).toEqual(before)
  // Voix des finalistes en % des inscrits : celles du résultat × k, donc score et exprimés inchangés.
  expect(g.totals.a).toBeCloseTo(sr.votes.a * g.scale, 9)
  expect(g.totals.b).toBeCloseTo(sr.votes.b * g.scale, 9)
  expect((100 * g.totals.a) / (g.totals.a + g.totals.b)).toBeCloseTo(sr.pct.a, 9)
  expect((100 * g.totals.b) / (g.totals.a + g.totals.b)).toBeCloseTo(sr.pct.b, 9)
  expect(g.totals.a + g.totals.b).toBeCloseTo(g.expressed2, 9)
  // Chaque côté totalise 100 % des inscrits.
  expect(Math.abs(totalLeft(g) - 100)).toBeLessThan(1e-9)
  expect(Math.abs(totalRight(g) - 100)).toBeLessThan(1e-9)
  // Chaque électorat se conserve.
  for (const f of g.flows) expect(Math.abs(f.toA + f.toB + f.abstention - f.share)).toBeLessThan(1e-9)
  expect(Math.abs(g.abstainers.toA + g.abstainers.toB + g.abstainers.nonExpressed - g.abstainers.volume)).toBeLessThan(1e-9)
  return g
}

describe('taux des nouveaux votants', () => {
  it('rAbs et bnShare sont recalculés à partir des données (Ifop et résultats officiels de 2022)', () => {
    expect(rates.rAbs).toBeCloseTo(0.1396, 4)
    expect(rates.bnShare).toBeCloseTo(0.022, 4)
    expect(rates.abstainers2022).toBe(48747876 - 35923707)
    expect(rates.finalistVotesFromAbstainers).toBeCloseTo(0.06 * 18768639 + 0.05 * 13288686, 6)
    expect(rates.turnout2022).toBeCloseTo(73.69, 2)
  })

  it('la fourchette tient à l’arrondi de l’Ifop (± 0,5 point sur chaque part)', () => {
    expect(rates.rAbsRange.min).toBeCloseTo(0.127, 3)
    expect(rates.rAbsRange.max).toBeCloseTo(0.152, 3)
    expect(rates.rAbsRange.min).toBeLessThan(rates.rAbs)
    expect(rates.rAbsRange.max).toBeGreaterThan(rates.rAbs)
  })

  it('contrôle Insee : part des abstentionnistes du 1er tour qui votent au 2nd', () => {
    const byYear = new Map(rates.insee.map((y) => [y.year, y]))
    expect(byYear.get(2017)!.share).toBeCloseTo(24.6, 1)
    expect(byYear.get(2022)!.share).toBeCloseTo(25.3, 1)
  })

  it('suit les données : des parts Ifop doublées doublent rAbs', () => {
    const doubled: NewVoterData = {
      ...frozenData,
      secondRoundDropout: {
        ...frozenData.secondRoundDropout,
        newVoters: {
          ...frozenData.secondRoundDropout.newVoters,
          ifop2022: {
            ...frozenData.secondRoundDropout.newVoters.ifop2022,
            abstainedFirstRound: frozenData.secondRoundDropout.newVoters.ifop2022.abstainedFirstRound.map((s) => ({
              ...s,
              share: 2 * s.share,
            })),
          },
        },
      },
    }
    expect(newVoterRates(doubled).rAbs).toBeCloseTo(2 * rates.rAbs, 12)
  })
})

describe('participation du 1er tour', () => {
  it('repli sur la participation officielle de 2022 sans bilan de participation', () => {
    expect(firstRoundParticipation(null, rates)).toBeCloseTo(100 * (35923707 / 48747876), 9)
    expect(firstRoundParticipation({ expected: 80.1 }, rates)).toBe(80.1)
  })

  it('le scénario par défaut utilise la participation attendue du bilan', () => {
    const res = run()
    expect(res.turnoutBalance).not.toBeNull()
    expect(firstRoundParticipation(res.turnoutBalance, rates)).toBe(res.turnoutBalance!.expected)
  })
})

describe('flux bruts en % des inscrits', () => {
  it('scénario par défaut : score et exprimés inchangés, flux de total 100 %', () => {
    const res = run()
    const g = expectInvariants(res.secondRound, firstRoundParticipation(res.turnoutBalance, rates))
    expect(g.abstention1).toBeCloseTo(100 - g.participation, 12)
    expect(g.blankNull1).toBeCloseTo(g.participation * rates.bnShare, 12)
    expect(g.newVoters).toBeCloseTo(rates.rAbs * g.abstention1, 12)
    expect(g.addedDeparture).toBeCloseTo(g.newVoters / g.expressed2, 12)
    expect(g.abstainers.nonExpressed).toBeCloseTo(g.abstention1 - g.newVoters, 12)
  })

  it('calage d’abandon désactivé', () => {
    const res = run({ abstentionCalibration: false })
    expectInvariants(res.secondRound, firstRoundParticipation(res.turnoutBalance, rates))
  })

  it('total d’abandon imposé', () => {
    for (const abstentionTarget of [5, 12]) {
      const res = run({ abstentionTarget })
      expectInvariants(res.secondRound, firstRoundParticipation(res.turnoutBalance, rates))
    }
  })

  it('autre duel (Le Pen – Philippe)', () => {
    const res = run({ correctionsEnabled: true, blogBiasEnabled: false, turnoutEnabled: false, correctionOverrides: { melenchon: -3 } })
    expect([res.secondRound.a, res.secondRound.b]).toEqual(['lepen', 'philippe'])
    expectInvariants(res.secondRound, firstRoundParticipation(res.turnoutBalance, rates))
  })

  it('participation de repli (bilan de participation nul)', () => {
    const res = run()
    const g = expectInvariants(res.secondRound, firstRoundParticipation(null, rates))
    expect(g.participation).toBeCloseTo(rates.turnout2022, 12)
  })

  it('les nouveaux votants se répartissent comme l’ensemble des votants', () => {
    const res = run()
    const g = grossFlows(res.secondRound, firstRoundParticipation(res.turnoutBalance, rates), rates)
    expect((100 * g.abstainers.toA) / (g.abstainers.toA + g.abstainers.toB)).toBeCloseTo(res.secondRound.pct.a, 9)
    expect((100 * g.abstainers.toB) / (g.abstainers.toA + g.abstainers.toB)).toBeCloseTo(res.secondRound.pct.b, 9)
  })

  it('un électorat perd le même taux u de ses voix pour un finaliste, son abandon augmente d’autant', () => {
    const res = run()
    const sr = res.secondRound
    const g = grossFlows(sr, firstRoundParticipation(res.turnoutBalance, rates), rates)
    for (const [i, f] of g.flows.entries()) {
      const raw = sr.flows[i]!
      expect(f.toA).toBeCloseTo(raw.toA * g.scale * (1 - g.addedDeparture), 12)
      expect(f.abstention - raw.abstention * g.scale).toBeCloseTo((raw.toA + raw.toB) * g.scale * g.addedDeparture, 12)
    }
  })

  it('données synthétiques : valeurs calculées à la main', () => {
    // 40 points pour A, 40 pour B, 20 d'abandon ; P = 80 % ; blancs et nuls = 5 % des votants.
    const sr = {
      votes: { a: 40, b: 40, abstention: 20 },
      pct: { a: 50, b: 50 },
      flows: [
        { candidateId: 'a', share: 50, toA: 40, toB: 0, abstention: 10, bloc: null, isFinalistVoter: true },
        { candidateId: 'b', share: 50, toA: 0, toB: 40, abstention: 10, bloc: null, isFinalistVoter: true },
      ],
    } as unknown as SecondRoundResult
    const g = grossFlows(sr, 80, { ...rates, rAbs: 0.2, bnShare: 0.05 })
    expect(g.abstention1).toBeCloseTo(20, 12)
    expect(g.blankNull1).toBeCloseTo(4, 12)
    expect(g.scale).toBeCloseTo(0.76, 12)
    expect(g.expressed2).toBeCloseTo(60.8, 12)
    expect(g.newVoters).toBeCloseTo(4, 12)
    expect(g.addedDeparture).toBeCloseTo(4 / 60.8, 12)
    expect(g.abstainers.toA).toBeCloseTo(2, 12)
    expect(g.abstainers.nonExpressed).toBeCloseTo(16, 12)
    expect(g.totals.a).toBeCloseTo(30.4, 12)
    expect(g.totals.nonExpressed).toBeCloseTo(100 - 4 - 60.8, 12)
  })
})
