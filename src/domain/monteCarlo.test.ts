import { simulationData } from '../data/schema'
import { mulberry32, runMonteCarlo } from './monteCarlo'
import { newVoterRates } from './newVoters'
import { defaultSettings, simulate } from './simulate'
import { minorTransferParts } from './transfers'

describe('monteCarlo', () => {
  const settings = defaultSettings()
  const baseSim = simulate(simulationData, settings)
  const candidatesById = new Map(simulationData.polls.candidates.map((c) => [c.id, c]))
  const baseScores = Object.fromEntries(baseSim.firstRound.map((r) => [r.candidateId, r.score]))
  const minorTransfers = minorTransferParts(simulationData.polls.candidates, settings.minorTransfers)
  const { bnShare } = newVoterRates(simulationData)

  it('PRNG mulberry32 est strictement déterministe dans [0, 1)', () => {
    const r1 = mulberry32(2027)
    const r2 = mulberry32(2027)
    const seq1 = Array.from({ length: 20 }, () => r1())
    const seq2 = Array.from({ length: 20 }, () => r2())
    expect(seq1).toEqual(seq2)
    for (const v of seq1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('est strictement reproductible à graine identique', () => {
    const a = runMonteCarlo({
      data: simulationData,
      settings,
      baseScores,
      candidatesById,
      minorTransfers,
      blankNullShare: bnShare,
      displayedDuel: [baseSim.secondRound.a, baseSim.secondRound.b],
      iterations: 400,
      seed: 2027,
    })
    const b = runMonteCarlo({
      data: simulationData,
      settings,
      baseScores,
      candidatesById,
      minorTransfers,
      blankNullShare: bnShare,
      displayedDuel: [baseSim.secondRound.a, baseSim.secondRound.b],
      iterations: 400,
      seed: 2027,
    })
    expect(a).toEqual(b)
  })

  it('respecte les invariants de probabilités et de quantiles', () => {
    const mc = baseSim.monteCarlo
    const cands = Object.values(mc.candidates)
    // Somme des probabilités de qualification = 200 % (2 qualifiés par tirage), victoire = 100 %.
    expect(cands.reduce((s, c) => s + c.qualifProb, 0)).toBeCloseTo(200, 6)
    expect(cands.reduce((s, c) => s + c.winProb, 0)).toBeCloseTo(100, 6)
    for (const c of cands) {
      expect(c.p10).toBeLessThanOrEqual(c.median)
      expect(c.median).toBeLessThanOrEqual(c.p90)
      expect(c.winProb).toBeLessThanOrEqual(c.qualifProb + 1e-9)
    }
    expect(mc.displayedDuel.aScoreP10).toBeLessThan(mc.displayedDuel.aScoreMedian)
    expect(mc.displayedDuel.aScoreMedian).toBeLessThan(mc.displayedDuel.aScoreP90)
    // Un très petit candidat (< 1 %) ne doit jamais obtenir une victoire aberrante.
    expect(mc.candidates.arthaud!.winProb).toBeLessThan(0.5)
  })

  it('la variance du 1er tour décroît lorsque l’on approche de la date du scrutin', () => {
    const closeData = {
      ...simulationData,
      polls: { ...simulationData.polls, asOf: '2027-04-12' },
    }
    const far = baseSim.monteCarlo
    const near = runMonteCarlo({
      data: closeData,
      settings,
      baseScores,
      candidatesById,
      minorTransfers,
      blankNullShare: bnShare,
      displayedDuel: [baseSim.secondRound.a, baseSim.secondRound.b],
      iterations: 600,
    })
    expect(near.sigmaLogit).toBeLessThan(far.sigmaLogit)
    const widthFar = far.candidates.lepen!.p90 - far.candidates.lepen!.p10
    const widthNear = near.candidates.lepen!.p90 - near.candidates.lepen!.p10
    expect(widthNear).toBeLessThan(widthFar)
  })

  it('front « incertain » : flux inchangé hors mode, tirage uniforme commun sinon, 0,5 en déterministe', () => {
    const run = (front: typeof settings.republicanFront) =>
      runMonteCarlo({
        data: simulationData,
        settings: { ...settings, republicanFront: front },
        baseScores,
        candidatesById,
        minorTransfers,
        blankNullShare: bnShare,
        displayedDuel: [baseSim.secondRound.a, baseSim.secondRound.b],
        iterations: 300,
        seed: 2027,
      })
    const plain = run({ gauche: 1, centre: 1, droite: 1 })
    const plainFalse = run({ gauche: 1, centre: 1, droite: 1, uncertain: false })
    expect(plainFalse).toEqual(plain)
    const unc = run({ gauche: 0.5, centre: 0.5, droite: 0.5, uncertain: true })
    expect(unc.displayedDuel.aScoreP90 - unc.displayedDuel.aScoreP10).toBeGreaterThan(0)
    const det = simulate(simulationData, {
      ...settings,
      republicanFront: { gauche: 0.5, centre: 0.5, droite: 0.5, uncertain: true },
    })
    const mid = simulate(simulationData, { ...settings, republicanFront: { gauche: 0.5, centre: 0.5, droite: 0.5 } })
    expect(det.secondRound.pct.a).toBeCloseTo(mid.secondRound.pct.a, 10)
  })
})
