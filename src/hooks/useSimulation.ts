import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { simulationData } from '../data/schema'
import { computeCalibration } from '../domain/calibration'
import { simulate } from '../domain/simulate'
import { selectSettings, useSettings } from '../state/settingsStore'

/** Étalonnage sur 2022 et 2017 : ne dépend d'aucun réglage, calculé une seule fois. */
export const calibration = computeCalibration(simulationData, simulationData.polls)
export const reference2022Stats = calibration.y2022.reference
export const progression2022Stats = calibration.y2022.progression
export const reference2017Stats = calibration.y2017.reference
export const progression2017Stats = calibration.y2017.progression

export function useSimulation() {
  const settings = useSettings(useShallow(selectSettings))
  return useMemo(() => simulate(simulationData, settings, calibration), [settings])
}
