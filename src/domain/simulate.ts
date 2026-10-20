import { acceptAlliances, defaultSet, scenarioSet } from './alliances'
import { applyCorrections, computeReference2022 } from './corrections'
import type { Reference2022Stats } from './corrections'
import { averagePolls } from './pollAverage'
import { computeProgression2022 } from './progression'
import type { ProgressionStats } from './progression'
import { computeSecondRound, secondRoundDropout2022 } from './secondRound'
import { effectiveProfiles, resolveDuel } from './transfers'
import type { Entrant, Settings, SimulationData, SimulationResult } from './types'

/** Écart de qualification (en points) en dessous duquel un avertissement est affiché. */
export const TIGHT_QUALIFICATION_GAP = 1

export function defaultSettings(): Settings {
  return {
    excludedPolls: [],
    progressionEnabled: false,
    progressionIntensity: 0.7,
    correctionsEnabled: true,
    correctionIntensity: 0.7,
    correctionOverrides: {},
    referenceBlend: {},
    alliances: {},
    transferOverrides: {},
    fidelity: null,
    abstentionCalibration: true,
    abstentionTarget: null,
    qualificationPick: 'second',
  }
}

/** Pipeline complet : sondages → corrections → alliances → qualification → 2nd tour. */
export function simulate(
  data: SimulationData,
  settings: Settings,
  reference: Reference2022Stats = computeReference2022(data.reference2022),
  progression: ProgressionStats = computeProgression2022(data.polls, data.reference2022, reference),
): SimulationResult {
  const { polls, transfers } = data
  const candidatesById = new Map(polls.candidates.map((c) => [c.id, c]))
  // Les alliances activées retirent leurs ralliés : seules comptent les hypothèses des sondages qui les
  // testent ainsi, et seuls ces sondages sont retenus (une combinaison non testée n'est pas retenue).
  const alliances = acceptAlliances(polls, settings.alliances)
  const exact = scenarioSet(polls, alliances, (id) => candidatesById.get(id)?.name ?? id)
  const warnings: string[] = []

  const excluded = new Set(settings.excludedPolls)
  // Sans alliance, si aucun sondage ne teste tous les candidats simulés, la base se contente des
  // candidats principaux du jeu par défaut.
  const exactAverage = averagePolls(polls, exact, excluded)
  const fallback = exactAverage.institutesUsed === 0 && alliances.length === 0
  const hypothesisSet = fallback ? defaultSet(polls) : exact
  const { usage, average, institutesUsed } = fallback ? averagePolls(polls, hypothesisSet, excluded) : exactAverage
  if (fallback) warnings.push('Aucun sondage ne teste tous les candidats simulés : hypothèses des seuls candidats principaux.')
  if (usage.some((u) => u.status === 'used' && excluded.has(u.poll.id))) {
    warnings.push('Aucun des sondages cochés ne teste cette hypothèse : tous les sondages disponibles sont retenus.')
  } else if (!usage.some((u) => u.status === 'excluded') && institutesUsed < 3) {
    warnings.push(`Seulement ${institutesUsed} institut(s) pour cette hypothèse : moyenne fragile.`)
  }

  const firstRound = applyCorrections(average, polls.candidates, reference, settings, progression)
  const corrected = Object.fromEntries(firstRound.map((r) => [r.candidateId, r.corrected]))
  const fidelity = settings.fidelity ?? transfers.defaultFidelity
  const profiles = effectiveProfiles(transfers, settings.transferOverrides, fidelity)
  // Chaque candidat se présente seul : les électeurs des ralliés sont déjà répartis par les sondés.
  const entrants: Entrant[] = Object.entries(corrected)
    .map(([id, score]) => ({
      id,
      allianceIds: [],
      members: [{ candidateId: id, contribution: score, weight: 1, rate: 1, rnRate: 0 }],
      score,
    }))
    .sort((x, y) => y.score - x.score)

  const [first, second, third] = entrants
  if (!first || !second) throw new Error('Moins de deux candidats au 1er tour')
  const gap = third ? second.score - third.score : null
  const tight = gap !== null && gap < TIGHT_QUALIFICATION_GAP

  const abstentionTarget = settings.abstentionCalibration
    ? (settings.abstentionTarget ?? secondRoundDropout2022(data.reference2022))
    : null
  const duelAgainst = (opponent: Entrant) =>
    computeSecondRound({
      electorate: corrected,
      a: first,
      b: opponent,
      duel: resolveDuel(first, opponent, candidatesById),
      profiles,
      fallback: transfers.fallback,
      candidatesById,
      fidelity,
      abstentionTarget,
      secondRoundPolls: polls.secondRoundPolls,
    })
  // Qualification serrée : le 2nd tour avec le 3e est aussi simulé, l'utilisateur choisit lequel afficher.
  const withSecond = duelAgainst(second)
  const withThird = tight && third ? duelAgainst(third) : null
  const picked = withThird && settings.qualificationPick === 'third' ? 'third' : 'second'
  const secondRound = picked === 'third' && withThird ? withThird : withSecond

  if (secondRound.duel.kind === 'fallback') {
    warnings.push(
      'Duel hors source : les reports des législatives 2024 ne couvrent pas ce duel. Le 2nd tour utilise un modèle de repli entièrement fondé sur des hypothèses.',
    )
  }

  return {
    hypothesisSet,
    allianceIds: alliances.map((a) => a.id),
    pollUsage: usage,
    institutesUsed,
    firstRound,
    entrants,
    qualification: { gap, tight, picked, withSecond, withThird },
    secondRound,
    warnings,
  }
}
