import { frozenData } from '../test/frozenData'
import { newVoterRates } from './newVoters'
import type { NewVoterData } from './newVoters'
import { defaultSettings, simulate } from './simulate'

const rates = newVoterRates(frozenData)

describe('taux de référence des nouveaux votants', () => {
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

  it('invariants comptables du moteur unifié en flux bruts (% des inscrits)', () => {
    const sr = simulate(frozenData, defaultSettings()).secondRound
    const left = sr.flows.reduce((t, f) => t + f.share, 0) + sr.abstainers.volume + sr.blankNull.volume
    const right = sr.totals.a + sr.totals.b + sr.totals.nonExpressed + sr.blankNull.volume
    expect(left).toBeCloseTo(100, 9)
    expect(right).toBeCloseTo(100, 9)
    for (const f of sr.flows) expect(f.toA + f.toB + f.abstention).toBeCloseTo(f.share, 9)
    expect(sr.abstainers.toA + sr.abstainers.toB + sr.abstainers.nonExpressed).toBeCloseTo(sr.abstainers.volume, 9)
  })
})
