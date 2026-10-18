import { allianceLeader, applyAlliances } from './alliances'
import type { AllianceSplit } from './alliances'
import { applyCorrections, computeReference2022 } from './corrections'
import type { Reference2022Stats } from './corrections'
import { averagePolls } from './pollAverage'
import { computeProgression2022 } from './progression'
import type { ProgressionStats } from './progression'
import { computeSecondRound, secondRoundDropout2022 } from './secondRound'
import { allianceSplit2024, effectiveProfiles, resolveDuel } from './transfers'
import type { AllianceRate, Entrant, HypothesisSet, Settings, SimulationData, SimulationResult } from './types'

/** Écart de qualification (en points) en dessous duquel un avertissement est affiché. */
export const TIGHT_QUALIFICATION_GAP = 1

export function defaultSettings(): Settings {
  return {
    hypothesisSetId: null,
    progressionEnabled: false,
    correctionsEnabled: true,
    correctionIntensity: 1,
    correctionOverrides: {},
    referenceBlend: {},
    alliances: {},
    allianceOverrides: {},
    transferOverrides: {},
    fidelity: null,
    abstentionCalibration: true,
    abstentionTarget: null,
    qualificationPick: 'second',
  }
}

export function resolveHypothesisSet(data: SimulationData, id: string | null): HypothesisSet {
  const sets = data.polls.hypothesisSets
  return sets.find((s) => s.id === id) ?? sets.find((s) => s.default) ?? sets[0]!
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
  const hypothesisSet = resolveHypothesisSet(data, settings.hypothesisSetId)
  const warnings: string[] = []

  const { usage, average, institutesUsed } = averagePolls(polls, hypothesisSet)
  if (institutesUsed < 3) {
    warnings.push(`Seulement ${institutesUsed} institut(s) dans la fenêtre pour cette hypothèse : moyenne fragile.`)
  }

  const firstRound = applyCorrections(average, polls.candidates, reference, settings, progression)
  const corrected = Object.fromEntries(firstRound.map((r) => [r.candidateId, r.corrected]))
  const fidelity = settings.fidelity ?? transfers.defaultFidelity
  const profiles = effectiveProfiles(transfers, settings.transferOverrides, fidelity)
  const rnId = polls.candidates.find((c) => c.isRN)?.id ?? null
  const split2024 = (leaderId: string, joiningId: string): AllianceSplit =>
    allianceSplit2024(candidatesById.get(leaderId)!, candidatesById.get(joiningId)!, profiles)
  // Une part modifiée dans les réglages remplace celle de 2024 ; le reste garde la répartition
  // RN / abstention constatée en 2024.
  const split = (allianceId: string, leaderId: string, joiningId: string): AllianceSplit => {
    const base = split2024(leaderId, joiningId)
    const override = settings.allianceOverrides[allianceId]
    if (override === undefined) return base
    const rest = 1 - base.leader
    return { leader: override, rn: rest > 0 ? ((1 - override) * base.rn) / rest : 0 }
  }
  const { entrants, leaks } = applyAlliances(corrected, polls.alliances, settings.alliances, split, rnId)
  const allianceRates: AllianceRate[] = polls.alliances
    .filter((al) => al.members.every((id) => corrected[id] !== undefined))
    .map((al) => {
      const leaderId = allianceLeader(al, corrected)
      const leaderProfile = candidatesById.get(leaderId)!.duelProfile
      return {
        allianceId: al.id,
        leaderId,
        joining: al.members
          .filter((id) => id !== leaderId)
          .map((id) => ({
            candidateId: id,
            ...split(al.id, leaderId, id),
            default2024: split2024(leaderId, id),
            source: leaderProfile ? { profileId: leaderProfile, bloc: candidatesById.get(id)!.bloc } : null,
            isOverride: settings.allianceOverrides[al.id] !== undefined,
          })),
      }
    })

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
    pollUsage: usage,
    institutesUsed,
    firstRound,
    entrants,
    allianceRates,
    allianceLeaks: leaks,
    qualification: { gap, tight, picked, withSecond, withThird },
    secondRound,
    warnings,
  }
}
