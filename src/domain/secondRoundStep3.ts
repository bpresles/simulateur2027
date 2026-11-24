import { computeBacktest, historicalBloc } from './backtest'
import type { BacktestReport } from './backtest'
import { computeSecondRound } from './secondRound'
import {
  CURRENT_ANTI_RN_SHARE,
  CURRENT_MOBILIZATION,
  R113_REF_ANTI_RN_SHARE,
  R113_REF_MOBILIZATION,
  TRANSPOSED_CENTER_ROW,
  computeR19BlocRows,
  computeStep2Report,
} from './secondRoundDegradation'
import { ALL_REPRODUCTION_VARIANTS, resolveReferenceRows } from './secondRoundReproduction'
import type { ReproductionVariant } from './secondRoundReproduction'
import { fidelityFor } from './transfers'
import type { ProfileTable } from './transfers'
import type {
  Bloc,
  Candidate,
  ProfileId,
  Reference2017,
  Reference2022,
  ReferenceMatrixYear,
  ReferenceTransferTriplet,
  SecondRoundReferenceMatricesData,
  SimulationData,
  TransferValues,
} from './types'

export const R13_CORRECTION_THRESHOLD_PTS = 0.5
export const R14_IN_SAMPLE_MAX_ERR_PTS = 1
export const R14_LEG2024_MAX_DRIFT_PTS = 0.5

export type Step3CorrectionMode =
  | 'r1_3_selected' // Seule (b) passe R1.3 (≥ 0,5 pt) ; (a) et (d) sous 0,5 pt ; (f) exclue par R1.11
  | 'a_plus_b_control' // Contrôle informatif : (a) + (b) (lignes de bloc R1.1 dont Fillon/Jadot + ED R1.14)
  | 'a_plus_b_plus_d_control' // Contrôle informatif : (a) + (b) + (d) (avec a = 0,14, q = 0,59)

export interface ElectionEvalMetrics {
  year: ReferenceMatrixYear
  predictedAntiRnPct: number
  actualAntiRnPct: number
  errorPts: number
  volumeAntiRnPct: number
  volumeRnPct: number
  expressed2Pct: number
}

export interface Leg2024StabilityRow {
  profileId: ProfileId
  baselinePct: number
  candidatePct: number
  deltaPts: number
}

export interface R14EvaluationResult {
  mode: Step3CorrectionMode
  variant: ReproductionVariant
  /** Ligne extrême droite hors finaliste R1.14 (moyenne simple 2017 et 2022, chaque élection = 1 observation). */
  r114PooledExtremeDroiteRow: TransferValues
  /** En échantillon : matrices de l'année (y compris ligne ED hors finaliste de l'année). */
  inSample: Record<ReferenceMatrixYear, ElectionEvalMetrics>
  /** En échantillon avec la ligne poolée R1.14 pour l'ED hors finaliste (contrôle informatif). */
  inSampleWithPooledEd: Record<ReferenceMatrixYear, ElectionEvalMetrics>
  /** Croisé strict (R1.14) : chaque année évaluée avec les matrices et la seule ligne ED de l'autre année. */
  cross: Record<ReferenceMatrixYear, ElectionEvalMetrics>
  crossMeanAbsErrorPts: number
  baselineCrossMeanAbsErrorPts: number
  /** Contrôle diagnostique avec fidélités mesurées R1.1 des finalistes (hors effet (f), jamais retenu pour R1.4). */
  diagnosticWithoutF: {
    inSample: Record<ReferenceMatrixYear, ElectionEvalMetrics>
    cross: Record<ReferenceMatrixYear, ElectionEvalMetrics>
    crossMeanAbsErrorPts: number
  }
  leg2024: {
    rows: Leg2024StabilityRow[]
    maxAbsDeltaPts: number
  }
  conditions: {
    inSampleBothUnder1Pt: boolean
    crossMeanNotDegraded: boolean
    leg2024StableWithin05Pt: boolean
  }
  r14Passed: boolean
}

export interface Step3Report {
  /** Simplifications retenues par application stricte de R1.3 (≥ 0,5 pt) et R1.11 ((f) exclue). */
  r13SelectedKeys: ('a' | 'b' | 'd')[]
  r13ExcludedByThreshold: ('a' | 'b' | 'd')[]
  baseline: {
    inSample: Record<ReferenceMatrixYear, ElectionEvalMetrics>
    cross: Record<ReferenceMatrixYear, ElectionEvalMetrics>
    crossMeanAbsErrorPts: number
  }
  /** Évaluation principale R1.4 (règle R1.3 stricte : (b) seul selon R1.14), pour R1.1 et les variantes R1.6/R1.7. */
  r13ByVariant: Record<ReproductionVariant, R14EvaluationResult>
  /** Contrôles informatifs en variante R1.1 : (a)+(b) et (a)+(b)+(d). */
  controls: {
    aPlusB: Record<ReproductionVariant, R14EvaluationResult>
    aPlusBPlusDR11: R14EvaluationResult
  }
}

const toTransferValues = (t: ReferenceTransferTriplet): TransferValues => ({
  finalist: t.antiRn,
  rn: t.rn,
  abstention: t.nonExpressed,
})

function buildR11BlocRows(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  matrices: SecondRoundReferenceMatricesData,
  variant: ReproductionVariant,
): Record<Bloc, TransferValues> {
  const resolved = resolveReferenceRows(
    matrices.rows[year],
    matrices.surveys,
    variant,
    matrices.participation[year].abstentionPctByCandidate,
  )
  const r19 = computeR19BlocRows(ref, new Map(resolved.map((r) => [r.candidateId, r.row])))
  return {
    gauche: toTransferValues(r19.gauche),
    centre: toTransferValues(TRANSPOSED_CENTER_ROW),
    droite: toTransferValues(r19.droite),
    extreme_droite: toTransferValues(r19.extreme_droite),
  }
}

function evalPresidentialWithBlocRows(
  year: ReferenceMatrixYear,
  ref: Reference2017 | Reference2022,
  data: SimulationData,
  rows: Record<Bloc, TransferValues>,
  options: {
    mobilization?: number
    antiRnShare?: number
    fidMacron?: { loyal: number; cross: number; abstention: number }
    fidLePen?: { loyal: number; cross: number; abstention: number }
  } = {},
): ElectionEvalMetrics {
  const electorate = Object.fromEntries(ref.candidates.map((c) => [c.id, (100 * c.votes) / ref.expressed]))
  const candidatesById = new Map<string, Candidate>(
    ref.candidates.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        shortName: c.name,
        party: '',
        bloc: historicalBloc(c.id),
        color: '#000000',
        colorDark: '#ffffff',
        duelProfile: c.id === 'macron' ? 'ensemble_rn' : null,
        isRN: c.id === 'lepen',
      },
    ]),
  )
  const fidMacron = options.fidMacron ?? fidelityFor('macron', data.transfers, null)
  const fidLePen = options.fidLePen ?? fidelityFor('lepen', data.transfers, null)
  const profiles: ProfileTable = {
    lfi_rn: rows,
    ecolo_ps_pcf_rn: rows,
    ensemble_rn: rows,
    lr_rn: rows,
  }
  const sr = computeSecondRound({
    electorate,
    a: 'macron',
    b: 'lepen',
    duel: {
      kind: 'rn-sourced',
      challengerId: 'macron',
      rnId: 'lepen',
      profileWeights: [{ profileId: 'ensemble_rn', weight: 1 }],
    },
    profiles,
    nonRnPresidential: data.transfers.nonRnPresidential,
    fidelityA: fidMacron,
    fidelityB: fidLePen,
    candidatesById,
    firstRoundTurnout: (100 * ref.voters) / ref.registered,
    blankNullShare: (ref.voters - ref.expressed) / ref.voters,
    abstainerMobilization: options.mobilization ?? CURRENT_MOBILIZATION,
    abstainerAntiRnShare: options.antiRnShare ?? CURRENT_ANTI_RN_SHARE,
    secondRoundPolls: [],
  })
  const actualMacron = ref.secondRound.candidates.find((c) => c.id === 'macron')!.votes
  const actualAntiRnPct = (100 * actualMacron) / ref.secondRound.expressed
  return {
    year,
    predictedAntiRnPct: sr.pct.a,
    actualAntiRnPct,
    errorPts: sr.pct.a - actualAntiRnPct,
    volumeAntiRnPct: sr.totals.a,
    volumeRnPct: sr.totals.b,
    expressed2Pct: sr.expressed2,
  }
}

function evalLeg2024WithAbstainers(
  data: SimulationData,
  mobilization: number,
  antiRnShare: number,
): Record<ProfileId, number> {
  const fidDefault = data.transfers.fidelity.default
  const fidRn = fidelityFor('lepen', data.transfers, null)
  const legTurnout2024 = 66.7
  const legBnShare2024 =
    (data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound -
      data.secondRoundDropout.newVoters.legislatives2024.expressedFirstRound) /
    data.secondRoundDropout.newVoters.legislatives2024.votersFirstRound

  return Object.fromEntries(
    data.transfers.profiles.map((profile) => {
      const agg = data.secondRoundDropout.legislatives2024.profiles[profile.id]
      const total1 = Object.values(agg.firstRoundVotesByBloc).reduce((s, v) => s + v, 0)
      const finalistBloc = agg.finalistBlocs.find((b) => b !== 'extreme_droite')!
      const electorate = Object.fromEntries(
        Object.entries(agg.firstRoundVotesByBloc).map(([b, v]) => [b, total1 > 0 ? (100 * v) / total1 : 0]),
      )
      const syntheticCandidates = new Map<string, Candidate>(
        (['gauche', 'centre', 'droite', 'extreme_droite'] as const).map((b) => [
          b,
          {
            id: b,
            name: b,
            shortName: b,
            party: '',
            bloc: b,
            color: '#000000',
            colorDark: '#ffffff',
            duelProfile: b === finalistBloc ? profile.id : null,
            isRN: b === 'extreme_droite',
          },
        ]),
      )
      const table: ProfileTable = {
        lfi_rn: profile.rows,
        ecolo_ps_pcf_rn: profile.rows,
        ensemble_rn: profile.rows,
        lr_rn: profile.rows,
      }
      const pred = computeSecondRound({
        electorate,
        a: finalistBloc,
        b: 'extreme_droite',
        duel: {
          kind: 'rn-sourced',
          challengerId: finalistBloc,
          rnId: 'extreme_droite',
          profileWeights: [{ profileId: profile.id, weight: 1 }],
        },
        profiles: table,
        nonRnPresidential: data.transfers.nonRnPresidential,
        fidelityA: fidDefault,
        fidelityB: fidRn,
        candidatesById: syntheticCandidates,
        firstRoundTurnout: legTurnout2024,
        blankNullShare: legBnShare2024,
        abstainerMobilization: mobilization,
        abstainerAntiRnShare: antiRnShare,
        secondRoundPolls: [],
      })
      return [profile.id, pred.pct.a]
    }),
  ) as Record<ProfileId, number>
}

/**
 * Calcule la ligne R1.14 de l'extrême droite hors finaliste : moyenne simple des lignes résolues
 * de Dupont-Aignan 2017 et de Zemmour 2022 (chaque élection compte pour une observation).
 */
export function computeR114ExtremeDroiteRow(
  matrices: SecondRoundReferenceMatricesData,
  variant: ReproductionVariant = 'r1_1',
): { row2017: TransferValues; row2022: TransferValues; pooled: TransferValues } {
  const res17 = resolveReferenceRows(
    matrices.rows['2017'],
    matrices.surveys,
    variant,
    matrices.participation['2017'].abstentionPctByCandidate,
  )
  const res22 = resolveReferenceRows(
    matrices.rows['2022'],
    matrices.surveys,
    variant,
    matrices.participation['2022'].abstentionPctByCandidate,
  )
  const nda17 = toTransferValues(res17.find((r) => r.candidateId === 'dupont-aignan')!.row)
  const zem22 = toTransferValues(res22.find((r) => r.candidateId === 'zemmour')!.row)
  return {
    row2017: nda17,
    row2022: zem22,
    pooled: {
      finalist: (nda17.finalist + zem22.finalist) / 2,
      rn: (nda17.rn + zem22.rn) / 2,
      abstention: (nda17.abstention + zem22.abstention) / 2,
    },
  }
}

function evaluateModeVariant(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  mode: Step3CorrectionMode,
  variant: ReproductionVariant,
  baselineCrossMeanAbsErrorPts: number,
  baselineLeg2024: Record<ProfileId, number>,
): R14EvaluationResult {
  const repo17 = data.transfers.presidentialCenterRn.elections['2017']
  const repo22 = data.transfers.presidentialCenterRn.elections['2022']
  const r11Rows17 = buildR11BlocRows('2017', data.reference2017, matrices, variant)
  const r11Rows22 = buildR11BlocRows('2022', data.reference2022, matrices, variant)
  const { pooled: r114PooledExtremeDroiteRow } = computeR114ExtremeDroiteRow(matrices, variant)

  const useR11GaucheDroite = mode !== 'r1_3_selected'
  const useD = mode === 'a_plus_b_plus_d_control'
  const mob = useD ? R113_REF_MOBILIZATION : CURRENT_MOBILIZATION
  const q = useD ? R113_REF_ANTI_RN_SHARE : CURRENT_ANTI_RN_SHARE

  const rows17: Record<Bloc, TransferValues> = useR11GaucheDroite
    ? r11Rows17
    : { ...repo17, extreme_droite: r11Rows17.extreme_droite }
  const rows22: Record<Bloc, TransferValues> = useR11GaucheDroite
    ? r11Rows22
    : { ...repo22, extreme_droite: r11Rows22.extreme_droite }

  const rows17PooledEd: Record<Bloc, TransferValues> = { ...rows17, extreme_droite: r114PooledExtremeDroiteRow }
  const rows22PooledEd: Record<Bloc, TransferValues> = { ...rows22, extreme_droite: r114PooledExtremeDroiteRow }

  const in17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, rows17, { mobilization: mob, antiRnShare: q })
  const in22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, rows22, { mobilization: mob, antiRnShare: q })
  const pool17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, rows17PooledEd, {
    mobilization: mob,
    antiRnShare: q,
  })
  const pool22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, rows22PooledEd, {
    mobilization: mob,
    antiRnShare: q,
  })
  const cr17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, rows22, { mobilization: mob, antiRnShare: q })
  const cr22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, rows17, { mobilization: mob, antiRnShare: q })
  const crossMeanAbsErrorPts = (Math.abs(cr17.errorPts) + Math.abs(cr22.errorPts)) / 2

  // Contrôle diagnostique hors (f) (fidélités mesurées de l'année ; jamais retenu pour R1.4 selon R1.11)
  const measuredFid = (year: ReferenceMatrixYear) => {
    const res = resolveReferenceRows(
      matrices.rows[year],
      matrices.surveys,
      variant,
      matrices.participation[year].abstentionPctByCandidate,
    )
    const m = res.find((r) => r.candidateId === 'macron')!.row
    const l = res.find((r) => r.candidateId === 'lepen')!.row
    return {
      fidMacron: { loyal: m.antiRn, cross: m.rn, abstention: m.nonExpressed },
      fidLePen: { loyal: l.rn, cross: l.antiRn, abstention: l.nonExpressed },
    }
  }
  const f17 = measuredFid('2017')
  const f22 = measuredFid('2022')
  const diagIn17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, rows17, {
    mobilization: mob,
    antiRnShare: q,
    ...f17,
  })
  const diagIn22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, rows22, {
    mobilization: mob,
    antiRnShare: q,
    ...f22,
  })
  const diagCr17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, rows22, {
    mobilization: mob,
    antiRnShare: q,
    ...f17,
  })
  const diagCr22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, rows17, {
    mobilization: mob,
    antiRnShare: q,
    ...f22,
  })

  const candLeg2024 = evalLeg2024WithAbstainers(data, mob, q)
  const legRows: Leg2024StabilityRow[] = (Object.keys(baselineLeg2024) as ProfileId[]).map((profileId) => ({
    profileId,
    baselinePct: baselineLeg2024[profileId],
    candidatePct: candLeg2024[profileId],
    deltaPts: candLeg2024[profileId] - baselineLeg2024[profileId],
  }))
  const maxAbsDeltaPts = Math.max(...legRows.map((r) => Math.abs(r.deltaPts)))

  const conditions = {
    inSampleBothUnder1Pt:
      Math.abs(in17.errorPts) <= R14_IN_SAMPLE_MAX_ERR_PTS &&
      Math.abs(in22.errorPts) <= R14_IN_SAMPLE_MAX_ERR_PTS,
    crossMeanNotDegraded: crossMeanAbsErrorPts <= baselineCrossMeanAbsErrorPts + 1e-9,
    leg2024StableWithin05Pt: maxAbsDeltaPts <= R14_LEG2024_MAX_DRIFT_PTS + 1e-9,
  }

  return {
    mode,
    variant,
    r114PooledExtremeDroiteRow,
    inSample: { '2017': in17, '2022': in22 },
    inSampleWithPooledEd: { '2017': pool17, '2022': pool22 },
    cross: { '2017': cr17, '2022': cr22 },
    crossMeanAbsErrorPts,
    baselineCrossMeanAbsErrorPts,
    diagnosticWithoutF: {
      inSample: { '2017': diagIn17, '2022': diagIn22 },
      cross: { '2017': diagCr17, '2022': diagCr22 },
      crossMeanAbsErrorPts: (Math.abs(diagCr17.errorPts) + Math.abs(diagCr22.errorPts)) / 2,
    },
    leg2024: { rows: legRows, maxAbsDeltaPts },
    conditions,
    r14Passed:
      conditions.inSampleBothUnder1Pt &&
      conditions.crossMeanNotDegraded &&
      conditions.leg2024StableWithin05Pt,
  }
}

/** Exécute l'étape 3 de P1 : sélection R1.3 et évaluation complète R1.4 (avec variantes R1.6 et R1.7). */
export function computeStep3Report(
  data: SimulationData,
  matrices: SecondRoundReferenceMatricesData,
  existingBacktest?: BacktestReport,
): Step3Report {
  const step2_17 = computeStep2Report('2017', data.reference2017, matrices, data.transfers)
  const step2_22 = computeStep2Report('2022', data.reference2022, matrices, data.transfers)

  const corrigibleKeys = ['a', 'b', 'd'] as const
  const r13SelectedKeys: ('a' | 'b' | 'd')[] = []
  const r13ExcludedByThreshold: ('a' | 'b' | 'd')[] = []
  for (const key of corrigibleKeys) {
    const d17 = step2_17.degradations.find((d) => d.key === key)!
    const d22 = step2_22.degradations.find((d) => d.key === key)!
    const maxEffect = Math.max(
      Math.abs(d17.addedToReferencePts),
      Math.abs(d17.removedFromCurrentGainPts),
      Math.abs(d22.addedToReferencePts),
      Math.abs(d22.removedFromCurrentGainPts),
    )
    const sameSign = d17.addedToReferencePts * d22.addedToReferencePts >= 0
    if (sameSign && maxEffect >= R13_CORRECTION_THRESHOLD_PTS) r13SelectedKeys.push(key)
    else r13ExcludedByThreshold.push(key)
  }

  const repo17 = data.transfers.presidentialCenterRn.elections['2017']
  const repo22 = data.transfers.presidentialCenterRn.elections['2022']
  const baseIn17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, repo17)
  const baseIn22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, repo22)
  const baseCr17 = evalPresidentialWithBlocRows('2017', data.reference2017, data, repo22)
  const baseCr22 = evalPresidentialWithBlocRows('2022', data.reference2022, data, repo17)
  const baselineCrossMeanAbsErrorPts = (Math.abs(baseCr17.errorPts) + Math.abs(baseCr22.errorPts)) / 2

  const bt = existingBacktest ?? computeBacktest(data, data.polls)
  const baselineLeg2024 = Object.fromEntries(
    bt.legislatives2024Coherence.map((row) => [row.profileId, row.predictedFinalistPct]),
  ) as Record<ProfileId, number>

  const r13ByVariant = Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      evaluateModeVariant(data, matrices, 'r1_3_selected', v, baselineCrossMeanAbsErrorPts, baselineLeg2024),
    ]),
  ) as Record<ReproductionVariant, R14EvaluationResult>

  const aPlusB = Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      evaluateModeVariant(data, matrices, 'a_plus_b_control', v, baselineCrossMeanAbsErrorPts, baselineLeg2024),
    ]),
  ) as Record<ReproductionVariant, R14EvaluationResult>

  const aPlusBPlusDR11 = evaluateModeVariant(
    data,
    matrices,
    'a_plus_b_plus_d_control',
    'r1_1',
    baselineCrossMeanAbsErrorPts,
    baselineLeg2024,
  )

  return {
    r13SelectedKeys,
    r13ExcludedByThreshold,
    baseline: {
      inSample: { '2017': baseIn17, '2022': baseIn22 },
      cross: { '2017': baseCr17, '2022': baseCr22 },
      crossMeanAbsErrorPts: baselineCrossMeanAbsErrorPts,
    },
    r13ByVariant,
    controls: {
      aPlusB,
      aPlusBPlusDR11,
    },
  }
}
