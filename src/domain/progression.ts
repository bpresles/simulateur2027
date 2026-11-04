import type { ReferenceStats } from './corrections'
import { addDays, averageHypothesisPolls, daysBetween } from './pollAverage'
import type { CampaignPoll, PastElectionReference, PollUsage, PollsData } from './types'

export interface ProgressionStats {
  /** Distance au scrutin de la base 2027, reportée sur le scrutin passé (en jours). */
  daysBefore: number
  /** Date équivalente avant le scrutin passé. */
  asOf: string
  usage: PollUsage<CampaignPoll>[]
  institutesUsed: number
  /** Moyenne des sondages à cette date, normalisée à 100. */
  earlyAverage: Record<string, number>
  /** Moyenne des derniers sondages avant le vote (celle de la correction). */
  finalAverage: Record<string, number>
  /** derniers sondages ÷ sondages à la même distance du scrutin, par candidat du scrutin passé. */
  ratio: Record<string, number>
}

/**
 * Progression des sondages d'un scrutin passé : comment les intentions de vote ont évolué entre la date
 * située à la même distance du scrutin que la base 2027 et les derniers sondages avant le vote.
 *
 * Par défaut, chaque hypothèse est ramenée à 100 sur les seuls candidats finalement en lice (2022 : les
 * hypothèses retenues les testent tous). `withOthers` garde aussi les candidats non retenus (2017 : avant
 * les primaires, Juppé, Sarkozy, Hollande ou Valls étaient testés) ; un candidat absent d'une hypothèse y
 * compte alors pour 0, pour que les parts de bloc restent celles des hypothèses.
 */
export function computeProgression(
  polls: Pick<PollsData, 'asOf' | 'electionDate'>,
  ref: PastElectionReference,
  stats: ReferenceStats,
  { withOthers = false }: { withOthers?: boolean } = {},
): ProgressionStats {
  const daysBefore = daysBetween(polls.asOf, polls.electionDate)
  const asOf = addDays(ref.electionDate, -daysBefore)
  const campaign = ref.campaignPolls
  const ids = [...ref.candidates, ...(withOthers ? campaign.otherCandidates : [])].map((c) => c.id)
  const { usage, average, institutesUsed } = averageHypothesisPolls(
    campaign.polls,
    asOf,
    campaign.windowDays,
    campaign,
    new Set(ids),
    undefined,
    withOthers ? ids : [],
  )
  const ratio = Object.fromEntries(
    ref.candidates.flatMap((c) => {
      const from = average[c.id]
      const to = stats.pollAverage[c.id]
      return from && to !== undefined ? [[c.id, to / from]] : []
    }),
  )
  return { daysBefore, asOf, usage, institutesUsed, earlyAverage: average, finalAverage: stats.pollAverage, ratio }
}
