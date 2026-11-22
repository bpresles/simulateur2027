import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { simulationData } from '../data/schema'
import { computeBacktest } from '../domain/backtest'
import { newVoterRates } from '../domain/newVoters'
import { simulate } from '../domain/simulate'
import { selectSettings, useSettings } from '../state/settingsStore'

/** Validation historique (2017, 2022 et agrégats 2024) : indépendante des réglages, calculée une seule fois. */
export const backtestReport = computeBacktest(simulationData, simulationData.polls)

/** Taux de référence des nouveaux votants et blancs/nuls (2022 & Insee). */
export const newVoterReferenceRates = newVoterRates(simulationData)

export function useSimulation() {
  const settings = useSettings(useShallow(selectSettings))
  return useMemo(() => simulate(simulationData, settings), [settings])
}
