import { ELECTION_WEIGHTS, PAST_YEARS } from './pastElections'
import type { PastYear } from './pastElections'
import type { Bloc, CandidateId, PastElectionReference } from './types'

/**
 * Hausse de participation annoncée par le billet d'Eliot Thibault : la part des électeurs certains d'aller
 * voter gagne 7 points sur 2021 (77 % contre 70 % selon l'Ifop, chiffres cités par le billet et non
 * revérifiés ici). Elle est retenue telle quelle, en points d'inscrits, à 100 % d'intensité.
 */
export const BLOG_TURNOUT_RISE = 7

/** Source du profil des électeurs qui reviennent voter. */
export const TURNOUT_PROFILE_SOURCE = {
  label: 'Ifop-Fiducial – Sondage jour du vote, 1er tour de la présidentielle 2022 (10/04/2022), p. 29',
  url: 'https://www.ifop.com/wp-content/uploads/2022/04/118997-Rapport-JDV-PRE22-T1-DET-11.04-1.pdf',
}

/**
 * Vote au 1er tour 2022 (% des exprimés) de l'ensemble des votants et des votants qui s'étaient abstenus
 * au 1er tour 2017 (Ifop-Fiducial, sondage jour du vote). Ces derniers sont le meilleur indice disponible
 * du vote d'abstentionnistes qui reviennent aux urnes : quelques centaines de répondants, d'où une marge
 * d'erreur de plusieurs points.
 */
export const TURNOUT_PROFILE_2022: Record<'all' | 'abstainers2017', Record<string, number>> = {
  all: {
    arthaud: 0.6,
    poutou: 0.8,
    roussel: 2.3,
    melenchon: 22,
    hidalgo: 1.7,
    jadot: 4.6,
    macron: 27.5,
    pecresse: 4.8,
    'dupont-aignan': 2.1,
    lepen: 23.3,
    zemmour: 7.1,
    lassalle: 3.2,
  },
  abstainers2017: {
    arthaud: 1,
    poutou: 3,
    roussel: 3,
    melenchon: 28,
    hidalgo: 3,
    jadot: 6,
    macron: 14,
    pecresse: 2,
    'dupont-aignan': 3,
    lepen: 25,
    zemmour: 5,
    lassalle: 7,
  },
}

/** Candidats de 2022 par bloc, classés comme ceux de 2027. Lassalle, inclassable, est laissé de côté. */
export const TURNOUT_BLOCS_2022: Record<Bloc, string[]> = {
  gauche: ['arthaud', 'poutou', 'roussel', 'melenchon', 'hidalgo', 'jadot'],
  centre: ['macron'],
  droite: ['pecresse'],
  extreme_droite: ['dupont-aignan', 'lepen', 'zemmour'],
}

const BLOCS = Object.keys(TURNOUT_BLOCS_2022) as Bloc[]

/** Part de chaque bloc (0 à 1) dans un profil de vote, ramenée à 100 sans les candidats hors bloc (Lassalle). */
export function blocShares(scores: Record<string, number>): Record<Bloc, number> {
  const byBloc = BLOCS.map((b) => TURNOUT_BLOCS_2022[b].reduce((s, id) => s + (scores[id] ?? 0), 0))
  const total = byBloc.reduce((s, v) => s + v, 0)
  return Object.fromEntries(BLOCS.map((b, i) => [b, total > 0 ? byBloc[i]! / total : 0])) as Record<Bloc, number>
}

/**
 * Affinité de chaque bloc avec les électeurs qui reviennent voter : sa part chez les abstentionnistes de
 * 2017 ÷ sa part chez l'ensemble des votants de 2022. Au-dessus de 1, le bloc gagne à la hausse de
 * participation.
 */
export function turnoutAffinity(profile = TURNOUT_PROFILE_2022): Record<Bloc, number> {
  const all = blocShares(profile.all)
  const returning = blocShares(profile.abstainers2017)
  return Object.fromEntries(BLOCS.map((b) => [b, all[b] > 0 ? returning[b] / all[b] : 1])) as Record<Bloc, number>
}

/**
 * Participation de référence au 1er tour (% des inscrits) : moyenne de 2017 et 2022, pondérée comme les
 * écarts de « Corriger la moyenne ». C'est la participation que reflètent les sondages corrigés.
 */
export function baseTurnout(refs: Partial<Record<PastYear, Pick<PastElectionReference, 'registered' | 'voters'>>>) {
  let weights = 0
  let sum = 0
  for (const year of PAST_YEARS) {
    const r = refs[year]
    if (!r || r.registered <= 0) continue
    weights += ELECTION_WEIGHTS[year]
    sum += (ELECTION_WEIGHTS[year] * r.voters * 100) / r.registered
  }
  return weights > 0 ? sum / weights : null
}

export interface TurnoutModel {
  /** Participation de référence (% des inscrits). */
  base: number
  /** Affinité de chaque bloc avec les électeurs qui reviennent voter. */
  affinity: Record<Bloc, number>
}

/**
 * Facteur de chaque candidat quand `rise` points d'inscrits s'ajoutent aux `base` points de votants : les
 * nouveaux votants se répartissent comme les votants actuels, pondérés par l'affinité de leur bloc (1 sans
 * bloc). f = (base + rise × k ÷ K) ÷ (base + rise), où K est l'affinité moyenne des votants actuels : le
 * total des scores est conservé.
 */
export function turnoutFactors(
  scores: Record<CandidateId, number>,
  blocOf: (id: CandidateId) => Bloc | undefined,
  model: TurnoutModel,
  rise: number,
): Record<CandidateId, number> {
  const ids = Object.keys(scores)
  const k = (id: CandidateId) => {
    const bloc = blocOf(id)
    return bloc ? model.affinity[bloc] : 1
  }
  const total = ids.reduce((s, id) => s + Math.max(0, scores[id]!), 0)
  const mean = total > 0 ? ids.reduce((s, id) => s + Math.max(0, scores[id]!) * k(id), 0) / total : 0
  if (rise <= 0 || mean <= 0 || model.base + rise <= 0) return Object.fromEntries(ids.map((id) => [id, 1]))
  return Object.fromEntries(ids.map((id) => [id, (model.base + (rise * k(id)) / mean) / (model.base + rise)]))
}
