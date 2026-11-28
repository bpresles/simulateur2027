import { acceptAlliances, defaultSet, majorityOfferSet, scenarioFilter, scenarioSet } from './alliances'
import { buildTrajectory, defaultProjectionSettings, projectCampaign } from './campaignProjection'
import { runMonteCarlo } from './monteCarlo'
import type { CandidacyScenario } from './monteCarlo'
import { newVoterRates } from './newVoters'
import { averagePolls } from './pollAverage'
import { betweenRoundsLastDayGap, computeSecondRound, pollBiasGaps } from './secondRound'
import {
  DEFAULT_LFI_LEFT_TRANSFER_RANGE,
  defaultRepublicanFront,
  effectiveAbstainerAntiRnShare,
  effectiveProfiles,
  fidelityFor,
  frontStrengthForDuel,
  minorTransferParts,
  resolveDuel,
} from './transfers'
import type {
  Bloc,
  CandidateId,
  Entrant,
  FirstRoundRow,
  SecondRoundResult,
  Settings,
  SimulationData,
  SimulationResult,
} from './types'

export function defaultSettings(): Settings {
  return {
    excludedPolls: [],
    alliances: {},
    offerProjectionEnabled: true,
    projection: defaultProjectionSettings(),
    transferSource: 'legislatives2024',
    declaredWeight: 0.5,
    republicanFront: defaultRepublicanFront(),
    lfiLeftTransferRange: [...DEFAULT_LFI_LEFT_TRANSFER_RANGE],
    candidacyUncertaintyEnabled: true,
    transferOverrides: {},
    minorTransfers: {},
    fidelity: null,
    firstRoundTurnout: 74,
    abstainerMobilization: 0.225,
    abstainerAntiRnShare: null,
    betweenRoundsBias: 'mean',
    selectedDuel: null,
  }
}

/** Fréquence minimale (%) dans Monte-Carlo pour proposer un duel alternatif dans « Duels plausibles ». */
export const PLAUSIBLE_DUEL_MIN_FREQUENCY = 30

/**
 * Pondérations explicites de scénarios de candidatures testés : hypothèse non sourcée (jugement),
 * sensibilité : poids uniformes. Déclarations datées et liens : `docs/changelog-methode.md` (v2.2).
 * Activées uniquement lorsque l'utilisateur coche l'option `candidacyUncertaintyEnabled` sans alliance forcée.
 */
const CANDIDACY_SCENARIO_WEIGHTS: { id: string; weight: number }[] = [
  { id: 'philippe-lisnard', weight: 0.4 },
  { id: 'philippe-seul', weight: 0.3 },
  { id: 'philippe-attal', weight: 0.15 },
  { id: 'attal-seul', weight: 0.1 },
  { id: 'lagarde-seule', weight: 0.05 },
]

export interface SimulateOptions {
  /** Nombre de tirages Monte-Carlo (défaut : 2 000). Le tableau de sensibilité utilise 1 : seul le score central déterministe est lu. */
  monteCarloIterations?: number
  /** Surcharges de la projection de campagne (tableau de sensibilité uniquement). */
  projectionTargets?: Partial<Record<Bloc, number>>
  crossBlocLeak?: number
}

/** Pipeline complet : sondages pondérés + projection d'offre → projection temporelle (option) → 2nd tour en flux bruts → Monte-Carlo. */
export function simulate(data: SimulationData, settings: Settings, options: SimulateOptions = {}): SimulationResult {
  const { polls, pollHistory, transfers, declaredTransfers } = data
  const candidatesById = new Map(polls.candidates.map((c) => [c.id, c]))
  const name = (id: string) => candidatesById.get(id)?.name ?? id
  const warnings: string[] = []

  const tested = acceptAlliances(polls, settings.alliances)
  const excluded = new Set(settings.excludedPolls)

  let selection = averagePolls(polls, scenarioFilter(polls, tested), excluded, settings.minorTransfers, {
    offerProjection: settings.offerProjectionEnabled,
  })
  let hypothesisSet = scenarioSet(polls, tested, name)
  if (selection.institutesUsed === 0 && tested.length === 0) {
    selection = averagePolls(polls, defaultSet(polls), excluded, settings.minorTransfers, {
      offerProjection: settings.offerProjectionEnabled,
    })
    hypothesisSet = defaultSet(polls)
    if (selection.institutesUsed > 0) {
      warnings.push('Aucun sondage ne teste tous les candidats simulés : hypothèses des seuls candidats principaux.')
    }
  }
  if (selection.institutesUsed < 2 && tested.length === 0) {
    const fallbackSet = majorityOfferSet(polls, excluded)
    if (fallbackSet) {
      const fallbackSel = averagePolls(polls, fallbackSet, excluded, settings.minorTransfers, {
        offerProjection: settings.offerProjectionEnabled,
      })
      if (fallbackSel.institutesUsed > selection.institutesUsed) {
        selection = fallbackSel
        hypothesisSet = fallbackSet
        warnings.push(
          'L’offre par défaut n’est plus assez testée par les sondages récents : repli automatique sur les candidats principaux présents dans au moins la moitié des instituts.',
        )
      }
    }
  }

  const { usage, average: currentAverage, institutesUsed, projectedInstitutes, eligibleMinors, excludedMinors } = selection
  const allianceIds = institutesUsed > 0 ? tested.map((a) => a.id) : []

  // Projection temporelle vers avril/mai 2027 (toujours calculée pour les aperçus, appliquée si activée)
  const projection = projectCampaign(
    currentAverage,
    polls.candidates,
    settings.projection,
    pollHistory.polls,
    polls.asOf,
    polls.electionDate,
    1,
    options.projectionTargets,
    options.crossBlocLeak,
  )
  const activeScores = settings.projection.enabled ? projection.projectedScores : currentAverage

  const firstRound: FirstRoundRow[] = polls.candidates
    .filter((c) => activeScores[c.id] !== undefined)
    .map((c) => ({
      candidateId: c.id,
      score: activeScores[c.id]!,
      currentScore: currentAverage[c.id] ?? activeScores[c.id]!,
    }))
  const entrants: Entrant[] = [...firstRound]
    .map((r) => ({ id: r.candidateId, score: r.score }))
    .sort((x, y) => y.score - x.score)

  const [first, second] = entrants
  if (!first || !second) throw new Error('Moins de deux candidats au 1er tour')

  const rnId = polls.candidates.find((c) => c.isRN)?.id ?? 'lepen'
  const profiles = effectiveProfiles(transfers, declaredTransfers, settings, { rnId })
  const minorTransfers = minorTransferParts(polls.candidates, settings.minorTransfers)
  const { bnShare } = newVoterRates(data)
  const betweenRoundsShiftPts = betweenRoundsLastDayGap(data.secondRoundPollBias, settings.betweenRoundsBias)

  const evaluateDuel = (aId: CandidateId, bId: CandidateId): SecondRoundResult => {
    const duel = resolveDuel(aId, bId, candidatesById)
    const rfStrength = frontStrengthForDuel(duel, settings.republicanFront)
    const isRnDuel = duel.kind === 'rn-sourced'
    const fidOpts = (id: CandidateId) => ({
      declaredTransfers,
      transferSource: settings.transferSource,
      declaredWeight: settings.declaredWeight,
      isRnDuel,
      isRnFinalist: duel.rnId === id,
    })
    const baseInput = {
      electorate: activeScores,
      a: aId,
      b: bId,
      duel,
      nonRnPresidential: transfers.nonRnPresidential,
      fidelityA: fidelityFor(aId, transfers, settings.fidelity, fidOpts(aId)),
      fidelityB: fidelityFor(bId, transfers, settings.fidelity, fidOpts(bId)),
      candidatesById,
      firstRoundTurnout: settings.firstRoundTurnout,
      blankNullShare: bnShare,
      abstainerMobilization: settings.abstainerMobilization,
      abstainerAntiRnShare: effectiveAbstainerAntiRnShare(settings.abstainerAntiRnShare, rfStrength),
      republicanFrontStrength: rfStrength,
      betweenRoundsBiasMode: settings.betweenRoundsBias,
      betweenRoundsShiftPts,
      secondRoundPolls: polls.secondRoundPolls,
      minorTransfers,
    }
    const res = computeSecondRound({ ...baseInput, profiles })
    const isLfiRn =
      duel.kind === 'rn-sourced' &&
      duel.profileWeights[0]?.profileId === 'lfi_rn' &&
      settings.transferSource !== 'declared2027' &&
      !settings.transferOverrides.lfi_rn?.gauche
    if (isLfiRn) {
      const lowRate = Math.min(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1])
      const highRate = Math.max(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1])
      const lowProf = effectiveProfiles(transfers, declaredTransfers, settings, { rnId, lfiLeftTransfer: lowRate })
      const highProf = effectiveProfiles(transfers, declaredTransfers, settings, { rnId, lfiLeftTransfer: highRate })
      const lowRes = computeSecondRound({ ...baseInput, profiles: lowProf })
      const highRes = computeSecondRound({ ...baseInput, profiles: highProf })
      const rnIsA = duel.rnId === aId
      res.lfiLeftSensitivity = {
        lowRate,
        highRate,
        rnAtLow: rnIsA ? lowRes.pct.a : lowRes.pct.b,
        rnAtHigh: rnIsA ? highRes.pct.a : highRes.pct.b,
        currentRate: Math.round(profiles.lfi_rn.gauche.finalist),
      }
    } else {
      res.lfiLeftSensitivity = null
    }
    return res
  }

  const parseSelected = (): [CandidateId, CandidateId] | null => {
    if (!settings.selectedDuel) return null
    const parts = settings.selectedDuel.split('|')
    if (parts.length !== 2) return null
    const [aId, bId] = parts as [CandidateId, CandidateId]
    if (aId === bId || activeScores[aId] === undefined || activeScores[bId] === undefined) return null
    return [aId, bId]
  }
  const displayedPair: [CandidateId, CandidateId] = parseSelected() ?? [first.id, second.id]

  // Scénarios de candidatures pondérés optionnels (désactivés automatiquement dès que la liste officielle est arrêtée)
  let candidacyScenarios: CandidacyScenario[] | undefined
  if (settings.candidacyUncertaintyEnabled && !polls.officialList && tested.length === 0) {
    const built: CandidacyScenario[] = []
    for (const spec of CANDIDACY_SCENARIO_WEIGHTS) {
      const set = polls.hypothesisSets.find((s) => s.id === spec.id)
      if (!set) continue
      const sel = averagePolls(polls, set, excluded, settings.minorTransfers, {
        offerProjection: settings.offerProjectionEnabled,
      })
      if (sel.institutesUsed === 0) continue
      const scScores = settings.projection.enabled
        ? projectCampaign(
            sel.average,
            polls.candidates,
            settings.projection,
            pollHistory.polls,
            polls.asOf,
            polls.electionDate,
            1,
            options.projectionTargets,
            options.crossBlocLeak,
          ).projectedScores
        : sel.average
      built.push({ id: spec.id, weight: spec.weight, scores: scScores })
    }
    if (built.length >= 2) candidacyScenarios = built
  }

  const monteCarlo = runMonteCarlo({
    data,
    settings,
    baseScores: activeScores,
    candidatesById,
    minorTransfers,
    blankNullShare: bnShare,
    displayedDuel: displayedPair,
    candidacyScenarios,
    iterations: options.monteCarloIterations,
  })

  const trajectory = buildTrajectory(
    pollHistory.polls,
    currentAverage,
    polls.candidates,
    settings.projection,
    polls.asOf,
    polls.electionDate,
    monteCarlo.candidates,
  )

  const seen = new Set<string>()
  const selectablePairs: { id: string; a: CandidateId; b: CandidateId; frequency: number }[] = []
  const addPair = (a: CandidateId, b: CandidateId) => {
    const canonical = [a, b].sort().join('::')
    if (seen.has(canonical)) return
    seen.add(canonical)
    const mc = monteCarlo.topDuels.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a))
    selectablePairs.push({ id: `${a}|${b}`, a, b, frequency: mc?.frequency ?? 0 })
  }
  addPair(first.id, second.id)
  for (const d of monteCarlo.topDuels) {
    if (d.frequency > PLAUSIBLE_DUEL_MIN_FREQUENCY) addPair(d.a, d.b)
  }
  if (displayedPair[0] !== first.id || displayedPair[1] !== second.id) {
    addPair(displayedPair[0], displayedPair[1])
  }

  const selectableDuels = selectablePairs
    .sort((x, y) => {
      const xIsTop2 = x.a === first.id && x.b === second.id
      const yIsTop2 = y.a === first.id && y.b === second.id
      if (xIsTop2 !== yIsTop2) return xIsTop2 ? -1 : 1
      return y.frequency - x.frequency
    })
    .map((p) => ({ ...p, result: evaluateDuel(p.a, p.b) }))

  const secondRound =
    selectableDuels.find((d) => d.a === displayedPair[0] && d.b === displayedPair[1])?.result ??
    evaluateDuel(displayedPair[0], displayedPair[1])

  const hypothesis = `l’hypothèse « ${hypothesisSet.label} »`
  if (usage.some((u) => u.status === 'used' && excluded.has(u.poll.id))) {
    warnings.push(`Aucun des sondages cochés ne teste ${hypothesis} : tous les sondages disponibles sont retenus.`)
  } else if (!usage.some((u) => u.status === 'excluded') && institutesUsed < 3) {
    const institutes = usage.filter((u) => u.status === 'used').map((u) => u.poll.institute)
    warnings.push(
      `Seulement ${institutesUsed} institut${institutesUsed > 1 ? 's' : ''} (${institutes.join(', ')}) pour ${hypothesis} : moyenne fragile.`,
    )
  }
  if (secondRound.duel.kind === 'non-rn-same-side') {
    warnings.push(
      'Duel entre deux candidats du même camp : sans mesure historique directe, le 2nd tour repose sur une matrice de repli symétrique.',
    )
  }

  return {
    hypothesisSet,
    allianceIds,
    pollUsage: usage,
    minorDonors: selection.donors,
    eligibleMinors,
    excludedMinors,
    institutesUsed,
    projectedInstitutes,
    firstRound,
    entrants,
    projection,
    trajectory,
    secondRound,
    selectableDuels,
    secondRoundPollBias: pollBiasGaps(data.secondRoundPollBias, polls),
    monteCarlo,
    warnings,
  }
}
