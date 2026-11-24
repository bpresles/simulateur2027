import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import {
  applyIfopParticipationR17,
  computePartialReproduction,
  reproduceReferenceElection,
  resolveReferenceRows,
} from './secondRoundReproduction'
import type { PartialReproductionElectionInput } from './secondRoundReproduction'
import type { ReferenceMatrixRow, ReferenceMatrixSurvey } from './types'

describe('reproduction partielle du 2nd tour (P1, étape 1)', () => {
  const syntheticSurveys: ReferenceMatrixSurvey[] = [
    {
      id: 'ipsos_test',
      year: 2022,
      institute: 'Ipsos Sopra Steria',
      fieldwork: { start: '2022-04-21', end: '2022-04-23' },
      timing: 'before',
      sampleSize: 1000,
      mode: 'En ligne',
      weighting: null,
      url: 'https://example.com/ipsos',
      pdfPage: 1,
      printedPage: 1,
    },
    {
      id: 'ifop_test',
      year: 2022,
      institute: 'Ifop-Fiducial',
      fieldwork: { start: '2022-04-24', end: '2022-04-24' },
      timing: 'electionDay',
      sampleSize: 1000,
      mode: 'En ligne',
      weighting: null,
      url: 'https://example.com/ifop',
      pdfPage: 1,
      printedPage: 1,
    },
  ]

  // Fixture à 3 candidats fictifs :
  // Inscrits T1 = 1 000, exprimés T1 = 750 (A = 300, B = 250, C = 200 ; C non couvert), non-exprimés T1 = 250.
  // Population résiduelle = 200 (C) + 250 (non-exprimés T1) = 450.
  // R1.1 : A → moyenne(90/5/5, 80/10/10) = 85/7,5/7,5 → (255 ; 22,5 ; 22,5)
  //        B → seul Ifop 10/80/10 → (25 ; 200 ; 25)
  // Contributions couvertes : A_final = 280, B_final = 222,5, Non-exprimé = 47,5 (total 550).
  const syntheticRows: ReferenceMatrixRow[] = [
    {
      candidateId: 'candA',
      bySurvey: {
        ipsos_test: { antiRn: 90, rn: 5, nonExpressed: 5 },
        ifop_test: { antiRn: 80, rn: 10, nonExpressed: 10 },
      },
    },
    {
      candidateId: 'candB',
      bySurvey: {
        ipsos_test: null,
        ifop_test: { antiRn: 10, rn: 80, nonExpressed: 10 },
      },
    },
  ]

  const baseElection: PartialReproductionElectionInput = {
    label: 'Fixture 3 candidats',
    registered1: 1000,
    voters1: 780,
    expressed1: 750,
    firstRoundCandidates: [
      { id: 'candA', votes: 300 },
      { id: 'candB', votes: 250 },
      { id: 'candC', votes: 200 },
    ],
    registered2: 1000,
    voters2: 720,
    expressed2: 700,
    antiRnId: 'candA',
    rnId: 'candB',
    antiRnVotes2: 400,
    rnVotes2: 300,
  }

  it('reproduit à la main une fixture de trois candidats fictifs avec un résidu réalisable', () => {
    const resolved = resolveReferenceRows(syntheticRows, syntheticSurveys, 'r1_1')
    const res = computePartialReproduction(baseElection, resolved, 'r1_1')

    expect(res.coveredFirstRoundVotes).toBe(550)
    expect(res.uncoveredCandidatesVotes).toBe(200)
    expect(res.firstRoundNonExpressedVotes).toBe(250)
    expect(res.residualPopulation).toBe(450)

    expect(res.coveredTotals.antiRn).toBeCloseTo(280, 9)
    expect(res.coveredTotals.rn).toBeCloseTo(222.5, 9)
    expect(res.coveredTotals.nonExpressed).toBeCloseTo(47.5, 9)

    // Officiel T2 : 400 / 300 / 300 → résidu attendu : 120 / 77,5 / 252,5 (somme 450).
    expect(res.residual.antiRn).toBeCloseTo(120, 9)
    expect(res.residual.rn).toBeCloseTo(77.5, 9)
    expect(res.residual.nonExpressed).toBeCloseTo(252.5, 9)
    expect(res.residual.antiRn + res.residual.rn + res.residual.nonExpressed).toBeCloseTo(450, 9)
    expect(res.residualExpressedSharePct).toBeCloseTo((100 * 197.5) / 450, 9)
    expect(res.feasibility.strictlyFeasible).toBe(true)
    expect(res.feasibility.feasible).toBe(true)
    expect(res.feasibility.violations).toEqual([])
  })

  it('détecte un résidu non réalisable lorsqu’une colonne sort de [0 ; population résiduelle] au-delà de l’écart d’inscrits', () => {
    const impossibleElection: PartialReproductionElectionInput = {
      ...baseElection,
      expressed2: 470,
      antiRnVotes2: 260, // inférieur aux 280 voix déjà attribuées → résidu = −20
      rnVotes2: 210, // inférieur aux 222,5 voix déjà attribuées → résidu = −12,5 ; non-exprimé = 482,5 > 450
    }
    const resolved = resolveReferenceRows(syntheticRows, syntheticSurveys, 'r1_1')
    const res = computePartialReproduction(impossibleElection, resolved, 'r1_1')

    expect(res.residual.antiRn).toBeCloseTo(-20, 9)
    expect(res.residual.rn).toBeCloseTo(-12.5, 9)
    expect(res.residual.nonExpressed).toBeCloseTo(482.5, 9)
    expect(res.feasibility.strictlyFeasible).toBe(false)
    expect(res.feasibility.feasible).toBe(false)
    expect(res.feasibility.violations).toHaveLength(3)
  })

  it('signale les replis mono-institut (R1.6) et applique exactement la remise à l’échelle R1.7', () => {
    const ipsosOnly = resolveReferenceRows(syntheticRows, syntheticSurveys, 'ipsos_only')
    expect(ipsosOnly.find((r) => r.candidateId === 'candA')?.usedFallback).toBe(false)
    expect(ipsosOnly.find((r) => r.candidateId === 'candB')?.usedFallback).toBe(true)
    expect(ipsosOnly.find((r) => r.candidateId === 'candB')?.sourcesUsed).toEqual(['ifop_test'])

    // R1.7 : non-exprimé Ifop 10 → 28 ; exprimé passe de 90 (80/10) à 72 (64/8).
    const adjusted = applyIfopParticipationR17({ antiRn: 80, rn: 10, nonExpressed: 10 }, 28)
    expect(adjusted.antiRn).toBeCloseTo(64, 9)
    expect(adjusted.rn).toBeCloseTo(8, 9)
    expect(adjusted.nonExpressed).toBe(28)
    expect(adjusted.antiRn + adjusted.rn + adjusted.nonExpressed).toBeCloseTo(100, 9)

    const r17 = resolveReferenceRows(syntheticRows, syntheticSurveys, 'r1_7_ifop_only', { candA: 28 })
    expect(r17.find((r) => r.candidateId === 'candA')?.appliedR17).toBe(true)
    expect(r17.find((r) => r.candidateId === 'candA')?.row.nonExpressed).toBe(28)
    expect(r17.find((r) => r.candidateId === 'candB')?.appliedR17).toBe(false)
  })

  it('conserve l’identité comptable exacte sur 2017 et 2022', () => {
    for (const [year, ref] of [
      ['2017', simulationData.reference2017],
      ['2022', simulationData.reference2022],
    ] as const) {
      const res = reproduceReferenceElection(year, ref, secondRoundReferenceMatrices, 'r1_1')
      const sumResidual = res.residual.antiRn + res.residual.rn + res.residual.nonExpressed
      expect(sumResidual).toBeCloseTo(res.residualPopulationT2, 4)
      expect(res.coveredTotals.antiRn + res.residual.antiRn).toBeCloseTo(res.officialSecondRound.antiRn, 4)
      expect(res.coveredTotals.rn + res.residual.rn).toBeCloseTo(res.officialSecondRound.rn, 4)
      expect(res.coveredTotals.nonExpressed + res.residual.nonExpressed).toBeCloseTo(
        res.officialSecondRound.nonExpressed,
        4,
      )
    }
  })
})
