import type { Reference2022Stats } from './corrections'
import { addDays, averageHypothesisPolls, daysBetween } from './pollAverage'
import type { CampaignPoll, PollUsage, PollsData, Reference2022 } from './types'

export interface ProgressionStats {
  /** Distance au scrutin de la base 2027, reportée sur 2022 (en jours). */
  daysBefore: number
  /** Date équivalente avant le scrutin de 2022. */
  asOf: string
  usage: PollUsage<CampaignPoll>[]
  institutesUsed: number
  /** Moyenne des sondages à cette date, normalisée à 100. */
  earlyAverage: Record<string, number>
  /** Moyenne des derniers sondages avant le vote (celle de la correction 2022). */
  finalAverage: Record<string, number>
  /** derniers sondages ÷ sondages à la même distance du scrutin, par candidat de 2022. */
  ratio: Record<string, number>
}

/**
 * Progression des sondages en 2022 : comment les intentions de vote ont évolué entre la date située
 * à la même distance du scrutin que la base 2027 et les derniers sondages avant le vote.
 */
export function computeProgression2022(
  polls: PollsData,
  ref: Reference2022,
  stats: Reference2022Stats,
): ProgressionStats {
  const daysBefore = daysBetween(polls.asOf, polls.electionDate)
  const asOf = addDays(ref.electionDate, -daysBefore)
  const campaign = ref.campaignPolls
  const keep = new Set(ref.candidates.map((c) => c.id))
  const { usage, average, institutesUsed } = averageHypothesisPolls(
    campaign.polls,
    asOf,
    campaign.windowDays,
    campaign,
    keep,
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
