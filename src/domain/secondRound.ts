import { blendProfiles, fallbackSplit } from './transfers'
import type { ProfileTable } from './transfers'
import type {
  Bloc,
  Candidate,
  CandidateId,
  Entrant,
  Reference2022,
  ReferencePart,
  ResolvedDuel,
  SecondRoundPoll,
  SecondRoundResult,
  TransfersData,
  VoteFlow,
} from './types'

/**
 * Part des électeurs exprimés du 1er tour qui ne s'expriment pas au 2nd tour (blancs, nuls,
 * abstention), mesurée en 2022 : 1 − exprimés du 2nd tour ÷ exprimés du 1er tour.
 */
export function secondRoundDropout2022(ref: Reference2022): number {
  return 100 * (1 - ref.secondRound.expressed / ref.expressed)
}

interface SecondRoundInput {
  /** Électorat de chaque candidat au 1er tour simulé, avant alliances (total 100). */
  electorate: Record<CandidateId, number>
  a: Entrant
  b: Entrant
  duel: ResolvedDuel
  profiles: ProfileTable
  fallback: TransfersData['fallback']
  candidatesById: Map<CandidateId, Candidate>
  fidelity: number
  /** Total visé de blancs, nuls et abstentions (points des électeurs du 1er tour), null = pas de calage. */
  abstentionTarget: number | null
  secondRoundPolls: SecondRoundPoll[]
  /** Petits candidats : électorats principaux dont leurs électeurs suivent les reports (poids de total 1). */
  minorTransfers?: Record<CandidateId, ReferencePart[]>
}

/**
 * Voix de chaque finaliste = Σ (électorat de 1er tour × taux de report de cet électorat).
 * Le calcul part de l'électorat de chaque candidat AVANT alliances : une alliance entre candidats
 * éliminés ne change donc pas le 2nd tour (seulement, le cas échéant, la qualification).
 * - Électeurs d'un finaliste : fidélité, le reste en blanc/abstention.
 * - Électeurs d'un candidat rallié à un finaliste : la part qui l'a suivi dès le 1er tour lui reste
 *   fidèle, la part qui a voté RN vote RN ; ceux qui se sont abstenus au 1er tour se reportent comme
 *   les électeurs de leur bloc (une alliance ne fait donc jamais perdre de voix au 2nd tour).
 * - Électeurs des candidats éliminés, en alliance ou non, selon leur bloc :
 *   duel sourcé : la colonne « finaliste » va au challenger, la colonne « RN » au candidat RN ;
 *   duel hors source : modèle de repli par affinités entre blocs.
 * - Électeurs d'un petit candidat éliminé : répartis entre des électorats principaux selon leurs poids,
 *   chaque part se reporte comme cet électorat (fidèle à son candidat s'il est finaliste ou allié).
 * Calage : le taux d'abstention de chaque électorat est multiplié par un même coefficient pour que
 * le total atteigne la cible ; les votes exprimés gardent la répartition des taux de report.
 * Le résultat est exprimé en % des suffrages exprimés : A / (A + B).
 */
export function computeSecondRound(input: SecondRoundInput): SecondRoundResult {
  const { electorate, a, b, duel, profiles, fallback, candidatesById, fidelity, abstentionTarget } = input
  const bloc = (id: CandidateId) => candidatesById.get(id)!.bloc
  const blended = duel.kind === 'sourced' ? blendProfiles(profiles, duel.profileWeights) : null
  const challengerIsA = duel.challengerId === a.id

  const isRN = (e: Entrant) => e.members.some((m) => candidatesById.get(m.candidateId)?.isRN)
  /** Report des électeurs d'un bloc qui ne votaient pour aucun finaliste au 1er tour. */
  const blocTransfer = (share: number, voterBloc: Bloc) => {
    if (blended) {
      const row = blended[voterBloc]
      const toChallenger = (share * row.finalist) / 100
      const toRN = (share * row.rn) / 100
      return {
        toA: challengerIsA ? toChallenger : toRN,
        toB: challengerIsA ? toRN : toChallenger,
        abstention: (share * row.abstention) / 100,
      }
    }
    const split = fallbackSplit(voterBloc, bloc(a.id), bloc(b.id), fallback)
    return { toA: (share * split.toA) / 100, toB: (share * split.toB) / 100, abstention: (share * split.abstention) / 100 }
  }

  /** Report d'une part `share` de l'électorat d'un candidat simulé, d'après son bloc ou son finaliste. */
  const flowOf = (candidateId: CandidateId, share: number) => {
    const finalist = [a, b].find((e) => e.members.some((m) => m.candidateId === candidateId))
    const member = finalist?.members.find((m) => m.candidateId === candidateId)
    if (!finalist || !member) return blocTransfer(share, bloc(candidateId))
    // Leader : rate = 1. Rallié : part qui a suivi le leader au 1er tour, part RN (vers l'autre
    // finaliste s'il est RN), et part abstentionniste au 1er tour qui se reporte comme son bloc.
    const other = finalist === a ? b : a
    const follow = share * member.rate * fidelity
    const toRN = isRN(other) ? share * member.rnRate : 0
    const back = blocTransfer(share * Math.max(0, 1 - member.rate - member.rnRate), bloc(candidateId))
    const loyalAbstention = share * member.rate * (1 - fidelity) + (isRN(other) ? 0 : share * member.rnRate)
    return {
      toA: (finalist === a ? follow : toRN) + back.toA,
      toB: (finalist === b ? follow : toRN) + back.toB,
      abstention: loyalAbstention + back.abstention,
    }
  }

  const raw: VoteFlow[] = Object.entries(electorate).map(([candidateId, share]) => {
    const isFinalistVoter = [a, b].some((e) => e.members.some((m) => m.candidateId === candidateId))
    const like = isFinalistVoter ? undefined : input.minorTransfers?.[candidateId]
    const flow = { candidateId, share, bloc: bloc(candidateId), isFinalistVoter }
    if (!like) return { ...flow, ...flowOf(candidateId, share) }
    const parts = like.map((p) => flowOf(p.id, share * p.weight))
    const sum = (key: 'toA' | 'toB' | 'abstention') => parts.reduce((s, f) => s + f[key], 0)
    return { ...flow, toA: sum('toA'), toB: sum('toB'), abstention: sum('abstention'), like }
  })

  const uncalibrated = raw.reduce((s, f) => s + f.abstention, 0)
  const factor = abstentionTarget === null ? 1 : uncalibrated > 0 ? abstentionTarget / uncalibrated : 0
  const flows =
    abstentionTarget === null ? raw : raw.map((f) => calibrate(f, factor, uncalibrated, abstentionTarget))

  const votes = flows.reduce(
    (acc, f) => ({ a: acc.a + f.toA, b: acc.b + f.toB, abstention: acc.abstention + f.abstention }),
    { a: 0, b: 0, abstention: 0 },
  )
  const expressed = votes.a + votes.b
  const pct = expressed > 0 ? { a: (votes.a * 100) / expressed, b: (votes.b * 100) / expressed } : { a: 50, b: 50 }

  const duelIds = new Set([a.id, b.id])
  const directPolls = input.secondRoundPolls
    .filter((p) => {
      const ids = Object.keys(p.scores)
      return ids.length === 2 && ids.every((id) => duelIds.has(id))
    })
    .sort((x, y) => y.fieldwork.end.localeCompare(x.fieldwork.end))

  return {
    a: a.id,
    b: b.id,
    duel,
    votes,
    pct,
    flows,
    fidelity,
    abstention: { uncalibrated, target: abstentionTarget, factor },
    directPolls,
  }
}

function calibrate(f: VoteFlow, factor: number, uncalibrated: number, target: number): VoteFlow {
  const expressedRaw = f.toA + f.toB
  // Sans abstention dans les taux bruts, la cible s'applique uniformément à tous les électorats.
  const wanted = uncalibrated > 0 ? f.abstention * factor : (f.share * target) / 100
  const abstention = expressedRaw > 0 ? Math.min(f.share, wanted) : f.share
  const expressed = f.share - abstention
  return {
    ...f,
    abstention,
    toA: expressedRaw > 0 ? (expressed * f.toA) / expressedRaw : 0,
    toB: expressedRaw > 0 ? (expressed * f.toB) / expressedRaw : 0,
  }
}
