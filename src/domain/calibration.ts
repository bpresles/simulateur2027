import { computeBlogBias } from './blogBias'
import type { BlogBias, YearStats } from './blogBias'
import { computeReference } from './corrections'
import { computeCorrectionReference } from './pastElections'
import type { CorrectionReference } from './pastElections'
import { computeProgression } from './progression'
import { baseTurnout, turnoutAffinity } from './turnout'
import type { TurnoutModel } from './turnout'
import type { PollsData, SimulationData } from './types'

/** Étalonnage tiré des scrutins passés : ne dépend que des données et de la date de la base 2027. */
export interface Calibration {
  y2022: YearStats
  y2017: YearStats
  /** Écarts estimés entre derniers sondages et résultat (2022 et 2017 combinés), par candidat de 2022. */
  correction: CorrectionReference
  /** Biais par bloc relevés par le billet, estimés sur 2022 et 2017. */
  blogBias: BlogBias
  /** Participation de référence et affinité des blocs avec les électeurs qui reviennent voter. */
  turnout: TurnoutModel
}

export function computeCalibration(
  data: Pick<SimulationData, 'reference2022' | 'reference2017'>,
  polls: Pick<PollsData, 'asOf' | 'electionDate'>,
): Calibration {
  const reference2022 = computeReference(data.reference2022)
  const reference2017 = computeReference(data.reference2017)
  const y2022 = { reference: reference2022, progression: computeProgression(polls, data.reference2022, reference2022) }
  // 2017 : les hypothèses d'octobre 2016 testent encore les candidats des primaires (Juppé, Hollande…).
  const y2017 = {
    reference: reference2017,
    progression: computeProgression(polls, data.reference2017, reference2017, { withOthers: true }),
  }
  return {
    y2022,
    y2017,
    correction: computeCorrectionReference(reference2022, reference2017),
    blogBias: computeBlogBias({ 2022: y2022, 2017: y2017 }),
    turnout: {
      base: baseTurnout({ 2022: data.reference2022, 2017: data.reference2017 }) ?? 0,
      affinity: turnoutAffinity(),
    },
  }
}
