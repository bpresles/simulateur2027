import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { simulationData } from '../data/schema'
import { computeReference2022 } from '../domain/corrections'
import { computeProgression2022 } from '../domain/progression'
import { simulate } from '../domain/simulate'
import { selectSettings, useSettings } from '../state/settingsStore'

/** Statistiques 2022 : ne dépendent d'aucun réglage, calculées une seule fois. */
export const reference2022Stats = computeReference2022(simulationData.reference2022)
export const progression2022Stats = computeProgression2022(
  simulationData.polls,
  simulationData.reference2022,
  reference2022Stats,
)

export function useSimulation() {
  const settings = useSettings(useShallow(selectSettings))
  return useMemo(() => simulate(simulationData, settings, reference2022Stats, progression2022Stats), [settings])
}
