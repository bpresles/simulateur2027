import { useState } from 'react'
import { simulationData } from '../../data/schema'
import { betweenRoundsSummaries } from '../../domain/secondRound'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { date, pct, pts } from '../format'
import { Segmented, Switch } from './controls'

const BETWEEN_ROUNDS = betweenRoundsSummaries(simulationData.secondRoundPollBias)
const SUMMARY_2022 = BETWEEN_ROUNDS.find((s) => s.year === 2022)
const SUMMARY_2017 = BETWEEN_ROUNDS.find((s) => s.year === 2017)

/**
 * Option facultative (désactivée par défaut) permettant d'appliquer l'écart mesuré entre les derniers
 * sondages d'entre-deux-tours et le résultat officiel (2022 ou 2017) au score de l'adversaire du RN.
 */
export function BetweenRoundsBiasControl({
  idPrefix,
  compact = false,
  result,
}: {
  idPrefix: string
  compact?: boolean
  result?: SimulationResult
}) {
  const mode = useSettings((s) => s.betweenRoundsBias)
  const setMode = useSettings((s) => s.setBetweenRoundsBias)
  const [lastYear, setLastYear] = useState<'2022' | '2017'>(mode === '2017' ? '2017' : '2022')

  const enabled = mode !== 'none'
  const activeYear: '2022' | '2017' = mode === '2017' ? '2017' : mode === '2022' ? '2022' : lastYear
  const activeSummary = activeYear === '2017' ? SUMMARY_2017 : SUMMARY_2022
  const isNonRnDuel = Boolean(result && result.secondRound.duel.kind !== 'rn-sourced')

  const handleToggle = (checked: boolean) => {
    if (checked) {
      setMode(lastYear)
    } else {
      setMode('none')
    }
  }

  const handleYearChange = (year: '2022' | '2017') => {
    setLastYear(year)
    setMode(year)
  }

  const gap2022Label = SUMMARY_2022 ? pts(SUMMARY_2022.lastDayGap) : '+2,3 pts'
  const gap2017Label = SUMMARY_2017 ? pts(SUMMARY_2017.lastDayGap) : '+3,4 pts'

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3 rounded-lg border border-rule bg-paper/60 p-3.5'}>
      <Switch
        id={`${idPrefix}-between-rounds-bias`}
        checked={enabled}
        onCheckedChange={handleToggle}
        label="Tenir compte des écarts entre les derniers sondages avant le 2nd tour et les résultats réels"
        description={
          enabled && activeSummary
            ? `Applique l’écart ${activeYear} (${pts(activeSummary.lastDayGap)} : ${pct(activeSummary.lastDayMeanAntiRn)} dans les derniers sondages du ${date(activeSummary.lastDayDate)} contre ${pct(activeSummary.result.antiRn, 2)} au résultat) en faveur de l’adversaire du RN sur les duels face au RN (score central et Monte-Carlo).`
            : `Désactivé par défaut. Ajoute au score de l’adversaire du RN l’écart constaté entre les derniers sondages d’entre-deux-tours et le résultat officiel en 2022 (${gap2022Label}) ou en 2017 (${gap2017Label}).`
        }
      />

      {enabled && (
        <div className="space-y-2 pl-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-2">Scrutin de référence :</span>
            <Segmented<'2022' | '2017'>
              label="Scrutin de référence pour l’écart entre-deux-tours"
              value={activeYear}
              onValueChange={handleYearChange}
              options={[
                {
                  value: '2022',
                  label: `2022 (${gap2022Label})`,
                  hint: SUMMARY_2022
                    ? `Derniers sondages du ${date(SUMMARY_2022.lastDayDate)} : ${pct(SUMMARY_2022.lastDayMeanAntiRn)} vs ${pct(SUMMARY_2022.result.antiRn, 2)}`
                    : undefined,
                },
                {
                  value: '2017',
                  label: `2017 (${gap2017Label})`,
                  hint: SUMMARY_2017
                    ? `Derniers sondages du ${date(SUMMARY_2017.lastDayDate)} : ${pct(SUMMARY_2017.lastDayMeanAntiRn)} vs ${pct(SUMMARY_2017.result.antiRn, 2)}`
                    : undefined,
                },
              ]}
            />
          </div>
          {isNonRnDuel ? (
            <p className="text-xs text-ink-3">
              Sans effet sur le duel affiché (hors RN) : cet écart n’a été mesuré que sur des duels Macron – Le Pen.
            </p>
          ) : (
            <p className="text-xs text-ink-3">
              Attention : en base historique, les matrices de reports proviennent déjà d’enquêtes « jour du vote »
              (et non des sondages directs T2) ; activer ce décalage peut donc introduire un double compte.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
