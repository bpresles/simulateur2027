import { daysBetween } from './pollAverage'
import type { Bloc, CandidateId, CertainShare, TurnoutBalance, TurnoutMeasure } from './types'

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

/** Écart de distance au scrutin (jours) au-delà duquel les mesures ne sont plus jugées comparables. */
export const TURNOUT_DISTANCE_TOLERANCE_DAYS = 30

/** Part des inscrits certains d'aller voter (%) : publiée telle quelle, ou envisagent × tout à fait certains. */
export function certainShare(m: TurnoutMeasure): number {
  return m.registeredShare ?? ((m.envisage ?? 0) * (m.certain ?? 0)) / 100
}

/** Dernière mesure du scrutin visé dont la fin de terrain est antérieure ou égale à `asOf` (hors vague finale). */
export function latestMeasure(measures: TurnoutMeasure[], cycle: TurnoutMeasure['cycle'], asOf: string) {
  return measures
    .filter((m) => m.cycle === cycle && !m.final && m.fieldwork.end <= asOf)
    .reduce<TurnoutMeasure | null>((best, m) => (!best || m.fieldwork.end > best.fieldwork.end ? m : best), null)
}

/** Mesure de campagne dont la distance au scrutin (jours avant `electionDate`) est la plus proche de `distance`. */
export function closestMeasure(
  measures: TurnoutMeasure[],
  cycle: TurnoutMeasure['cycle'],
  electionDate: string,
  distance: number,
) {
  return measures
    .filter((m) => m.cycle === cycle && !m.final)
    .reduce<TurnoutMeasure | null>((best, m) => {
      const gap = Math.abs(daysBetween(m.fieldwork.end, electionDate) - distance)
      return !best || gap < Math.abs(daysBetween(best.fieldwork.end, electionDate) - distance) ? m : best
    }, null)
}

/** Dernière vague avant le vote du scrutin visé (marquée finale). */
export function finalMeasure(measures: TurnoutMeasure[], cycle: TurnoutMeasure['cycle']) {
  return measures.find((m) => m.cycle === cycle && m.final) ?? null
}

export interface TurnoutModel {
  /** Mesures datées de la part des inscrits certains d'aller voter (2022 et 2027). */
  measures: TurnoutMeasure[]
  /** Participation réelle au 1er tour 2022 (% des inscrits). */
  turnoutRef: number
  /** Date de la base de sondages 2027, du 1er tour 2027 et du 1er tour 2022 (ISO). */
  asOf: string
  electionDate: string
  electionDateRef: string
  /** Affinité de chaque bloc avec les électeurs qui reviennent voter. */
  affinity: Record<Bloc, number>
}

/**
 * Part de la mobilisation de 2022 que les options activées reproduisent déjà, globalement (pas par
 * candidat) : la mobilisation de campagne par la progression (ou le billet), celle de fin de campagne par
 * « Corriger la moyenne » (ou le billet), à l'intensité la plus forte des deux.
 */
export function turnoutCoverage(settings: {
  progressionEnabled: boolean
  progressionIntensity?: number
  correctionsEnabled: boolean
  correctionIntensity: number
  blogBiasEnabled?: boolean
  blogBiasIntensity?: number
}): { campaign: number; late: number } {
  const blog = settings.blogBiasEnabled ? (settings.blogBiasIntensity ?? 1) : 0
  return {
    campaign: Math.max(settings.progressionEnabled ? (settings.progressionIntensity ?? 1) : 0, blog),
    late: Math.max(settings.correctionsEnabled ? settings.correctionIntensity : 0, blog),
  }
}

/**
 * Bilan de participation du 1er tour. Les sondages 2027 interrogent les électeurs certains d'aller voter :
 * la hausse de leur part (E2027 − E2022) y est déjà. La mobilisation de la campagne puis de ses derniers
 * jours, mesurée en 2022 (F2022 − E2022, puis P2022 − F2022), est reproduite par les options, pour la part
 * qu'elles couvrent. V₀ = E2027 + couverture : l'électorat que représentent les sondages corrigés. La
 * participation attendue P2027 vaut, par défaut, P2022 + (E2027 − E2022) : la hausse des certains reportée
 * point pour point. ΔV = P2027 − V₀ est le supplément (ou le retrait) à répartir entre les candidats.
 * Renvoie null sans mesure exploitable.
 */
export function turnoutBalance(
  model: TurnoutModel,
  coverage: { campaign: number; late: number },
  expected: number | null,
): TurnoutBalance | null {
  const now = latestMeasure(model.measures, 2027, model.asOf)
  const final = finalMeasure(model.measures, 2022)
  if (!now || !final) return null
  const distanceNow = daysBetween(now.fieldwork.end, model.electionDate)
  const ref = closestMeasure(model.measures, 2022, model.electionDateRef, distanceNow)
  if (!ref) return null
  const certainNow: CertainShare = { share: certainShare(now), measure: now }
  const certainRef: CertainShare = { share: certainShare(ref), measure: ref }
  const finalRef: CertainShare = { share: certainShare(final), measure: final }
  const campaign = finalRef.share - certainRef.share
  const late = model.turnoutRef - finalRef.share
  const covered = coverage.campaign * campaign + coverage.late * late
  const v0 = certainNow.share + covered
  const defaultExpected = model.turnoutRef + (certainNow.share - certainRef.share)
  const target = expected ?? defaultExpected
  // Les flottants ne doivent pas laisser un résidu quand la couverture est complète et la participation par défaut.
  const gap = target - v0
  return {
    certainNow,
    certainRef,
    finalRef,
    turnoutRef: model.turnoutRef,
    campaign,
    late,
    covered,
    coverage,
    v0,
    expected: target,
    defaultExpected,
    delta: Math.abs(gap) < 1e-9 ? 0 : gap,
    distances: {
      now: distanceNow,
      ref: daysBetween(ref.fieldwork.end, model.electionDateRef),
      asOf: daysBetween(model.asOf, model.electionDate),
    },
  }
}

/** Avertissements sur la comparabilité des mesures : trop éloignées de la date des sondages ou entre elles. */
export function turnoutWarnings(balance: TurnoutBalance): string[] {
  const { now, ref, asOf } = balance.distances
  const warnings: string[] = []
  if (Math.abs(now - asOf) > TURNOUT_DISTANCE_TOLERANCE_DAYS) {
    warnings.push(
      `Participation : la dernière mesure des certains d’aller voter date de J−${now}, loin des sondages (J−${asOf}) : bilan peu fiable.`,
    )
  }
  if (Math.abs(ref - now) > TURNOUT_DISTANCE_TOLERANCE_DAYS) {
    warnings.push(
      `Participation : la mesure de 2021 la plus proche est à J−${ref}, contre J−${now} pour 2026 : comparaison peu fiable.`,
    )
  }
  return warnings
}

/**
 * Facteur de chaque candidat quand `delta` points d'inscrits s'ajoutent (ou se retranchent, si négatif) aux
 * `v0` points de votants que représentent les sondages corrigés : les nouveaux votants se répartissent comme
 * les votants actuels, pondérés par l'affinité de leur bloc (1 sans bloc). f = (v0 + delta × k ÷ K) ÷
 * (v0 + delta), où K est l'affinité moyenne des votants actuels : le total des scores est conservé. Avec un
 * retrait, les blocs d'affinité forte perdent le plus ; le numérateur est borné à 0.
 */
export function turnoutFactors(
  scores: Record<CandidateId, number>,
  blocOf: (id: CandidateId) => Bloc | undefined,
  model: Pick<TurnoutModel, 'affinity'>,
  v0: number,
  delta: number,
): Record<CandidateId, number> {
  const ids = Object.keys(scores)
  const k = (id: CandidateId) => {
    const bloc = blocOf(id)
    return bloc ? model.affinity[bloc] : 1
  }
  const total = ids.reduce((s, id) => s + Math.max(0, scores[id]!), 0)
  const mean = total > 0 ? ids.reduce((s, id) => s + Math.max(0, scores[id]!) * k(id), 0) / total : 0
  if (delta === 0 || mean <= 0 || v0 + delta <= 0) return Object.fromEntries(ids.map((id) => [id, 1]))
  return Object.fromEntries(
    ids.map((id) => [id, Math.max(0, v0 + (delta * k(id)) / mean) / (v0 + delta)]),
  )
}
