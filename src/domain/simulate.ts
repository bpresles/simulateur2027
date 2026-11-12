import {
  acceptAlliances,
  alliancesConflict,
  applyAlliances,
  defaultSet,
  insertMinor,
  isEstimable,
  ralliedOf,
  scenarioFilter,
  scenarioSet,
  testedShare,
} from './alliances'
import type { AllianceSplit } from './alliances'
import { computeCalibration } from './calibration'
import type { Calibration } from './calibration'
import { applyCorrections } from './corrections'
import { averagePolls } from './pollAverage'
import { turnoutBalance, turnoutCoverage, turnoutWarnings } from './turnout'
import { computeSecondRound, duelCampRates, duelDropout, pollBiasGaps, secondRoundDropout } from './secondRound'
import { allianceSplit2024, effectiveProfiles, minorTransferParts, resolveDuel } from './transfers'
import type {
  Alliance,
  AllianceRate,
  Bloc,
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
    progressionIntensity: 1,
    correctionsEnabled: false,
    correctionIntensity: 1,
    correctionOverrides: {},
    referenceBlend: {},
    blogBiasEnabled: true,
    blogBiasIntensity: 1,
    turnoutEnabled: true,
    turnoutExpected: null,
    alliances: {},
    untestedAlliances: false,
    groupedAlliances: false,
    allianceOverrides: {},
    transferCorrectionEnabled: true,
    transferCorrectionIntensity: 1,
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
  calibration: Calibration = computeCalibration(data, data.polls),
  withSensitivity = true,
): SimulationResult {
  const { polls, transfers } = data
  const candidatesById = new Map(polls.candidates.map((c) => [c.id, c]))
  const name = (id: string) => candidatesById.get(id)?.name ?? id
  const warnings: string[] = []
  // Alliances testées par les sondeurs : leurs ralliés sont absents des hypothèses retenues. Avec l'option
  // des alliances non évaluées, les autres alliances activées compatibles sont retenues aussi.
  const tested = acceptAlliances(polls, settings.alliances)
  const retainedSet = polls.alliances.reduce<Alliance[]>(
    (kept, a) =>
      isEstimable(a, settings) &&
      settings.alliances[a.id] &&
      !kept.includes(a) &&
      !kept.some((b) => alliancesConflict(a, b))
        ? [...kept, a]
        : kept,
    tested,
  )
  const retained = polls.alliances.filter((a) => retainedSet.includes(a))

  // Les sondages retenus sont ceux qui testent la combinaison testée, avec ou sans l'option : celle-ci
  // n'ajoute que les alliances qu'aucune hypothèse ne permet, estimées sur ces mêmes sondages.
  const excluded = new Set(settings.excludedPolls)
  // Un petit candidat absent d'une hypothèse y est imputé, pris aux candidats vers lesquels vont ses électeurs
  // selon la répartition choisie dans les réglages.
  let selection = averagePolls(polls, scenarioFilter(polls, tested), excluded, settings.minorTransfers)
  let hypothesisSet = scenarioSet(polls, tested, name)
  // Si aucun sondage ne teste tous les candidats simulés, la base se contente des candidats principaux.
  if (selection.institutesUsed === 0 && tested.length === 0) {
    selection = averagePolls(polls, defaultSet(polls), excluded, settings.minorTransfers)
    hypothesisSet = defaultSet(polls)
    warnings.push('Aucun sondage ne teste tous les candidats simulés : hypothèses des seuls candidats principaux.')
  }
  const { usage, average, institutesUsed } = selection

  const fidelity = settings.fidelity ?? transfers.defaultFidelity
  const profiles = effectiveProfiles(
    transfers,
    settings.transferOverrides,
    fidelity,
    settings.transferCorrectionEnabled
      ? { dropout: data.secondRoundDropout, intensity: settings.transferCorrectionIntensity }
      : null,
  )
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
    inserted.reduce(
      (acc, id) => insertMinor(acc, id, minorShare(id), selection.donors[id]?.parts ?? minorTransfers[id] ?? []),
      scores,
    )
  const correct = (scores: Record<CandidateId, number>) =>
    applyCorrections(
      scores,
      polls.candidates,
      calibration.correction,
      settings,
      calibration.y2022.progression,
      calibration.blogBias,
      calibration.turnout,
    )
  const without = correct(average)
  const base = insert(average)
  const corrected = insert(Object.fromEntries(without.map((r) => [r.candidateId, r.corrected])))
  const minorRows = correct(base)
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
      `Aucune hypothèse retenue ne teste ${name(id)} : pour estimer son ralliement, score de ${minorShare(id).toFixed(1).replace('.', ',')} % repris des autres hypothèses des sondages retenus et prélevé sur les candidats auxquels il prend ses voix (observés dans les sondages, à défaut répartition de ses électeurs).`,
    )
  }
  const allianceRates: AllianceRate[] = polls.alliances
    .filter(
      (al) =>
        isEstimable(al, settings) && !allianceIds.includes(al.id) && al.members.every((id) => corrected[id] !== undefined),
    )
    .map((al) => {
      const leaderProfile = candidatesById.get(al.leader)!.duelProfile
      // Ligne du profil du leader pour le bloc du rallié ; sans bloc (candidat non classé), pas de source.
      const sourceOf = (profileId: typeof leaderProfile, bloc: Bloc | null) =>
        profileId && bloc ? { profileId, bloc } : null
      return {
        allianceId: al.id,
        leaderId: al.leader,
        joining: ralliedOf(al).map((id) => ({
          candidateId: id,
          ...split(al.id, al.leader, id),
          default2024: split2024(al.leader, id),
          source: sourceOf(leaderProfile, candidatesById.get(id)!.bloc),
          isOverride: settings.allianceOverrides[al.id] !== undefined,
        })),
      }
    })

  const [first, second, third] = entrants
  if (!first || !second) throw new Error('Moins de deux candidats au 1er tour')
  const gap = third ? second.score - third.score : null
  const tight = gap !== null && gap < TIGHT_QUALIFICATION_GAP

  // Abandon : un total saisi dans les réglages (ou imposé par une variante) est réparti comme en 2024 ; sinon
  // l'abandon est celui des taux par camp du duel (législatives 2024). Un duel sans RN reste calé
  // uniformément sur l'abandon des présidentielles sans RN.
  const duelAgainst = (opponent: Entrant, override?: number, campScope?: 'bloc' | 'family') => {
    const duel = resolveDuel(first, opponent, candidatesById)
    const campRates = settings.abstentionCalibration ? duelCampRates(duel, data.secondRoundDropout) : null
    const imposed = override ?? settings.abstentionTarget
    return computeSecondRound({
      electorate: corrected,
      a: first,
      b: opponent,
      duel,
      profiles,
      fallback: transfers.fallback,
      candidatesById,
      fidelity,
      abstentionTarget: !settings.abstentionCalibration
        ? null
        : (imposed ?? (campRates ? null : duelDropout(duel, data.secondRoundDropout))),
      campRates,
      campScope,
      secondRoundPolls: polls.secondRoundPolls,
      minorTransfers,
    })
  }
  // Qualification serrée : le 2nd tour avec le 3e est aussi simulé, l'utilisateur choisit lequel afficher.
  const withSecond = duelAgainst(second)
  const withThird = tight && third ? duelAgainst(third) : null
  const picked = withThird && settings.qualificationPick === 'third' ? 'third' : 'second'
  const secondRound = picked === 'third' && withThird ? withThird : withSecond

  // Sensibilité : le duel affiché, seul l'abandon change (celui de 2017, puis celui de 2022).
  const sensitivity = (() => {
    if (!withSensitivity || secondRound.abstention.mode === 'none') return null
    const opponent = picked === 'third' && withThird ? third! : second
    const leader = (r: { pct: { a: number; b: number } }) => r.pct.a >= r.pct.b
    const variant = (ref: SimulationData['reference2017']) => {
      const target = secondRoundDropout(ref)
      const r = duelAgainst(opponent, target)
      return { target, pct: r.pct, winnerChanges: leader(r) !== leader(secondRound) }
    }
    const variants = { 2017: variant(data.reference2017), 2022: variant(data.reference2022) }
    // Sans la correction des reports : tout le scénario est recalculé (les alliances estimées s'appuient aussi
    // sur les profils). Le vainqueur est comparé par candidat, pas par position.
    const winnerOf = (r: SimulationResult['secondRound']) => (r.pct.a >= r.pct.b ? r.a : r.b)
    const raw =
      settings.transferCorrectionEnabled && settings.transferCorrectionIntensity !== 0
        ? simulate(data, { ...settings, transferCorrectionEnabled: false }, calibration, false).secondRound
        : null
    const uncorrected = raw
      ? {
          total: raw.abstention.total,
          winner: winnerOf(raw),
          score: Math.max(raw.pct.a, raw.pct.b),
          winnerChanges: winnerOf(raw) !== winnerOf(secondRound),
        }
      : null
    const family = secondRound.abstention.mode === 'camps' ? duelAgainst(opponent, undefined, 'family') : null
    const structural = family
      ? { total: family.abstention.total, pct: family.pct, winnerChanges: leader(family) !== leader(secondRound) }
      : null
    return {
      shown: { total: secondRound.abstention.total, pct: secondRound.pct },
      variants,
      structural,
      uncorrected,
      winnerChanges:
        variants[2017].winnerChanges ||
        variants[2022].winnerChanges ||
        !!structural?.winnerChanges ||
        !!uncorrected?.winnerChanges,
    }
  })()

  if (secondRound.duel.kind === 'fallback') {
    warnings.push(
      'Duel hors source : les reports des législatives 2024 ne couvrent pas ce duel. Le 2nd tour utilise un modèle de repli entièrement fondé sur des hypothèses.',
    )
  }

  const balance = turnoutBalance(calibration.turnout, turnoutCoverage(settings), settings.turnoutExpected)
  if (balance && settings.turnoutEnabled) warnings.push(...turnoutWarnings(balance))

  return {
    hypothesisSet,
    allianceIds,
    estimatedAllianceIds: estimated.map((a) => a.id),
    allianceRates,
    allianceLeaks: leaks,
    pollUsage: usage,
    minorDonors: selection.donors,
    institutesUsed,
    firstRound,
    entrants,
    qualification: { gap, tight, picked, withSecond, withThird },
    secondRound,
    secondRoundPollBias: pollBiasGaps(data.secondRoundPollBias, polls),
    secondRoundSensitivity: sensitivity,
    turnoutBalance: balance,
    warnings,
  }
}
