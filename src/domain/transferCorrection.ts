import { BLOCS } from './types'
import type { Bloc, DropoutProfile, ProfileId, SecondRoundDropoutData, TransferValues, TransfersData } from './types'

/** Reports estimés (%) et erreurs types d'un type de duel, par bloc d'électeurs. */
export type ActualTransfers = Record<Bloc, { estimate: TransferValues; se: TransferValues }>

/** Inverse d'une matrice carrée par élimination de Gauss-Jordan (pivot partiel). */
function invert(m: number[][]): number[][] {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    const p = a[col]![col]!
    for (let j = 0; j < 2 * n; j++) a[col]![j]! /= p
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r]![col]!
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[col]![j]!
    }
  }
  return a.map((row) => row.slice(n))
}

const cache = new WeakMap<DropoutProfile, ActualTransfers>()

/**
 * Reports réels des législatives 2024 par bloc : régression écologique de Goodman sur les circonscriptions
 * d'un type de duel. Pour chaque issue (finaliste, RN, abandon), y = voix de l'issue au 2nd tour ÷ exprimés du
 * 1er tour (abandon : 1 − exprimés du 2nd tour ÷ exprimés du 1er tour), expliqué par les parts au 1er tour des
 * quatre blocs, aux moindres carrés sans constante, chaque circonscription pesant 1. Erreurs types :
 * s² = SCR ÷ (n − 4), multiplié par la diagonale de (X'X)⁻¹. Les valeurs brutes peuvent sortir de [0 ; 100] :
 * bruit, et abstentionnistes du 1er tour qui votent au 2nd (inférence écologique).
 */
export function actualTransfers(profile: DropoutProfile): ActualTransfers {
  const cached = cache.get(profile)
  if (cached) return cached
  const rows = profile.constituencies.map((c) => {
    const total = BLOCS.reduce((t, b) => t + c.firstRoundVotesByBloc[b], 0)
    return {
      x: BLOCS.map((b) => (total > 0 ? c.firstRoundVotesByBloc[b] / total : 0)),
      y: [
        c.secondRoundVotes.finalist / c.firstRoundExpressed,
        c.secondRoundVotes.rn / c.firstRoundExpressed,
        1 - c.secondRoundExpressed / c.firstRoundExpressed,
      ],
    }
  })
  const k = BLOCS.length
  const xtx = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => rows.reduce((t, r) => t + r.x[i]! * r.x[j]!, 0)),
  )
  const inv = invert(xtx)
  const dof = rows.length - k
  const outcomes = [0, 1, 2].map((o) => {
    const xty = Array.from({ length: k }, (_, i) => rows.reduce((t, r) => t + r.x[i]! * r.y[o]!, 0))
    const beta = inv.map((row) => row.reduce((t, v, j) => t + v * xty[j]!, 0))
    const ssr = rows.reduce((t, r) => t + (r.y[o]! - r.x.reduce((u, v, i) => u + v * beta[i]!, 0)) ** 2, 0)
    const s2 = ssr / dof
    return { beta, se: inv.map((row, i) => Math.sqrt(s2 * row[i]!)) }
  })
  const result = Object.fromEntries(
    BLOCS.map((b, i) => [
      b,
      {
        estimate: { finalist: 100 * outcomes[0]!.beta[i]!, rn: 100 * outcomes[1]!.beta[i]!, abstention: 100 * outcomes[2]!.beta[i]! },
        se: { finalist: 100 * outcomes[0]!.se[i]!, rn: 100 * outcomes[1]!.se[i]!, abstention: 100 * outcomes[2]!.se[i]! },
      },
    ]),
  ) as ActualTransfers
  cache.set(profile, result)
  return result
}

/** Borne chaque issue à [0 ; 100] puis ramène le total à 100 (null si tout est nul). */
export function boundAndNormalize(v: TransferValues): TransferValues | null {
  const f = Math.min(100, Math.max(0, v.finalist))
  const r = Math.min(100, Math.max(0, v.rn))
  const a = Math.min(100, Math.max(0, v.abstention))
  const sum = f + r + a
  return sum > 0 ? { finalist: (100 * f) / sum, rn: (100 * r) / sum, abstention: (100 * a) / sum } : null
}

/** Reports réels retenus pour un bloc : estimation bornée et renormalisée à 100. */
export function actualRow(profile: DropoutProfile, bloc: Bloc): TransferValues | null {
  return boundAndNormalize(actualTransfers(profile)[bloc].estimate)
}

/**
 * Ligne corrigée = report de l'enquête + intensité × (réel − enquête), puis bornée et renormalisée. Seuls les
 * blocs absents du duel en 2024 (hors `finalistBlocs`) sont corrigés : les lignes du camp d'un finaliste
 * mesurent surtout ses propres électeurs (candidat unique par camp) et gardent les valeurs de l'enquête.
 * Renvoie null si la ligne n'est pas corrigée.
 */
export function correctedTransfer(
  transfers: TransfersData,
  dropout: SecondRoundDropoutData,
  profileId: ProfileId,
  bloc: Bloc,
  intensity: number,
): TransferValues | null {
  const profile = dropout.legislatives2024.profiles[profileId]
  const row = transfers.profiles.find((p) => p.id === profileId)?.rows[bloc]
  if (!profile || !row || row.camp || profile.finalistBlocs.includes(bloc)) return null
  const actual = actualRow(profile, bloc)
  if (!actual) return null
  const mix = (a: number, b: number) => a + intensity * (b - a)
  return (
    boundAndNormalize({
      finalist: mix(row.finalist, actual.finalist),
      rn: mix(row.rn, actual.rn),
      abstention: mix(row.abstention, actual.abstention),
    }) ?? null
  )
}

/**
 * Incertitude des reports corrigés : la plus faible et la plus forte erreur type (en points) des lignes que
 * l'option corrige, toutes issues confondues (finaliste, RN, abandon), et le nombre de circonscriptions dont
 * elles sont tirées.
 */
export function correctionUncertainty(transfers: TransfersData, dropout: SecondRoundDropoutData) {
  const ses: number[] = []
  let constituencies = 0
  for (const [id, profile] of Object.entries(dropout.legislatives2024.profiles) as [ProfileId, DropoutProfile][]) {
    constituencies += profile.constituencies.length
    const actual = actualTransfers(profile)
    for (const bloc of BLOCS) {
      if (correctedTransfer(transfers, dropout, id, bloc, 1) === null) continue
      const { finalist, rn, abstention } = actual[bloc].se
      ses.push(finalist, rn, abstention)
    }
  }
  return { minSe: Math.min(...ses), maxSe: Math.max(...ses), constituencies }
}

/** Option de correction des reports : données de 2024 et intensité (1 = 100 %). */
export interface TransferCorrection {
  dropout: SecondRoundDropoutData
  intensity: number
}
