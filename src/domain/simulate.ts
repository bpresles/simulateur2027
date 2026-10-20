import {
  acceptAlliances,
  allianceCombos,
  alliancesConflict,
  applyAlliances,
  defaultSet,
  ralliedOf,
  scenarioFilter,
  scenarioSet,
} from './alliances'
import type { AllianceSplit } from './alliances'
import { applyCorrections, computeReference2022 } from './corrections'
import type { Reference2022Stats } from './corrections'
import { averagePollsByScenario } from './pollAverage'
import { computeProgression2022 } from './progression'
import type { ProgressionStats } from './progression'
import { computeSecondRound, secondRoundDropout2022 } from './secondRound'
import { allianceSplit2024, effectiveProfiles, resolveDuel } from './transfers'
import type {
  Alliance,
  AllianceLeak,
  AllianceRate,
  Candidate,
  Entrant,
  EntrantMember,
  FirstRoundRow,
  HypothesisSet,
  Poll,
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
    fidelity: null,
    abstentionCalibration: true,
    abstentionTarget: null,
    qualificationPick: 'second',
  }
}

interface Group {
  key: Alliance[]
  polls: Poll[]
  /** Part des instituts retenus dans ce groupe. */
  weight: number
  set: HypothesisSet
  rows: FirstRoundRow[]
  estimated: Alliance[]
  entrants: Entrant[]
  leaks: AllianceLeak[]
}

/**
 * Réunit les groupes de sondages, pondérés par leur nombre d'instituts : moyenne des lignes du 1er tour,
 * des apports de chaque membre aux entrants et des électeurs ralliés partis au RN (0 quand un candidat est
 * absent d'un groupe, ses électeurs y étant répartis entre les autres). Un seul groupe : inchangé.
 */
function mergeGroups(groups: Group[], candidates: Candidate[]) {
  const [only] = groups
  const correctedOf = (rows: FirstRoundRow[]) => Object.fromEntries(rows.map((r) => [r.candidateId, r.corrected]))
  if (groups.length <= 1) {
    const rows = only?.rows ?? []
    return { firstRound: rows, corrected: correctedOf(rows), entrants: only?.entrants ?? [], leaks: only?.leaks ?? [] }
  }
  const rows = new Map<string, FirstRoundRow>()
  const members = new Map<string, { allianceIds: Set<string>; members: Map<string, EntrantMember> }>()
  const leaks = new Map<string, AllianceLeak>()
  for (const g of groups) {
    for (const r of g.rows) {
      const acc = rows.get(r.candidateId) ?? { ...r, base: 0, projected: 0, defaultCorrection: 0, appliedCorrection: 0, corrected: 0 }
      acc.base += g.weight * r.base
      acc.projected += g.weight * r.projected
      acc.defaultCorrection += g.weight * r.defaultCorrection
      acc.appliedCorrection += g.weight * r.appliedCorrection
      acc.corrected += g.weight * r.corrected
      rows.set(r.candidateId, acc)
    }
    for (const e of g.entrants) {
      const acc = members.get(e.id) ?? { allianceIds: new Set<string>(), members: new Map<string, EntrantMember>() }
      e.allianceIds.forEach((id) => acc.allianceIds.add(id))
      for (const m of e.members) {
        const mm = acc.members.get(m.candidateId) ?? { ...m, contribution: 0 }
        mm.contribution += g.weight * m.contribution
        acc.members.set(m.candidateId, mm)
      }
      members.set(e.id, acc)
    }
    for (const l of g.leaks) {
      const key = `${l.from}|${l.to}`
      const acc = leaks.get(key) ?? { ...l, points: 0 }
      acc.points += g.weight * l.points
      leaks.set(key, acc)
    }
  }
  const firstRound = candidates.flatMap((c) => rows.get(c.id) ?? [])
  const entrants: Entrant[] = [...members].map(([id, acc]) => {
    const list = [...acc.members.values()]
    const score = list.reduce((sum, m) => sum + m.contribution, 0)
    return {
      id,
      allianceIds: [...acc.allianceIds],
      members: list.map((m) => ({ ...m, weight: score > 0 ? m.contribution / score : 0 })),
      score,
    }
  })
  return {
    firstRound,
    corrected: correctedOf(firstRound),
    entrants: entrants.sort((a, b) => b.score - a.score),
    leaks: [...leaks.values()],
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

  // Scénarios essayés pour chaque sondage, du plus complet au moins complet. Sans l'option, seule la
  // combinaison testée compte ; avec, un sondage qui ne la teste pas prend la plus grande combinaison
  // testée qu'il contient, et les alliances restantes y sont estimées.
  const scenarios: Alliance[][] = settings.untestedAlliances
    ? [
        ...allianceCombos(polls)
          .filter((c) => c.every((a) => retained.includes(a)))
          .sort((x, y) => y.length - x.length),
        [],
      ]
    : [tested]
  const excluded = new Set(settings.excludedPolls)
  let selection = averagePollsByScenario(
    polls,
    scenarios.map((key) => ({ key, filter: scenarioFilter(polls, key) })),
    excluded,
  )
  // Si aucun sondage ne teste tous les candidats simulés, la base se contente des candidats principaux.
  const fallback = selection.institutesUsed === 0 && scenarios.some((s) => s.length === 0)
  if (fallback) {
    selection = averagePollsByScenario(polls, [{ key: [] as Alliance[], filter: defaultSet(polls) }], excluded)
    warnings.push('Aucun sondage ne teste tous les candidats simulés : hypothèses des seuls candidats principaux.')
  }
  const { usage, institutesUsed } = selection

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

  // Chaque groupe de sondages (même scénario) : moyenne, corrections, puis alliances estimées — celles
  // que ces sondages ne testent pas. Les électeurs des ralliés testés sont déjà répartis par les sondés.
  const groups: Group[] = selection.groups.map((g) => {
    const rows = applyCorrections(g.average, polls.candidates, reference, settings, progression)
    const corrected = Object.fromEntries(rows.map((r) => [r.candidateId, r.corrected]))
    const estimated = retained.filter((a) => !g.key.includes(a) && a.members.every((id) => corrected[id] !== undefined))
    return {
      key: g.key,
      polls: g.polls,
      weight: g.institutes / institutesUsed,
      set: fallback ? defaultSet(polls) : scenarioSet(polls, g.key, name),
      rows,
      estimated,
      ...applyAlliances(corrected, estimated, split, rnId),
    }
  })
  const { firstRound, corrected, entrants, leaks } = mergeGroups(groups, polls.candidates)
  const hypothesisSet = groups[0]?.set ?? scenarioSet(polls, tested, name)

  const labels = groups.map((g) => `« ${g.set.label} »`).join(', ') || `« ${hypothesisSet.label} »`
  const hypothesis = groups.length > 1 ? `les hypothèses ${labels}` : `l’hypothèse ${labels}`
  if (usage.some((u) => u.status === 'used' && excluded.has(u.poll.id))) {
    warnings.push(`Aucun des sondages cochés ne teste ${hypothesis} : tous les sondages disponibles sont retenus.`)
  } else if (!usage.some((u) => u.status === 'excluded') && institutesUsed < 3) {
    const institutes = usage.filter((u) => u.status === 'used').map((u) => u.poll.institute)
    warnings.push(
      `Seulement ${institutesUsed} institut${institutesUsed > 1 ? 's' : ''} (${institutes.join(', ')}) pour ${hypothesis} : moyenne fragile.`,
    )
  }
  const estimated = retained.filter((a) => groups.some((g) => g.estimated.includes(a)))
  if (estimated.length > 0) {
    const many = estimated.length > 1 ? 's' : ''
    const detail = (a: Alliance) => {
      const n = groups.filter((g) => g.estimated.includes(a)).reduce((sum, g) => sum + g.polls.length, 0)
      return n < institutesUsed ? `${a.label} (pour ${n} sondage${n > 1 ? 's' : ''} sur ${institutesUsed})` : a.label
    }
    warnings.push(
      `Alliance${many} estimée${many} par les reports des législatives 2024, faute d’hypothèse de sondage : ${estimated.map(detail).join(', ')}.`,
    )
  }
  const allianceRates: AllianceRate[] = settings.untestedAlliances
    ? polls.alliances
        .filter(
          (al) =>
            !(groups.length > 0 && groups.every((g) => g.key.includes(al))) &&
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
    hypothesisGroups: groups.map((g) => ({
      set: g.set,
      allianceIds: g.key.map((a) => a.id),
      estimatedAllianceIds: g.estimated.map((a) => a.id),
      pollIds: g.polls.map((p) => p.id),
    })),
    allianceIds: retained.filter((a) => groups.some((g) => g.key.includes(a))).map((a) => a.id),
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
