import {
  acceptAlliances,
  alliancesConflict,
  applyAlliances,
  defaultSet,
  insertMinor,
  ralliedOf,
  scenarioFilter,
  scenarioSet,
  testedShare,
} from './alliances'
import type { AllianceSplit } from './alliances'
import { applyCorrections, computeReference2022 } from './corrections'
import type { Reference2022Stats } from './corrections'
import { averagePolls } from './pollAverage'
import { computeProgression2022 } from './progression'
import type { ProgressionStats } from './progression'
import { computeSecondRound, secondRoundDropout2022 } from './secondRound'
import { allianceSplit2024, effectiveProfiles, minorTransferParts, resolveDuel } from './transfers'
import type {
  Alliance,
  AllianceRate,
  CandidateId,
  Entrant,
  FirstRoundRow,
  Settings,
  SimulationData,
  SimulationResult,
} from './types'

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
    untestedAlliances: false,
    allianceOverrides: {},
    transferOverrides: {},
    minorTransfers: {},
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
  const name = (id: string) => candidatesById.get(id)?.name ?? id
  const warnings: string[] = []
  // Alliances testées par les sondeurs : leurs ralliés sont absents des hypothèses retenues. Avec l'option
  // des alliances non évaluées, les autres alliances activées compatibles sont retenues aussi.
  const tested = acceptAlliances(polls, settings.alliances)
  const retainedSet = settings.untestedAlliances
    ? polls.alliances.reduce<Alliance[]>(
        (kept, a) =>
          settings.alliances[a.id] && !kept.includes(a) && !kept.some((b) => alliancesConflict(a, b))
            ? [...kept, a]
            : kept,
        tested,
      )
    : tested
  const retained = polls.alliances.filter((a) => retainedSet.includes(a))

  // Les sondages retenus sont ceux qui testent la combinaison testée, avec ou sans l'option : celle-ci
  // n'ajoute que les alliances qu'aucune hypothèse ne permet, estimées sur ces mêmes sondages.
  const excluded = new Set(settings.excludedPolls)
  let selection = averagePolls(polls, scenarioFilter(polls, tested), excluded)
  let hypothesisSet = scenarioSet(polls, tested, name)
  // Si aucun sondage ne teste tous les candidats simulés, la base se contente des candidats principaux.
  if (selection.institutesUsed === 0 && tested.length === 0) {
    selection = averagePolls(polls, defaultSet(polls), excluded)
    hypothesisSet = defaultSet(polls)
    warnings.push('Aucun sondage ne teste tous les candidats simulés : hypothèses des seuls candidats principaux.')
  }
  const { usage, average, institutesUsed } = selection

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

  const minorTransfers = minorTransferParts(polls.candidates, settings.minorTransfers)
  // Petit candidat d'une alliance à estimer absent des hypothèses retenues : sa part est reprise des
  // hypothèses qui le testent dans les sondages retenus (0 si aucune ne le teste).
  const minorShares = new Map<CandidateId, number>()
  const minorShare = (id: CandidateId) => {
    if (!minorShares.has(id)) minorShares.set(id, testedShare(polls, id, excluded))
    return minorShares.get(id)!
  }

  // Moyenne, corrections, puis alliances estimées — celles que les sondages retenus ne testent pas. Les
  // électeurs des ralliés testés sont déjà répartis par les sondés.
  const untested = retained.filter((a) => !tested.includes(a))
  const inserted = [...new Set(untested.flatMap((a) => a.members))].filter(
    (id) => institutesUsed > 0 && average[id] === undefined && candidatesById.get(id)?.minor && minorShare(id) > 0,
  )
  // Le petit candidat est ajouté après les corrections : sa part est prélevée sur les scores déjà
  // corrigés de ses donneurs, qui gardent ainsi leur correction 2022 sur les électeurs qu'ils cèdent.
  const insert = (scores: Record<CandidateId, number>) =>
    inserted.reduce((acc, id) => insertMinor(acc, id, minorShare(id), minorTransfers[id] ?? []), scores)
  const without = applyCorrections(average, polls.candidates, reference, settings, progression)
  const base = insert(average)
  const corrected = insert(Object.fromEntries(without.map((r) => [r.candidateId, r.corrected])))
  const minorRows = applyCorrections(base, polls.candidates, reference, settings, progression)
  const firstRound = polls.candidates.flatMap((c): FirstRoundRow[] => {
    const r = without.find((w) => w.candidateId === c.id)
    if (r) return [{ ...r, cededBase: r.base - base[c.id]!, ceded: r.corrected - corrected[c.id]!, corrected: corrected[c.id]! }]
    const m = minorRows.find((w) => w.candidateId === c.id)
    return m ? [{ ...m, base: base[c.id]!, projected: base[c.id]!, corrected: corrected[c.id]! }] : []
  })
  const estimated = untested.filter((a) => a.members.every((id) => corrected[id] !== undefined))
  const { entrants, leaks } = applyAlliances(corrected, estimated, split, rnId)
  const allianceIds = institutesUsed > 0 ? tested.map((a) => a.id) : []

  const hypothesis = `l’hypothèse « ${hypothesisSet.label} »`
  if (usage.some((u) => u.status === 'used' && excluded.has(u.poll.id))) {
    warnings.push(`Aucun des sondages cochés ne teste ${hypothesis} : tous les sondages disponibles sont retenus.`)
  } else if (!usage.some((u) => u.status === 'excluded') && institutesUsed < 3) {
    const institutes = usage.filter((u) => u.status === 'used').map((u) => u.poll.institute)
    warnings.push(
      `Seulement ${institutesUsed} institut${institutesUsed > 1 ? 's' : ''} (${institutes.join(', ')}) pour ${hypothesis} : moyenne fragile.`,
    )
  }
  if (estimated.length > 0) {
    const many = estimated.length > 1 ? 's' : ''
    warnings.push(
      `Alliance${many} estimée${many} par les reports des législatives 2024, faute d’hypothèse de sondage : ${estimated.map((a) => a.label).join(', ')}.`,
    )
  }
  for (const id of inserted) {
    warnings.push(
      `Aucune hypothèse retenue ne teste ${name(id)} : pour estimer son ralliement, score de ${minorShare(id).toFixed(1).replace('.', ',')} % repris des autres hypothèses des sondages retenus et prélevé sur les candidats vers lesquels se reportent ses électeurs en son absence.`,
    )
  }
  const allianceRates: AllianceRate[] = settings.untestedAlliances
    ? polls.alliances
        .filter(
          (al) =>
            !allianceIds.includes(al.id) &&
            al.members.every((id) => corrected[id] !== undefined),
        )
        .map((al) => {
          const leaderProfile = candidatesById.get(al.leader)!.duelProfile
          return {
            allianceId: al.id,
            leaderId: al.leader,
            joining: ralliedOf(al).map((id) => ({
              candidateId: id,
              ...split(al.id, al.leader, id),
              default2024: split2024(al.leader, id),
              source: leaderProfile ? { profileId: leaderProfile, bloc: candidatesById.get(id)!.bloc } : null,
              isOverride: settings.allianceOverrides[al.id] !== undefined,
            })),
          }
        })
    : []

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
      minorTransfers,
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
    allianceIds,
    estimatedAllianceIds: estimated.map((a) => a.id),
    allianceRates,
    allianceLeaks: leaks,
    pollUsage: usage,
    institutesUsed,
    firstRound,
    entrants,
    qualification: { gap, tight, picked, withSecond, withThird },
    secondRound,
    warnings,
  }
}
