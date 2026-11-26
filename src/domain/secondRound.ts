import { daysBetween } from './pollAverage'
import { blendProfiles, blocRow, nonRnSplit } from './transfers'
import type { ProfileTable } from './transfers'
import type {
  Aggregated2024Profile,
  BetweenRoundsElectionSummary,
  Bloc,
  Candidate,
  CandidateId,
  FidelitySplit,
  LegislativeDuelMatch,
  LegislativeDuelPolls2024Data,
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
    const dated = e.polls
      .filter((p) => p.phase === 'avantPremierTour')
      .map((p) => ({ p, gap: Math.abs(daysBetween(p.end, e.electionDate) - distance) }))
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
 * publié du candidat opposé au RN et le résultat, sur tous les sondages `avantPremierTour` des élections de
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
    const dated = e.polls
      .filter((p) => p.phase === 'avantPremierTour')
      .map((p) => ({ p, gap: Math.abs(daysBetween(p.end, e.electionDate) - distance) }))
    if (dated.length === 0) continue
    const inWindow = dated.filter((d) => d.gap <= POLL_BIAS_WINDOW_DAYS)
    const used = inWindow.length > 0 ? inWindow : [dated.reduce((best, d) => (d.gap < best.gap ? d : best))]
    for (const d of used) errors.push(d.p.antiRn - e.result.antiRn)
  }
  if (errors.length === 0) return undefined
  return { rmse: Math.sqrt(errors.reduce((t, x) => t + x * x, 0) / errors.length), count: errors.length }
}

/**
 * Synthèse descriptive des sondages publiés entre les deux tours (phase `entreDeuxTours`) en 2017 et 2022,
 * jusqu'aux derniers sondages avant l'interdiction légale. Affichage pour mémoire uniquement : jamais utilisé
 * dans un calcul, ni dans `pollBiasGaps` ni dans `directPollRmse`.
 */
export function betweenRoundsSummaries(data: SecondRoundPollBiasData): BetweenRoundsElectionSummary[] {
  return data.elections.flatMap((e) => {
    const polls = e.polls
      .filter((p) => p.phase === 'entreDeuxTours')
      .slice()
      .sort((x, y) => y.end.localeCompare(x.end))
    if (polls.length === 0) return []
    const meanAntiRn = polls.reduce((t, p) => t + p.antiRn, 0) / polls.length
    const lastDayDate = polls[0]!.end
    const lastDay = polls.filter((p) => p.end === lastDayDate)
    const lastDayMeanAntiRn = lastDay.reduce((t, p) => t + p.antiRn, 0) / lastDay.length
    return [
      {
        year: e.year,
        duel: e.duel,
        electionDate: e.electionDate,
        secondRoundDate: e.secondRoundDate,
        result: e.result,
        listSource: e.listSource,
        polls,
        pollCount: polls.length,
        meanAntiRn,
        meanGap: e.result.antiRn - meanAntiRn,
        lastDayDate,
        lastDayCount: lastDay.length,
        lastDayMeanAntiRn,
        lastDayGap: e.result.antiRn - lastDayMeanAntiRn,
      },
    ]
  })
}

/**
 * Règle d'identité stricte (P4) : retourne les sondages de circonscription d'entre-deux-tours des
 * législatives 2024 (duels uniquement) dont la paire non ordonnée de partis est strictement identique
 * à celle du duel affiché `(a, b)`. La correspondance candidat 2027 → parti est lue exclusivement dans
 * `data.candidateParties` (jamais déduite d'une coalition, d'une nuance officielle ou d'un profil de reports).
 * Un parti allié ou voisin (ex. Horizons vs Renaissance, ou allié RN vs RN) est strictement exclu.
 */
export function matchingLegislativeDuelPolls(
  data: LegislativeDuelPolls2024Data,
  a: CandidateId,
  b: CandidateId,
): LegislativeDuelMatch[] {
  const partyA = data.candidateParties[a] ?? null
  const partyB = data.candidateParties[b] ?? null
  if (!partyA || !partyB || partyA === partyB) return []

  const matches: LegislativeDuelMatch[] = []
  for (const poll of data.polls) {
    if (poll.candidates.length !== 2) continue
    const [c1, c2] = poll.candidates
    if (c1.party === partyA && c2.party === partyB) {
      matches.push({ poll, candidateA: c1, candidateB: c2, gapA: c1.officialScore - c1.pollScore })
    } else if (c1.party === partyB && c2.party === partyA) {
      matches.push({ poll, candidateA: c2, candidateB: c1, gapA: c2.officialScore - c2.pollScore })
    }
  }
  return matches.sort((x, y) => y.poll.fieldwork.end.localeCompare(x.poll.fieldwork.end))
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
  /** Part des non-exprimés du 1er tour (abstention + blancs/nuls) qui votent valablement au 2nd tour (0 à 1, ex. 0,225). */
  abstainerMobilization: number
  /** Part manuelle des nouveaux votants allant à l'adversaire du RN (0 à 1), ou null = mode endogène neutre (S2). */
  abstainerAntiRnShare: number | null
  /** Force du front républicain appliquée à ce duel (0 à 1), ou null hors duel RN (informatif). */
  republicanFrontStrength?: number | null
  secondRoundPolls: SecondRoundPoll[]
  /** Petits candidats : électorats principaux dont leurs électeurs suivent les reports (poids de total 1). */
  minorTransfers?: Record<CandidateId, ReferencePart[]>
}

/**
 * Moteur unifié du 2nd tour en flux bruts (% des inscrits, refonte P1-bis S1–S4) :
 * - Chaque électorat exprimé du 1er tour (taille `x_c × E1 / 100`) applique directement ses taux de report
 *   individuels (fidélité symétrique neutre en mode historique, enquête 2024 / mélange présidentiel / déclarations
 *   logit pour les éliminés). Aucun recalibrage post-hoc par camp ni soustraction uniforme `u = N / X`.
 * - Les non-exprimés du 1er tour (`abstention1 + blankNull1 = 100 − E1`) se mobilisent à hauteur de
 *   `abstainerMobilization` (S1) et suivent par défaut (`abstainerAntiRnShare = null`) le partage T2 des
 *   électeurs exprimés du 1er tour (mode endogène neutre S2), sauf surcharge manuelle face au RN.
 * - Identité comptable exacte : `totals.a + totals.b + totals.nonExpressed = 100 %` des inscrits.
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

  const sumFlows = (key: 'toA' | 'toB' | 'abstention') => flows.reduce((t, f) => t + f[key], 0)
  const r1ToA = sumFlows('toA')
  const r1ToB = sumFlows('toB')
  const r1Expr2 = r1ToA + r1ToB
  const qNeutralA = r1Expr2 > 0 ? r1ToA / r1Expr2 : 0.5

  const mob = clamp(abstainerMobilization, 0, 1)
  const manualAntiRn =
    duel.kind === 'rn-sourced' && abstainerAntiRnShare !== null ? clamp(abstainerAntiRnShare, 0, 1) : null
  const qA = manualAntiRn !== null ? (challengerIsA ? manualAntiRn : 1 - manualAntiRn) : qNeutralA
  const effectiveAntiRnShare = duel.kind === 'rn-sourced' ? (challengerIsA ? qA : 1 - qA) : qA

  const absNewVoters = abstention1 * mob
  const bnNewVoters = blankNull1 * mob
  const newVoters = absNewVoters + bnNewVoters

  const abstainers = {
    volume: abstention1,
    toA: absNewVoters * qA,
    toB: absNewVoters * (1 - qA),
    nonExpressed: abstention1 - absNewVoters,
  }
  const blankNull = {
    volume: blankNull1,
    toA: bnNewVoters * qA,
    toB: bnNewVoters * (1 - qA),
    nonExpressed: blankNull1 - bnNewVoters,
  }

  const totals = {
    a: r1ToA + abstainers.toA + blankNull.toA,
    b: r1ToB + abstainers.toB + blankNull.toB,
    nonExpressed: sumFlows('abstention') + abstainers.nonExpressed + blankNull.nonExpressed,
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
    blankNull,
    totals,
    fidelity: { a: fidelityA, b: fidelityB },
    effectiveAbstainerAntiRnShare: effectiveAntiRnShare,
    republicanFrontStrength: duel.kind === 'rn-sourced' ? (input.republicanFrontStrength ?? null) : null,
    netDropout,
    directPolls,
  }
}
