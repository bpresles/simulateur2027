import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  CandidateId,
  Entrant,
  MinorTransfer,
  ProfileId,
  ProfileWeight,
  ReferencePart,
  ResolvedDuel,
  Settings,
  TransferValues,
  TransfersData,
} from './types'

export type ProfileTable = Record<ProfileId, Record<Bloc, TransferValues>>

/**
 * Profils de reports effectifs : surcharges de l'utilisateur, puis lignes « camp » converties
 * selon la fidélité (un électorat rattaché au camp RN vote RN au taux de fidélité, le reste s'abstient).
 */
export function effectiveProfiles(
  transfers: TransfersData,
  overrides: Settings['transferOverrides'],
  fidelity: number,
): ProfileTable {
  const loyal = fidelity * 100
  return Object.fromEntries(
    transfers.profiles.map((p) => [
      p.id,
      Object.fromEntries(
        BLOCS.map((b) => {
          const override = overrides[p.id]?.[b]
          if (override) return [b, { ...override }]
          const row = p.rows[b]
          if (row.camp === 'rn') return [b, { finalist: 0, rn: loyal, abstention: 100 - loyal }]
          if (row.camp === 'finalist') return [b, { finalist: loyal, rn: 0, abstention: 100 - loyal }]
          return [b, { finalist: row.finalist, rn: row.rn, abstention: row.abstention }]
        }),
      ),
    ]),
  ) as ProfileTable
}

/** Moyenne des lignes de plusieurs profils, pondérée par le poids de chaque membre de l'alliance. */
export function blendProfiles(table: ProfileTable, weights: ProfileWeight[]): Record<Bloc, TransferValues> {
  return Object.fromEntries(
    BLOCS.map((b) => {
      const row = { finalist: 0, rn: 0, abstention: 0 }
      for (const { profileId, weight } of weights) {
        const source = table[profileId][b]
        row.finalist += source.finalist * weight
        row.rn += source.rn * weight
        row.abstention += source.abstention * weight
      }
      return [b, row]
    }),
  ) as Record<Bloc, TransferValues>
}

/**
 * Détermine la méthode de 2nd tour :
 * - un finaliste RN face à un finaliste doté d'un profil sourcé → profil (mélangé si alliance) ;
 * - sinon → modèle de repli par affinités (hors source).
 */
export function resolveDuel(
  a: Entrant,
  b: Entrant,
  candidatesById: Map<CandidateId, Candidate>,
): ResolvedDuel {
  const isRN = (e: Entrant) => e.members.some((m) => candidatesById.get(m.candidateId)?.isRN)
  const fallback: ResolvedDuel = { kind: 'fallback', challengerId: null, rnId: null, profileWeights: [] }
  if (isRN(a) === isRN(b)) return fallback
  const [rn, challenger] = isRN(a) ? [a, b] : [b, a]

  const weights = new Map<ProfileId, number>()
  for (const m of challenger.members) {
    const profile = candidatesById.get(m.candidateId)?.duelProfile
    if (profile) weights.set(profile, (weights.get(profile) ?? 0) + m.weight)
  }
  const total = [...weights.values()].reduce((s, w) => s + w, 0)
  if (total <= 0) return { ...fallback, challengerId: challenger.id, rnId: rn.id }

  return {
    kind: 'sourced',
    challengerId: challenger.id,
    rnId: rn.id,
    profileWeights: [...weights].map(([profileId, w]) => ({ profileId, weight: w / total })),
  }
}

/** Modèle de repli : abstention fixe par bloc, le reste au prorata des affinités avec chaque finaliste. */
export function fallbackSplit(
  voterBloc: Bloc,
  blocA: Bloc,
  blocB: Bloc,
  fallback: TransfersData['fallback'],
): { toA: number; toB: number; abstention: number } {
  const abstention = fallback.abstention[voterBloc]
  const affA = fallback.affinity[voterBloc][blocA]
  const affB = fallback.affinity[voterBloc][blocB]
  const expressed = 100 - abstention
  if (affA + affB <= 0) return { toA: expressed / 2, toB: expressed / 2, abstention }
  return { toA: (expressed * affA) / (affA + affB), toB: (expressed * affB) / (affA + affB), abstention }
}

/** Répartition retenue pour les électeurs d'un petit candidat : choix des réglages, sinon la première. */
export function minorTransfer(c: Candidate, choices: Settings['minorTransfers']): MinorTransfer | null {
  if (!c.minor) return null
  return c.minor.transfers.find((t) => t.id === choices[c.id]) ?? c.minor.transfers[0] ?? null
}

/**
 * Électorats principaux que suivent, au 2nd tour, les électeurs de chaque petit candidat, poids ramenés
 * à un total de 1.
 */
export function minorTransferParts(
  candidates: Candidate[],
  choices: Settings['minorTransfers'],
): Record<CandidateId, ReferencePart[]> {
  return Object.fromEntries(
    candidates.flatMap((c) => {
      const parts = minorTransfer(c, choices)?.parts ?? []
      const total = parts.reduce((s, p) => s + p.weight, 0)
      return total > 0 ? [[c.id, parts.map((p) => ({ id: p.id, weight: p.weight / total }))]] : []
    }),
  )
}

/**
 * Taux d'alliance constaté en 2024 : les électeurs du candidat rallié se comportent comme son
 * électorat dans les duels des législatives où le candidat de la famille du leader affrontait le RN
 * (après désistement). Exemple : Glucksmann rejoint Philippe → ligne « électeurs de gauche » du
 * profil Ensemble : 72 % suivent, 3 % votent RN, 25 % s'abstiennent.
 */
export function allianceSplit2024(
  leader: Candidate,
  joining: Candidate,
  profiles: ProfileTable,
): { leader: number; rn: number } {
  if (!leader.duelProfile) return { leader: 1, rn: 0 }
  const row = profiles[leader.duelProfile][joining.bloc]
  return { leader: row.finalist / 100, rn: row.rn / 100 }
}
