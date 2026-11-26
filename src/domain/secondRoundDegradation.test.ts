import { secondRoundReferenceMatrices, simulationData } from '../data/schema'
import { computeSecondRound } from './secondRound'
import {
  CURRENT_ENGINE_FLAGS,
  REFERENCE_FLAGS,
  checkR12Tolerance,
  computeStep2Report,
  evaluateSecondRoundConfig,
} from './secondRoundDegradation'
import { resolveDuel } from './transfers'
import type { Candidate } from './types'

describe('P1 étape 2 — configuration de référence, contrôle R1.2 et dégradations (archive v2.2)', () => {
  it('reproduit exactement le moteur v2.2 archivé lorsque (a), (b), (d) et (f) sont actifs', () => {
    const cur2017 = evaluateSecondRoundConfig(
      '2017',
      simulationData.reference2017,
      secondRoundReferenceMatrices,
      simulationData.transfers,
      CURRENT_ENGINE_FLAGS,
    )
    const cur2022 = evaluateSecondRoundConfig(
      '2022',
      simulationData.reference2022,
      secondRoundReferenceMatrices,
      simulationData.transfers,
      CURRENT_ENGINE_FLAGS,
    )

    // Valeurs archivées du diagnostic v2.2 §2.1 et §2.2
    expect(cur2017.antiRnPct).toBeCloseTo(59.23, 2)
    expect(cur2017.totals.a).toBeCloseTo(39.88, 2)
    expect(cur2017.totals.b).toBeCloseTo(27.45, 2)
    expect(cur2017.expressed2).toBeCloseTo(67.33, 2)

    expect(cur2022.antiRnPct).toBeCloseTo(54.95, 2)
    expect(cur2022.totals.a).toBeCloseTo(35.97, 2)
    expect(cur2022.totals.b).toBeCloseTo(29.49, 2)
    expect(cur2022.expressed2).toBeCloseTo(65.46, 2)
  })

  it('respecte les invariants comptables (archive v2.2 et moteur P1-bis) et q = 0,5 hors duel RN', () => {
    for (const [year, ref] of [
      ['2017', simulationData.reference2017],
      ['2022', simulationData.reference2022],
    ] as const) {
      for (const flags of [REFERENCE_FLAGS, CURRENT_ENGINE_FLAGS]) {
        const res = evaluateSecondRoundConfig(year, ref, secondRoundReferenceMatrices, simulationData.transfers, flags)
        expect(res.totals.a + res.totals.b + res.totals.nonExpressed + res.blankNull1).toBeCloseTo(100, 9)
      }
    }

    // Invariant q = 0,5 hors duel RN dans computeSecondRound
    const candidates = new Map<string, Candidate>([
      ['g', { id: 'g', name: 'G', shortName: 'G', party: '', bloc: 'gauche', color: '#000000', colorDark: '#ffffff', duelProfile: 'ecolo_ps_pcf_rn' }],
      ['d', { id: 'd', name: 'D', shortName: 'D', party: '', bloc: 'droite', color: '#000000', colorDark: '#ffffff', duelProfile: 'lr_rn' }],
    ])
    const duel = resolveDuel('g', 'd', candidates)
    expect(duel.kind).toBe('non-rn-presidential')
    const sr = computeSecondRound({
      electorate: { g: 50, d: 50 },
      a: 'g',
      b: 'd',
      duel,
      profiles: {
        lfi_rn: simulationData.transfers.profiles[0]!.rows,
        ecolo_ps_pcf_rn: simulationData.transfers.profiles[1]!.rows,
        ensemble_rn: simulationData.transfers.profiles[2]!.rows,
        lr_rn: simulationData.transfers.profiles[3]!.rows,
      },
      nonRnPresidential: simulationData.transfers.nonRnPresidential,
      fidelityA: simulationData.transfers.fidelity.default,
      fidelityB: simulationData.transfers.fidelity.default,
      candidatesById: candidates,
      firstRoundTurnout: 74,
      blankNullShare: 0.02,
      abstainerMobilization: 0.2,
      abstainerAntiRnShare: 0.72,
      secondRoundPolls: [],
    })
    expect(sr.effectiveAbstainerAntiRnShare).toBe(0.5)
    expect(sr.abstainers.toA).toBeCloseTo(sr.abstainers.toB, 9)
    expect(sr.totals.a + sr.totals.b + sr.totals.nonExpressed).toBeCloseTo(100, 9)
  })

  it('contrôle correctement la tolérance R1.2 (±1 pt part et ±1 pt d’inscrits par volume)', () => {
    const ok = checkR12Tolerance(
      { antiRnPct: 60.8, antiRnVolumePct: 39.2, rnVolumePct: 25.9 },
      { antiRnPct: 60.0, antiRnVolumePct: 40.0, rnVolumePct: 26.5 },
    )
    expect(ok.passed).toBe(true)
    expect(ok.violations).toEqual([])

    const ko = checkR12Tolerance(
      { antiRnPct: 58.5, antiRnVolumePct: 38.5, rnVolumePct: 28.0 },
      { antiRnPct: 60.0, antiRnVolumePct: 40.0, rnVolumePct: 26.5 },
    )
    expect(ko.passed).toBe(false)
    expect(ko.violations).toHaveLength(3)
  })

  it('calcule les dégradations dans les deux ordres et la borne R1.9 de (c) sur 2017 et 2022', () => {
    const r2017 = computeStep2Report(
      '2017',
      simulationData.reference2017,
      secondRoundReferenceMatrices,
      simulationData.transfers,
    )
    const r2022 = computeStep2Report(
      '2022',
      simulationData.reference2022,
      secondRoundReferenceMatrices,
      simulationData.transfers,
    )

    // Retrait de (d) du moteur actuel : correspond aux chiffres de diagnostic §2.3 (+0,27 en 2017, +0,23 en 2022)
    expect(r2017.degradations.find((d) => d.key === 'd')!.removedFromCurrentGainPts).toBeCloseTo(0.27, 2)
    expect(r2022.degradations.find((d) => d.key === 'd')!.removedFromCurrentGainPts).toBeCloseTo(0.23, 2)

    // Bornes R1.9 de (c) : voix des petits candidats sans ligne / exprimés T2
    expect(r2017.boundC.uncoveredVotes).toBe(1460323)
    expect(r2017.boundC.maxEffectPts).toBeCloseTo(4.65, 2)
    expect(r2022.boundC.uncoveredVotes).toBe(3711461)
    expect(r2022.boundC.maxEffectPts).toBeCloseTo(11.58, 2)

    // R1.2 est effectivement violée sur la configuration de référence (a = 0,14, q = 0,59)
    expect(r2017.reference.r12.passed).toBe(false)
    expect(r2022.reference.r12.passed).toBe(false)
  })
})
