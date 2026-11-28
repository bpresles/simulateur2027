import { useState } from 'react'
import { simulationData } from '../../data/schema'
import { betweenRoundsLastDayGap, betweenRoundsSummaries } from '../../domain/secondRound'
import type { BetweenRoundsBiasMode, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { date, pct, pts } from '../format'
import { Segmented, Switch } from './controls'

type ActiveBiasMode = Exclude<BetweenRoundsBiasMode, 'none'>

const BETWEEN_ROUNDS = betweenRoundsSummaries(simulationData.secondRoundPollBias)
const SUMMARY_2022 = BETWEEN_ROUNDS.find((s) => s.year === 2022)
const SUMMARY_2017 = BETWEEN_ROUNDS.find((s) => s.year === 2017)
const MEAN_GAP = betweenRoundsLastDayGap(simulationData.secondRoundPollBias, 'mean')

/**
 * Option activée par défaut (moyenne 2017–2022) permettant d'appliquer l'écart mesuré entre les derniers
 * sondages d'entre-deux-tours et le résultat officiel (moyenne 2017–2022, 2022 ou 2017) au score de l'adversaire du RN.
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
  const [lastActive, setLastActive] = useState<ActiveBiasMode>(mode !== 'none' ? mode : 'mean')

  const enabled = mode !== 'none'
  const activeMode: ActiveBiasMode = mode !== 'none' ? mode : lastActive
  const activeSummary = activeMode === '2017' ? SUMMARY_2017 : activeMode === '2022' ? SUMMARY_2022 : undefined
  const isNonRnDuel = Boolean(result && result.secondRound.duel.kind !== 'rn-sourced')

  const handleToggle = (checked: boolean) => {
    if (checked) {
      setMode(lastActive)
    } else {
      setMode('none')
    }
  }

  const handleModeChange = (next: ActiveBiasMode) => {
    setLastActive(next)
    setMode(next)
  }

  const gapMeanLabel = pts(MEAN_GAP)
  const gap2022Label = SUMMARY_2022 ? pts(SUMMARY_2022.lastDayGap) : '+2,4 pts'
  const gap2017Label = SUMMARY_2017 ? pts(SUMMARY_2017.lastDayGap) : '+3,4 pts'

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3 rounded-lg border border-rule bg-paper/60 p-3.5'}>
      <Switch
        id={`${idPrefix}-between-rounds-bias`}
        checked={enabled}
        onCheckedChange={handleToggle}
        label="Tenir compte des écarts entre les derniers sondages avant le 2nd tour et les résultats réels"
        description={
          enabled
            ? activeMode === 'mean'
              ? `Applique la moyenne des écarts 2017 et 2022 (${gapMeanLabel} : moyenne de ${gap2022Label} en 2022 et ${gap2017Label} en 2017) en faveur de l’adversaire du RN sur les duels face au RN (score central et Monte-Carlo).`
              : activeSummary
                ? `Applique l’écart ${activeMode} (${pts(activeSummary.lastDayGap)} : ${pct(activeSummary.lastDayMeanAntiRn)} dans les derniers sondages du ${date(activeSummary.lastDayDate)} contre ${pct(activeSummary.result.antiRn, 2)} au résultat) en faveur de l’adversaire du RN sur les duels face au RN (score central et Monte-Carlo).`
                : ''
            : `Désactivé (moyenne 2017–2022 par défaut : ${gapMeanLabel}). Ajoute au score de l’adversaire du RN l’écart constaté entre les derniers sondages d’entre-deux-tours et le résultat officiel en 2022 (${gap2022Label}) ou en 2017 (${gap2017Label}).`
        }
      />

      {enabled && (
        <div className="space-y-2 pl-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-2">Scrutin de référence :</span>
            <Segmented<ActiveBiasMode>
              label="Scrutin de référence pour l’écart entre-deux-tours"
              value={activeMode}
              onValueChange={handleModeChange}
              options={[
                {
                  value: 'mean',
                  label: `Moy. 2017–2022 (${gapMeanLabel})`,
                  hint: `Moyenne des écarts « derniers » 2022 (${gap2022Label}) et 2017 (${gap2017Label})`,
                },
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
