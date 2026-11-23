import { daysBetween } from './pollAverage'
import { blendProfiles, blocRow, nonRnSplit } from './transfers'
import type { ProfileTable } from './transfers'
import type {
  Aggregated2024Profile,
  Bloc,
  Candidate,
  CandidateId,
  FidelitySplit,
  NoIntention,
  PollBiasGap,
  PresidentialDuel,
  Reference2017,
  Reference2022,
  ReferencePart,
  ResolvedDuel,
  SecondRoundPoll,
  SecondRoundPollBiasData,
  SecondRoundResult,
  TransfersData,
  VoteFlow,
} from './types'

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/**
 * Part des électeurs exprimés du 1er tour qui ne s'expriment pas au 2nd tour (blancs, nuls,
 * abstention) : 1 − exprimés du 2nd tour ÷ exprimés du 1er tour.
 */
export function secondRoundDropout(ref: Reference2017 | Reference2022): number {
  return 100 * (1 - ref.secondRound.expressed / ref.expressed)
}

/** Abandon net d'un 2nd tour présidentiel d'une année passée (peut être négatif : 2002). */
export function presidentialDropout(e: PresidentialDuel): number {
  return 100 * (1 - e.secondRound.expressed / e.firstRound.expressed)
}

/** Abandon net agrégé d'un type de duel aux législatives 2024. */
export function aggregatedProfileDropout(p: Pick<Aggregated2024Profile, 'firstRoundExpressed' | 'secondRoundExpressed'>): number {
  return 100 * (1 - p.secondRoundExpressed / p.firstRoundExpressed)
}

/** Demi-largeur (jours) de la fenêtre de distance au 1er tour pour comparer les sondages de 2nd tour. */
export const POLL_BIAS_WINDOW_DAYS = 20

/**
 * Écart historique des sondages de 2nd tour : pour chaque année, moyenne des sondages Macron – Le Pen dont
 * la fin de terrain est à la même distance du 1er tour que la base 2027 (± 20 jours) ; faute de sondage dans
 * la fenêtre, le plus proche. Écart = résultat − moyenne, en points, pour le candidat opposé au RN. Cet écart
 * est affiché, jamais appliqué au calcul : il mesure un biais passé des sondages, il ne s'y aligne pas.
 */
export function pollBiasGaps(
  data: SecondRoundPollBiasData,
  polls: { asOf: string; electionDate: string },
): PollBiasGap[] {
  const distance = daysBetween(polls.asOf, polls.electionDate)
  return data.elections.flatMap((e) => {
    const dated = e.polls.map((p) => ({ p, gap: Math.abs(daysBetween(p.end, e.electionDate) - distance) }))
    if (dated.length === 0) return []
    const inWindow = dated.filter((d) => d.gap <= POLL_BIAS_WINDOW_DAYS)
    const nearest = inWindow.length > 0 ? null : dated.reduce((best, d) => (d.gap < best.gap ? d : best))
    const estimate = nearest
      ? nearest.p.antiRn
      : inWindow.reduce((t, d) => t + d.p.antiRn, 0) / inWindow.length
    return [
      {
        year: e.year,
        duel: e.duel,
        pollCount: inWindow.length,
        estimate,
        nearest: nearest
          ? { institute: nearest.p.institute, end: nearest.p.end, distance: daysBetween(nearest.p.end, e.electionDate) }
          : null,
        result: e.result.antiRn,
        gap: e.result.antiRn - estimate,
      },
    ]
  })
}

/**
 * RMSE historique (en points) des sondages directs de 2nd tour : écart quadratique moyen entre le score
 * publié du candidat opposé au RN et le résultat, sur tous les sondages des élections de
 * `second-round-poll-bias.json` dont la fin de terrain est à la même distance du 1er tour que la base 2027
 * (± `POLL_BIAS_WINDOW_DAYS`) ; faute de sondage dans la fenêtre pour une élection, le plus proche.
 * Calculé depuis les données, sans constante. Undefined si aucune donnée.
 */
export function directPollRmse(
  data: SecondRoundPollBiasData,
  polls: { asOf: string; electionDate: string },
): { rmse: number; count: number } | undefined {
  const distance = daysBetween(polls.asOf, polls.electionDate)
  const errors: number[] = []
  for (const e of data.elections) {
    const dated = e.polls.map((p) => ({ p, gap: Math.abs(daysBetween(p.end, e.electionDate) - distance) }))
    if (dated.length === 0) continue
    const inWindow = dated.filter((d) => d.gap <= POLL_BIAS_WINDOW_DAYS)
    const used = inWindow.length > 0 ? inWindow : [dated.reduce((best, d) => (d.gap < best.gap ? d : best))]
    for (const d of used) errors.push(d.p.antiRn - e.result.antiRn)
  }
  if (errors.length === 0) return undefined
  return { rmse: Math.sqrt(errors.reduce((t, x) => t + x * x, 0) / errors.length), count: errors.length }
}

export interface DirectPollGapAlert {
  /** Moyenne des sondages directs pour le candidat A (points). */
  pollMean: number
  /** Écart modèle − sondages pour A (points). */
  gap: number
  /** Seuil = 2 × RMSE historique (points). */
  threshold: number
  exceeded: boolean
}

/** Alerte si le score modèle de A s'écarte de la moyenne des sondages directs de plus de 2 × RMSE historique. */
export function directPollGapAlert(
  modelA: number,
  polls: { scores: Record<CandidateId, number> }[],
  a: CandidateId,
  rmse: number | undefined,
): DirectPollGapAlert | null {
  const values = polls.map((p) => p.scores[a]).filter((v): v is number => typeof v === 'number')
  if (values.length === 0 || rmse === undefined || !Number.isFinite(rmse)) return null
  const pollMean = values.reduce((t, v) => t + v, 0) / values.length
  const gap = modelA - pollMean
  const threshold = 2 * rmse
  return { pollMean, gap, threshold, exceeded: Math.abs(gap) > threshold }
}

export type ImplicitNoIntention =
  | { kind: 'ok'; share: number }
  | { kind: 'impossible'; reason: 'no-room' | 'out-of-range'; share: number | null }

/**
 * Comportement implicite des personnes sans intention de vote : score q (0–100) que le modèle suppose
 * pour A parmi ceux qui votent sans avoir déclaré d'intention. Formule (m·E − p·I)/(E − I), avec m le score
 * modèle de A, p son score publié, E la part de la base qui s'exprime au 2nd tour et I la part de la base
 * ayant une intention (100 − sans-intention). Base « inscrits » : E = exprimés du 2nd tour (% des inscrits) ;
 * base « votants » : E = 100 (approximation : blancs et nuls négligés). Undefined si la base est absente.
 */
export function implicitNoIntention(
  modelA: number,
  pollA: number,
  noIntention: Pick<NoIntention, 'share' | 'base'> | undefined,
  expressed2: number,
): ImplicitNoIntention | undefined {
  if (!noIntention || !(noIntention.base === 'inscrits' || noIntention.base === 'votants')) return undefined
  const s = noIntention.share
  if (![modelA, pollA, s, expressed2].every(Number.isFinite) || s < 0 || s > 100) return undefined
  const I = 100 - s
  const E = noIntention.base === 'inscrits' ? expressed2 : 100
  if (E - I <= 1e-9) return { kind: 'impossible', reason: 'no-room', share: null }
  const q = (modelA * E - pollA * I) / (E - I)
  if (q < 0 || q > 100) return { kind: 'impossible', reason: 'out-of-range', share: q }
  return { kind: 'ok', share: q }
}

/**
 * Fourchette de la part des personnes interrogées sans intention de vote : la plus basse et la plus haute
 * de tous les duels qui la renseignent, tous instituts et toutes bases confondus. Undefined si aucun.
 */
export function noIntentionRange(
  polls: SecondRoundPoll[],
): { min: number; max: number; polls: SecondRoundPoll[] } | undefined {
  const measured = polls.filter((p) => p.noIntention)
  if (measured.length === 0) return undefined
  const shares = measured.map((p) => p.noIntention!.share)
  return { min: Math.min(...shares), max: Math.max(...shares), polls: measured }
}

export interface SecondRoundInput {
  /** Scores de 1er tour (% des suffrages exprimés, total 100). */
  electorate: Record<CandidateId, number>
  a: CandidateId
  b: CandidateId
  duel: ResolvedDuel
  profiles: ProfileTable
  nonRnPresidential: TransfersData['nonRnPresidential']
  fidelityA: FidelitySplit
  fidelityB: FidelitySplit
  candidatesById: Map<CandidateId, Candidate>
  /** Participation au 1er tour (% des inscrits, ex. 74). */
  firstRoundTurnout: number
  /** Part des blancs et nuls parmi les votants du 1er tour (0 à 1, ex. ~0,022). */
  blankNullShare: number
  /** Part des abstentionnistes du 1er tour qui votent valablement au 2nd tour (0 à 1, ex. 0,20). */
  abstainerMobilization: number
  /** Part des nouveaux votants allant à l'adversaire du RN (0 à 1, ex. 0,55 ; 0,50 hors duel RN). */
  abstainerAntiRnShare: number
  /** Force du front républicain appliquée à ce duel (0 à 1), ou null hors duel RN (informatif). */
  republicanFrontStrength?: number | null
  secondRoundPolls: SecondRoundPoll[]
  /** Petits candidats : électorats principaux dont leurs électeurs suivent les reports (poids de total 1). */
  minorTransfers?: Record<CandidateId, ReferencePart[]>
}

/**
 * Moteur unifié du 2nd tour en flux bruts (% des inscrits) :
 * - Chaque électorat exprimé du 1er tour (taille `x_c × E1 / 100`) applique directement ses taux de report
 *   individuels (fidélité différenciée pour les finalistes, enquête 2024 / mélange présidentiel / déclarations
 *   logit pour les éliminés). Aucun recalibrage post-hoc par camp ni soustraction uniforme `u = N / X`.
 * - Les abstentionnistes du 1er tour (`100 − P`) se mobilisent à hauteur de `abstainerMobilization` et se
 *   répartissent selon `abstainerAntiRnShare` (duel face au RN) ou 50/50 (duel hors RN).
 * - Identité comptable exacte : `totals.a + totals.b + totals.nonExpressed + blankNull1 = 100 %` des inscrits.
 * - Score final en % des suffrages exprimés : `V_A / (V_A + V_B)`.
 */
export function computeSecondRound(input: SecondRoundInput): SecondRoundResult {
  const {
    electorate,
    a,
    b,
    duel,
    profiles,
    nonRnPresidential,
    fidelityA,
    fidelityB,
    candidatesById,
    firstRoundTurnout,
    blankNullShare,
    abstainerMobilization,
    abstainerAntiRnShare,
  } = input

  const participation = clamp(firstRoundTurnout, 1, 100)
  const abstention1 = 100 - participation
  const blankNull1 = participation * clamp(blankNullShare, 0, 0.5)
  const expressed1 = participation - blankNull1
  const scale = expressed1 / 100

  const blocOf = (id: CandidateId): Bloc | null => candidatesById.get(id)?.bloc ?? null
  const blended = duel.kind === 'rn-sourced' ? blendProfiles(profiles, duel.profileWeights) : null
  const challengerIsA = duel.challengerId === a

  const blocTransfer = (share: number, voterBloc: Bloc | null) => {
    if (blended) {
      const row = blocRow(blended, voterBloc)
      const toChallenger = (share * row.finalist) / 100
      const toRN = (share * row.rn) / 100
      return {
        toA: challengerIsA ? toChallenger : toRN,
        toB: challengerIsA ? toRN : toChallenger,
        abstention: (share * row.abstention) / 100,
      }
    }
    const split = nonRnSplit(voterBloc, blocOf(a), blocOf(b), nonRnPresidential)
    return {
      toA: (share * split.toA) / 100,
      toB: (share * split.toB) / 100,
      abstention: (share * split.abstention) / 100,
    }
  }

  const flowOf = (candidateId: CandidateId, share: number) => {
    if (candidateId === a) {
      return {
        toA: (share * fidelityA.loyal) / 100,
        toB: (share * fidelityA.cross) / 100,
        abstention: (share * fidelityA.abstention) / 100,
      }
    }
    if (candidateId === b) {
      return {
        toA: (share * fidelityB.cross) / 100,
        toB: (share * fidelityB.loyal) / 100,
        abstention: (share * fidelityB.abstention) / 100,
      }
    }
    return blocTransfer(share, blocOf(candidateId))
  }

  const flows: VoteFlow[] = Object.entries(electorate).map(([candidateId, firstRoundPct]) => {
    const share = firstRoundPct * scale
    const isFinalistVoter = candidateId === a || candidateId === b
    const like = isFinalistVoter ? undefined : input.minorTransfers?.[candidateId]
    const base = { candidateId, share, firstRoundPct, bloc: blocOf(candidateId), isFinalistVoter }
    if (!like) return { ...base, ...flowOf(candidateId, share) }
    const parts = like.map((p) => flowOf(p.id, share * p.weight))
    const sum = (key: 'toA' | 'toB' | 'abstention') => parts.reduce((s, f) => s + f[key], 0)
    return { ...base, toA: sum('toA'), toB: sum('toB'), abstention: sum('abstention'), like }
  })

  const mob = clamp(abstainerMobilization, 0, 1)
  const newVoters = abstention1 * mob
  const qAntiRn = clamp(abstainerAntiRnShare, 0, 1)
  const qA = duel.kind === 'rn-sourced' ? (challengerIsA ? qAntiRn : 1 - qAntiRn) : 0.5
  const abstainers = {
    volume: abstention1,
    toA: newVoters * qA,
    toB: newVoters * (1 - qA),
    nonExpressed: abstention1 - newVoters,
  }

  const sumFlows = (key: 'toA' | 'toB' | 'abstention') => flows.reduce((t, f) => t + f[key], 0)
  const totals = {
    a: sumFlows('toA') + abstainers.toA,
    b: sumFlows('toB') + abstainers.toB,
    nonExpressed: sumFlows('abstention') + abstainers.nonExpressed,
  }
  const expressed2 = totals.a + totals.b
  const pct =
    expressed2 > 0 ? { a: (100 * totals.a) / expressed2, b: (100 * totals.b) / expressed2 } : { a: 50, b: 50 }
  const netDropout = expressed1 > 0 ? 100 * (1 - expressed2 / expressed1) : 0

  const duelIds = new Set([a, b])
  const directPolls = input.secondRoundPolls
    .filter((p) => {
      const ids = Object.keys(p.scores)
      return ids.length === 2 && ids.every((id) => duelIds.has(id))
    })
    .sort((x, y) => y.fieldwork.end.localeCompare(x.fieldwork.end))

  return {
    a,
    b,
    duel,
    pct,
    participation,
    abstention1,
    blankNull1,
    expressed1,
    expressed2,
    scale,
    newVoters,
    flows,
    abstainers,
    blankNull: { volume: blankNull1 },
    totals,
    fidelity: { a: fidelityA, b: fidelityB },
    effectiveAbstainerAntiRnShare: duel.kind === 'rn-sourced' ? qAntiRn : 0.5,
    republicanFrontStrength: duel.kind === 'rn-sourced' ? (input.republicanFrontStrength ?? null) : null,
    netDropout,
    directPolls,
  }
}
