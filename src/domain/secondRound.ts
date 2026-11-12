import { daysBetween } from './pollAverage'
import { blendProfiles, blocRow, fallbackSplit } from './transfers'
import type { ProfileTable } from './transfers'
import type {
  Bloc,
  Candidate,
  CandidateId,
  Entrant,
  CampRates,
  DropoutProfile,
  PollBiasGap,
  PresidentialDuel,
  Reference2017,
  Reference2022,
  SecondRoundDropoutData,
  SecondRoundPollBiasData,
  ReferencePart,
  ResolvedDuel,
  SecondRoundPoll,
  SecondRoundResult,
  TransfersData,
  VoteFlow,
} from './types'

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

/** Somme des exprimés des deux tours dans les circonscriptions d'un profil. */
export function profileTotals(p: Pick<DropoutProfile, 'constituencies'>) {
  return p.constituencies.reduce(
    (t, c) => ({ first: t.first + c.firstRoundExpressed, second: t.second + c.secondRoundExpressed }),
    { first: 0, second: 0 },
  )
}

/** Abandon net des duels d'un profil aux législatives 2024, calculé depuis les sommes d'exprimés. */
export function profileDropout(p: Pick<DropoutProfile, 'constituencies'>): number {
  const { first, second } = profileTotals(p)
  return 100 * (1 - second / first)
}

/** Estimation (%) et erreur type d'un taux d'abandon. */
export interface RateEstimate {
  value: number
  se: number
}

/**
 * Où tombe l'abandon : régression écologique (Goodman) sur les circonscriptions d'un profil. L'abandon net
 * y = 1 − exprimés du 2nd tour ÷ exprimés du 1er tour s'explique par la part x des blocs des deux
 * finalistes et celle (1 − x) des autres blocs, aux moindres carrés sans constante, chaque circonscription
 * pesant 1 : y = camp × x + autres × (1 − x). Les valeurs sont brutes (elles peuvent être négatives) ;
 * l'erreur type vient de s² = SCR ÷ (n − 2) et de la diagonale de (X'X)⁻¹. Comportements déduits d'agrégats :
 * c'est une inférence écologique, pas une mesure sur des individus.
 */
export function campDropout(p: Pick<DropoutProfile, 'constituencies' | 'finalistBlocs'>): {
  camp: RateEstimate
  others: RateEstimate
} {
  const rows = p.constituencies.map((c) => {
    const total = Object.values(c.firstRoundVotesByBloc).reduce((t, v) => t + v, 0)
    const inCamp = p.finalistBlocs.reduce((t, b) => t + c.firstRoundVotesByBloc[b], 0)
    const x = total > 0 ? inCamp / total : 0
    return { x, z: 1 - x, y: 1 - c.secondRoundExpressed / c.firstRoundExpressed }
  })
  const sxx = rows.reduce((t, r) => t + r.x * r.x, 0)
  const sxz = rows.reduce((t, r) => t + r.x * r.z, 0)
  const szz = rows.reduce((t, r) => t + r.z * r.z, 0)
  const sxy = rows.reduce((t, r) => t + r.x * r.y, 0)
  const szy = rows.reduce((t, r) => t + r.z * r.y, 0)
  const det = sxx * szz - sxz * sxz
  const camp = (szz * sxy - sxz * szy) / det
  const others = (sxx * szy - sxz * sxy) / det
  const ssr = rows.reduce((t, r) => t + (r.y - camp * r.x - others * r.z) ** 2, 0)
  const s2 = ssr / (rows.length - 2)
  return {
    camp: { value: 100 * camp, se: 100 * Math.sqrt((s2 * szz) / det) },
    others: { value: 100 * others, se: 100 * Math.sqrt((s2 * sxx) / det) },
  }
}

/**
 * Taux d'abandon d'un duel selon les électorats : moyenne des taux de ses profils de reports 2024, pondérée
 * par `profileWeights`, chaque taux borné à 0 (une estimation négative n'a pas de sens). Null pour un duel
 * sans profil sourcé, ou si les deux taux sont nuls (le calage uniforme prend alors le relais).
 */
export function duelCampRates(duel: ResolvedDuel, data: SecondRoundDropoutData): CampRates | null {
  const { profiles } = data.legislatives2024
  const parts = duel.kind === 'sourced' ? duel.profileWeights.filter((w) => profiles[w.profileId]) : []
  const total = parts.reduce((s, w) => s + w.weight, 0)
  if (total <= 0) return null
  const rates = parts.reduce(
    (acc, w) => {
      const e = campDropout(profiles[w.profileId])
      return {
        camp: acc.camp + (w.weight * Math.max(0, e.camp.value)) / total,
        others: acc.others + (w.weight * Math.max(0, e.others.value)) / total,
      }
    },
    { camp: 0, others: 0 },
  )
  return rates.camp > 0 || rates.others > 0 ? rates : null
}

/**
 * Abandon des duels sans FN ni RN : moyenne simple des seconds tours présidentiels concernés (2007 et
 * 2012). C'est l'estimation de repli, pour un duel que les reports de 2024 ne couvrent pas.
 */
export function noRnDropout(data: SecondRoundDropoutData): number {
  const rows = data.presidential.elections.filter((e) => !e.rn)
  return rows.reduce((s, e) => s + presidentialDropout(e), 0) / rows.length
}

/**
 * Abandon attendu pour un duel : celui de son profil de reports aux législatives 2024, pondéré par
 * `profileWeights` quand l'alliance mêle plusieurs profils. Sans profil sourcé (duel de repli), c'est celui
 * des seconds tours présidentiels sans RN.
 */
export function duelDropout(duel: ResolvedDuel, data: SecondRoundDropoutData): number {
  const { profiles } = data.legislatives2024
  const parts = duel.kind === 'sourced' ? duel.profileWeights.filter((w) => profiles[w.profileId]) : []
  const total = parts.reduce((s, w) => s + w.weight, 0)
  if (total <= 0) return noRnDropout(data)
  return parts.reduce((s, w) => s + (w.weight * profileDropout(profiles[w.profileId])) / total, 0)
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
  /**
   * Total imposé de blancs, nuls et abstentions (points des électeurs du 1er tour). Null : pas de total
   * imposé, l'abandon est celui des taux par camp (si fournis), sinon les taux bruts.
   */
  abstentionTarget: number | null
  /** Taux d'abandon des électorats des blocs des finalistes et des autres blocs (2024, %). Active le mode « camps ». */
  campRates?: CampRates | null
  /** Électorats au taux du camp : de même bloc qu'un finaliste (défaut), ou seulement de sa famille (variante). */
  campScope?: 'bloc' | 'family'
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
 * Abandon, trois modes :
 * - « camps » (duel sourcé, taux 2024 fournis) : les électeurs d'un finaliste gardent leurs taux ; les autres
 *   électorats abandonnent au taux du « camp » s'ils sont de la famille d'un finaliste (même profil de duel
 *   que l'un de ses membres, ou extrême droite face à un finaliste RN), sinon à celui des autres blocs. Avec un total imposé, ces taux sont multipliés par un même coefficient pour
 *   l'atteindre, ce qui garde leur rapport. Le total est alors un résultat ;
 * - « uniform » : le taux d'abstention de chaque électorat est multiplié par un même coefficient pour que le
 *   total atteigne la cible (duel sans RN) ;
 * - « none » : taux bruts.
 * Dans tous les cas, les votes exprimés de chaque électorat gardent la répartition des taux de report.
 * Le résultat est exprimé en % des suffrages exprimés : A / (A + B).
 */
export function computeSecondRound(input: SecondRoundInput): SecondRoundResult {
  const { electorate, a, b, duel, profiles, fallback, candidatesById, fidelity, abstentionTarget } = input
  const bloc = (id: CandidateId) => candidatesById.get(id)!.bloc
  const blended = duel.kind === 'sourced' ? blendProfiles(profiles, duel.profileWeights) : null
  const challengerIsA = duel.challengerId === a.id

  const isRN = (e: Entrant) => e.members.some((m) => candidatesById.get(m.candidateId)?.isRN)
  /** Report des électeurs d'un bloc qui ne votaient pour aucun finaliste au 1er tour. */
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
  const rates = input.campRates && duel.kind === 'sourced' ? input.campRates : null
  // Camp d'un finaliste : par défaut, les électorats non finalistes de même bloc que l'un des membres des
  // deux finalistes. Variante « famille » : seulement ceux dont le candidat a le même profil de duel qu'un
  // membre d'un finaliste, plus l'extrême droite face à un finaliste RN (les autres candidats du même bloc
  // prennent le taux des autres blocs). En 2024 chaque camp n'avait qu'un candidat au 1er tour : le taux du
  // camp mesure surtout le comportement des propres électeurs du finaliste.
  // Un électorat non classé (bloc null) n'est du camp d'aucun finaliste.
  const campBlocs = new Set([a, b].flatMap((e) => e.members.flatMap((m) => bloc(m.candidateId) ?? [])))
  const finalistProfiles = new Set(
    [a, b].flatMap((e) => e.members.map((m) => candidatesById.get(m.candidateId)?.duelProfile)).filter(Boolean),
  )
  const rnFinal = isRN(a) || isRN(b)
  const inFamily = (id: CandidateId) =>
    input.campScope === 'family'
      ? finalistProfiles.has(candidatesById.get(id)?.duelProfile) || (rnFinal && bloc(id) === 'extreme_droite')
      : campBlocs.has(bloc(id)!)
  const rateFor = (id: CandidateId) => ((inFamily(id) ? rates!.camp : rates!.others) / 100)
  // Petit candidat (électeurs répartis entre plusieurs électorats, dont parfois un finaliste) : en variante
  // « famille », taux des autres électorats, faute de pouvoir le classer simplement ; sinon, son propre bloc.
  const campRate = (f: VoteFlow) =>
    f.isFinalistVoter ? 0 : f.like && input.campScope === 'family' ? rates!.others / 100 : rateFor(f.candidateId)
  const campMembers = rates ? raw.filter((f) => !f.isFinalistVoter && inFamily(f.candidateId)).map((f) => f.candidateId) : []
  const mobile = rates ? raw.reduce((t, f) => t + f.share * campRate(f), 0) : 0
  const fixed = raw.reduce((t, f) => t + (f.isFinalistVoter ? f.abstention : 0), 0)
  const mode: 'camps' | 'uniform' | 'none' =
    rates && (mobile > 0 || abstentionTarget === null) ? 'camps' : abstentionTarget === null ? 'none' : 'uniform'
  const factor =
    mode === 'camps'
      ? abstentionTarget === null
        ? 1
        : Math.max(0, abstentionTarget - fixed) / mobile
      : abstentionTarget === null
        ? 1
        : uncalibrated > 0
          ? abstentionTarget / uncalibrated
          : 0
  const flows =
    mode === 'camps'
      ? raw.map((f) => (f.isFinalistVoter ? f : withAbstention(f, Math.min(f.share, f.share * campRate(f) * factor))))
      : mode === 'uniform'
        ? raw.map((f) => calibrate(f, factor, uncalibrated, abstentionTarget!))
        : raw

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
    abstention: {
      uncalibrated,
      target: abstentionTarget,
      factor,
      mode,
      total: votes.abstention,
      camps: mode === 'camps' ? { members: campMembers, rates: rates! } : null,
    },
    directPolls,
  }
}

/** Fixe l'abstention d'un électorat ; ses exprimés gardent la répartition brute toA / toB. */
function withAbstention(f: VoteFlow, abstention: number): VoteFlow {
  const expressedRaw = f.toA + f.toB
  const wanted = expressedRaw > 0 ? abstention : f.share
  const expressed = f.share - wanted
  return {
    ...f,
    abstention: wanted,
    toA: expressedRaw > 0 ? (expressed * f.toA) / expressedRaw : 0,
    toB: expressedRaw > 0 ? (expressed * f.toB) / expressedRaw : 0,
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
