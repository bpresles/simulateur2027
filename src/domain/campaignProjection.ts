import { addDays, daysBetween, normalize, POLL_HALF_LIFE_DAYS, pollWeight, weightedMeanByKey } from './pollAverage'
import { BLOCS } from './types'
import type {
  Bloc,
  CampaignProjectionResult,
  CampaignProjectionSettings,
  CampaignTrajectoryData,
  Candidate,
  CandidateId,
  CandidateProjectionDelta,
  CandidateUncertainty,
  HistoricalPoll,
  PoleConcentration,
  TrajectoryPoint,
} from './types'

type Scores = Record<CandidateId, number>

/** Horizon de référence (jours) à partir duquel la projection temporelle atteint son plein effet. */
export const PROJECTION_HORIZON_DAYS = 150

/**
 * Cibles de concentration intra-bloc inspirées des présidentielles 2017 et 2022 :
 * - gauche : 0,70 (moyenne observée : 70,8 % en 2017, 68,7 % en 2022) ;
 * - droite : 0,77 (moyenne observée : 94,3 % en 2017, 60,4 % en 2022) ;
 * - extrême droite : 0,75 (moyenne observée : 79,1 % en 2017, 71,7 % en 2022) ;
 * - centre : 0,75 (hypothèse non sourcée, plage de sensibilité 0,65–0,85 ; le centre n'avait qu'un seul candidat principal en 2012, 2017 et 2022, donc aucune mesure).
 * Dans le backtest croisé (`backtest.ts`), les cibles sont recalculées strictement sur l'autre élection.
 */
export const TARGET_CONCENTRATION: Record<Bloc, number> = {
  gauche: 0.7,
  centre: 0.75,
  droite: 0.77,
  extreme_droite: 0.75,
}
export const MERGED_CENTER_RIGHT_TARGET = 0.65

/**
 * Part des voix cédées lors du vote utile qui fuient vers les blocs voisins (réalisme non étanche).
 * Hypothèse non sourcée (aucune étude ni mesure du backtest), plage de sensibilité 0,06–0,18.
 */
export const CROSS_BLOC_LEAK = 0.12

/** Plancher minimal protégé pour les petits partis identitaires (évite d'effacer un candidat à 0 %). */
export const CANDIDATE_FLOOR = 0.5

/**
 * Fondamentaux structurels par bloc (50 % présidentielles 2017–2022 + 50 % scrutins nationaux 2024),
 * utilisés uniquement pour un léger amortissement des écarts précoces qui s'annule le jour du scrutin.
 */
export const PRIOR_BLOC_SHARES: Record<Bloc, number> = {
  gauche: 30,
  centre: 21,
  droite: 17,
  extreme_droite: 32,
}

/** Poids maximal du prior structurel à J−150 lorsque `meanReversion = 1`. */
export const MAX_PRIOR_WEIGHT = 0.25

/** Demi-vie d'amortissement de la tendance récente (jours) et plafond en points par candidat. */
export const TREND_DAMPING_DAYS = 21
export const MAX_TREND_PTS = 2.5

/** Proximités de fuite inter-blocs lors du vote utile (total 1 hors du bloc d'origine). */
const LEAK_TARGETS: Record<Bloc, Record<Bloc, number>> = {
  gauche: { gauche: 0, centre: 0.65, droite: 0.15, extreme_droite: 0.2 },
  centre: { gauche: 0.35, centre: 0, droite: 0.5, extreme_droite: 0.15 },
  droite: { gauche: 0.05, centre: 0.55, droite: 0, extreme_droite: 0.4 },
  extreme_droite: { gauche: 0.15, centre: 0.2, droite: 0.65, extreme_droite: 0 },
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function defaultProjectionSettings(): CampaignProjectionSettings {
  return {
    // Activée par défaut (décision du 23/11/2026, v2.2) bien que le critère de validation croisée 2012/2017/2022
    // ne soit pas atteint (2017 dégradé) : voir `docs/changelog-methode.md`.
    enabled: true,
    usefulVote: {
      gauche: { intensity: 1, beneficiary: 'auto' },
      centre: { intensity: 1, beneficiary: 'auto' },
      droite: { intensity: 1, beneficiary: 'auto' },
      extreme_droite: { intensity: 1, beneficiary: 'auto' },
    },
    mergeCenterRight: false,
    // Désactivés par défaut (v2.1) : moyennes structurelles non validées hors échantillon et tendance non testée.
    meanReversion: 0,
    dampedTrend: 0,
  }
}

/**
 * Estime une tendance récente fortement amortie à partir de l'historique des vagues (comparaison pondérée
 * des 14–21 derniers jours contre les 4 semaines précédentes). La contribution cumulée s'amortit
 * exponentiellement avec une constante de temps de 21 jours et reste plafonnée à ±2,5 pts.
 */
export function computeDampedTrend(
  history: readonly HistoricalPoll[],
  activeIds: readonly CandidateId[],
  asOf: string,
  daysRemaining: number,
  strength: number,
): Scores {
  const zeros: Scores = Object.fromEntries(activeIds.map((id) => [id, 0]))
  if (strength <= 0 || daysRemaining <= 0 || history.length < 4) return zeros

  const recentStart = addDays(asOf, -21)
  const priorStart = addDays(asOf, -63)
  const recent = history.filter((p) => p.fieldwork.end > recentStart && p.fieldwork.end <= asOf)
  const prior = history.filter((p) => p.fieldwork.end >= priorStart && p.fieldwork.end <= recentStart)
  if (recent.length < 2 || prior.length < 2) return zeros

  const avgRecent = weightedMeanByKey(recent.map((p) => ({ scores: p.scores, weight: pollWeight(p, asOf) })))
  const avgPrior = weightedMeanByKey(prior.map((p) => ({ scores: p.scores, weight: pollWeight(p, recentStart) })))

  // Distance moyenne (en jours) entre les deux fenêtres
  const meanDateDays = (list: readonly HistoricalPoll[]) =>
    list.reduce((s, p) => s + daysBetween(priorStart, p.fieldwork.end), 0) / list.length
  const spanDays = Math.max(14, meanDateDays(recent) - meanDateDays(prior))

  // Amortissement exponentiel : intégrale de exp(-t / tau) de 0 à daysRemaining = tau * (1 - exp(-d / tau))
  const effectiveHorizonDays = TREND_DAMPING_DAYS * (1 - Math.exp(-daysRemaining / TREND_DAMPING_DAYS))
  const raw: Scores = {}
  let sum = 0
  let count = 0
  for (const id of activeIds) {
    if (avgRecent[id] === undefined || avgPrior[id] === undefined) {
      raw[id] = 0
      continue
    }
    const dailySlope = (avgRecent[id]! - avgPrior[id]!) / spanDays
    const delta = clamp(dailySlope * effectiveHorizonDays * clamp(strength, 0, 1), -MAX_TREND_PTS, MAX_TREND_PTS)
    raw[id] = delta
    sum += delta
    count += 1
  }
  if (count === 0) return zeros
  // Centrage à somme nulle sur les candidats ayant une tendance mesurée
  const meanShift = sum / count
  return Object.fromEntries(
    activeIds.map((id) => [id, avgRecent[id] !== undefined && avgPrior[id] !== undefined ? raw[id]! - meanShift : 0]),
  )
}

interface PoleSpec {
  id: PoleConcentration['pole']
  blocs: Bloc[]
  target: number
  intensity: number
  beneficiary: CandidateId | 'auto'
}

/**
 * Applique la projection temporelle complète (vote utile par bloc + léger amortissement des écarts précoces
 * + tendance récente amortie) à un vecteur de scores courants `baseScores` (total 100).
 *
 * Chaque mécanisme décroît continûment avec le temps restant (`horizonFactor = min(1, days / 150)`) et
 * s'annule exactement le jour du scrutin.
 */
export function projectCampaign(
  baseScores: Scores,
  candidates: readonly Candidate[],
  settings: CampaignProjectionSettings,
  history: readonly HistoricalPoll[],
  asOf: string,
  electionDate: string,
  /** Fraction d'avancement entre aujourd'hui (0) et le 1er tour (1), utile pour tracer la trajectoire. */
  progress = 1,
  /** Surcharge des cibles de concentration (utilisée par le backtest croisé strictement hors échantillon). */
  targetOverrides?: Partial<Record<Bloc, number>>,
  /** Surcharge de `CROSS_BLOC_LEAK` (tableau de sensibilité uniquement). */
  leakOverride?: number,
): CampaignProjectionResult {
  const daysRemaining = Math.max(0, daysBetween(asOf, electionDate))
  const horizonFactor = clamp(daysRemaining / PROJECTION_HORIZON_DAYS, 0, 1)
  const t = clamp(progress, 0, 1)
  const activeIds = Object.keys(baseScores)
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const crossBlocLeak = leakOverride ?? CROSS_BLOC_LEAK
  const targetFor = (b: Bloc) => targetOverrides?.[b] ?? TARGET_CONCENTRATION[b]

  // Courbe d'accélération du vote utile en fin de campagne (l'essentiel se joue dans les 2 derniers mois)
  const usefulVoteProgress = t ** 1.35
  const reversionProgress = t

  // 1. Vote utile par pôle (4 blocs séparés par défaut, ou centre + droite fusionnés en option)
  const polesSpec: PoleSpec[] = settings.mergeCenterRight
    ? [
        {
          id: 'gauche',
          blocs: ['gauche'],
          target: targetFor('gauche'),
          intensity: clamp(settings.usefulVote.gauche.intensity, 0, 1),
          beneficiary: settings.usefulVote.gauche.beneficiary,
        },
        {
          id: 'centre_droite',
          blocs: ['centre', 'droite'],
          target: MERGED_CENTER_RIGHT_TARGET,
          intensity: clamp(
            (settings.usefulVote.centre.intensity + settings.usefulVote.droite.intensity) / 2,
            0,
            1,
          ),
          beneficiary:
            settings.usefulVote.centre.beneficiary !== 'auto'
              ? settings.usefulVote.centre.beneficiary
              : settings.usefulVote.droite.beneficiary,
        },
        {
          id: 'extreme_droite',
          blocs: ['extreme_droite'],
          target: targetFor('extreme_droite'),
          intensity: clamp(settings.usefulVote.extreme_droite.intensity, 0, 1),
          beneficiary: settings.usefulVote.extreme_droite.beneficiary,
        },
      ]
    : BLOCS.map((b) => ({
        id: b,
        blocs: [b],
        target: targetFor(b),
        intensity: clamp(settings.usefulVote[b].intensity, 0, 1),
        beneficiary: settings.usefulVote[b].beneficiary,
      }))

  const afterUseful: Scores = { ...baseScores }
  const leakPool: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }
  const polesBefore = new Map<PoleConcentration['pole'], { total: number; share: number; beneficiary: CandidateId | null; target: number; saturated: boolean }>()

  for (const spec of polesSpec) {
    const members = activeIds.filter((id) => {
      const b = byId.get(id)?.bloc
      return b !== null && b !== undefined && spec.blocs.includes(b)
    })
    const total = members.reduce((s, id) => s + (baseScores[id] ?? 0), 0)
    if (members.length === 0 || total <= 0) {
      polesBefore.set(spec.id, { total: 0, share: 0, beneficiary: null, target: spec.target, saturated: true })
      continue
    }
    const chosen =
      spec.beneficiary !== 'auto' && members.includes(spec.beneficiary)
        ? spec.beneficiary
        : members.reduce((a, b) => ((baseScores[a] ?? 0) >= (baseScores[b] ?? 0) ? a : b))
    const s0 = (baseScores[chosen] ?? 0) / total
    const saturated = s0 >= spec.target || members.length < 2
    polesBefore.set(spec.id, { total, share: s0, beneficiary: chosen, target: spec.target, saturated })

    if (saturated || spec.intensity <= 0 || horizonFactor <= 0 || usefulVoteProgress <= 0) continue

    const targetEffective = s0 + (spec.target - s0) * spec.intensity * horizonFactor * usefulVoteProgress
    const desiredGain = Math.max(0, total * (targetEffective - s0))
    const others = members.filter((id) => id !== chosen)
    const leaderScore = Math.max(1, baseScores[chosen] ?? 1)

    // Un candidat secondaire faible cède plus facilement qu'un co-favori proche du leader
    const donors = others.map((id) => {
      const sc = baseScores[id] ?? 0
      const avail = Math.max(0, sc - Math.min(sc, CANDIDATE_FLOOR))
      const ratio = clamp(sc / leaderScore, 0, 1.5)
      const drainFactor = clamp(1.05 - 0.75 * ratio, 0.2, 1)
      return { id, bloc: byId.get(id)!.bloc!, avail, weight: avail * drainFactor }
    })
    const totalWeight = donors.reduce((s, d) => s + d.weight, 0)
    if (totalWeight <= 0) continue

    // Masse brute cédée = desiredGain / (1 - crossBlocLeak) afin que le gain net approche la cible
    const grossNeeded = desiredGain / (1 - crossBlocLeak)
    let totalGiven = 0
    for (const d of donors) {
      const give = Math.min(d.avail, (grossNeeded * d.weight) / totalWeight)
      afterUseful[d.id] = (afterUseful[d.id] ?? 0) - give
      totalGiven += give
      // Fuite réaliste (12 %) vers les blocs voisins
      const leak = give * crossBlocLeak
      const leakMap = LEAK_TARGETS[d.bloc]
      for (const targetBloc of BLOCS) {
        if (!spec.blocs.includes(targetBloc)) {
          leakPool[targetBloc] += leak * leakMap[targetBloc]
        }
      }
    }
    afterUseful[chosen] = (afterUseful[chosen] ?? 0) + totalGiven * (1 - crossBlocLeak)
  }

  // Distribution des fuites inter-blocs au prorata des candidats actifs de chaque bloc destinataire
  for (const b of BLOCS) {
    const incoming = leakPool[b]
    if (incoming <= 0) continue
    const receivers = activeIds.filter((id) => byId.get(id)?.bloc === b)
    const sumRec = receivers.reduce((s, id) => s + (afterUseful[id] ?? 0), 0)
    if (sumRec <= 0) continue
    for (const id of receivers) afterUseful[id] = (afterUseful[id] ?? 0) + (incoming * afterUseful[id]!) / sumRec
  }
  const normalizedUseful = normalize(afterUseful)

  // 2. Léger amortissement des écarts précoces vers les fondamentaux de blocs (s'annule à J−0)
  const afterReversion: Scores = { ...normalizedUseful }
  const priorW = MAX_PRIOR_WEIGHT * clamp(settings.meanReversion, 0, 1) * horizonFactor * reversionProgress
  if (priorW > 0) {
    const blocTotals: Record<Bloc, number> = { gauche: 0, centre: 0, droite: 0, extreme_droite: 0 }
    for (const id of activeIds) {
      const b = byId.get(id)?.bloc
      if (b) blocTotals[b] += normalizedUseful[id] ?? 0
    }
    const classifiedTotal = BLOCS.reduce((s, b) => s + blocTotals[b], 0)
    if (classifiedTotal > 0) {
      for (const b of BLOCS) {
        if (blocTotals[b] <= 0) continue
        const targetBloc = blocTotals[b] * (1 - priorW) + ((PRIOR_BLOC_SHARES[b] * classifiedTotal) / 100) * priorW
        const mult = targetBloc / blocTotals[b]
        for (const id of activeIds) {
          if (byId.get(id)?.bloc === b) afterReversion[id] = (normalizedUseful[id] ?? 0) * mult
        }
      }
    }
  }
  const normalizedReversion = normalize(afterReversion)

  // 3. Tendance récente amortie sur 21 jours (calculée sur l'historique réel)
  const trendElapsedDays = daysRemaining * t
  const trendShifts = computeDampedTrend(history, activeIds, asOf, trendElapsedDays, settings.dampedTrend)
  const afterTrend: Scores = {}
  for (const id of activeIds) {
    const base = normalizedReversion[id] ?? 0
    afterTrend[id] = Math.max(Math.min(base, 0.2), base + (trendShifts[id] ?? 0))
  }
  const projectedScores = normalize(afterTrend)

  // Décomposition par candidat et concentrations finales par pôle
  const byCandidate: Record<CandidateId, CandidateProjectionDelta> = Object.fromEntries(
    activeIds.map((id) => {
      const cur = baseScores[id] ?? 0
      const u = normalizedUseful[id] ?? cur
      const r = normalizedReversion[id] ?? u
      const p = projectedScores[id] ?? r
      return [
        id,
        {
          candidateId: id,
          current: cur,
          usefulVoteDelta: u - cur,
          reversionDelta: r - u,
          trendDelta: p - r,
          projected: p,
        },
      ]
    }),
  )

  const poles: PoleConcentration[] = polesSpec.map((spec) => {
    const pre = polesBefore.get(spec.id)!
    const members = activeIds.filter((id) => {
      const b = byId.get(id)?.bloc
      return b !== null && b !== undefined && spec.blocs.includes(b)
    })
    const totalAfter = members.reduce((s, id) => s + (projectedScores[id] ?? 0), 0)
    const shareAfter = pre.beneficiary && totalAfter > 0 ? (projectedScores[pre.beneficiary] ?? 0) / totalAfter : 0
    return {
      pole: spec.id,
      beneficiary: pre.beneficiary,
      totalBefore: pre.total,
      totalAfter,
      shareBefore: pre.share,
      shareAfter,
      targetShare: pre.target,
      saturated: pre.saturated,
    }
  })

  return {
    enabled: settings.enabled,
    daysRemaining,
    horizonFactor,
    byCandidate,
    poles,
    projectedScores,
  }
}

/**
 * Construit la série temporelle complète pour le graphique de trajectoire :
 * - Passé (`history`) : moyenne pondérée glissante (demi-vie 14 jours) sur les vagues 2025–2027 ;
 * - Aujourd'hui (`now`) : photographie pondérée actuelle `baseScores` ;
 * - Futur (`projection`, jusqu'à `electionDate`) : ajouté uniquement lorsque la projection est activée,
 *   entouré du cône d'incertitude à 80 % (P10–P90). En mode photographie actuelle, la série s'arrête à `asOf`.
 */
export function buildTrajectory(
  history: readonly HistoricalPoll[],
  baseScores: Scores,
  candidates: readonly Candidate[],
  settings: CampaignProjectionSettings,
  asOf: string,
  electionDate: string,
  mcCandidates: Record<CandidateId, CandidateUncertainty>,
): CampaignTrajectoryData {
  const activeIds = Object.keys(baseScores)
  const sortedActive = [...activeIds].sort((a, b) => (baseScores[b] ?? 0) - (baseScores[a] ?? 0))
  const trackedIds = sortedActive.slice(0, 6)
  const points: TrajectoryPoint[] = []

  // 1. Points historiques (tous les 14 jours depuis 10 mois avant asOf, ou depuis le premier sondage disponible)
  const validHistory = history
    .filter((p) => p.fieldwork.end <= asOf)
    .sort((a, b) => a.fieldwork.end.localeCompare(b.fieldwork.end))

  if (validHistory.length > 0) {
    const earliest = validHistory[0]!.fieldwork.end
    const tenMonthsAgo = addDays(asOf, -300)
    const start = earliest > tenMonthsAgo ? earliest : tenMonthsAgo
    const totalHistDays = Math.max(0, daysBetween(start, asOf))
    const stepDays = totalHistDays > 180 ? 14 : 7

    for (let d = 0; d < totalHistDays; d += stepDays) {
      const dt = addDays(start, d)
      if (daysBetween(dt, asOf) < 5) break
      const windowStart = addDays(dt, -42)
      const inWin = validHistory.filter((p) => p.fieldwork.end >= windowStart && p.fieldwork.end <= dt)
      if (inWin.length === 0) continue
      const smoothed = weightedMeanByKey(
        inWin.map((p) => ({
          scores: p.scores,
          weight: pollWeight(p, dt, POLL_HALF_LIFE_DAYS),
        })),
      )
      const scores: Scores = {}
      for (const id of trackedIds) {
        if (smoothed[id] !== undefined) scores[id] = smoothed[id]!
      }
      if (Object.keys(scores).length > 0) points.push({ date: dt, kind: 'history', scores })
    }
  }

  // 2. Point « Aujourd'hui » (asOf)
  const nowScores: Scores = Object.fromEntries(trackedIds.map((id) => [id, baseScores[id] ?? 0]))
  const nowP10: Scores = {}
  const nowP90: Scores = {}
  for (const id of trackedIds) {
    const cur = baseScores[id] ?? 0
    // Bruit de sondage pur à t = 0 (~±1,5–2 pts à 80 % pour un candidat à 20–30 %)
    const pollHalf = Math.max(0.4, Math.sqrt((cur * (100 - cur)) / 100) * 0.35)
    nowP10[id] = Math.max(0, cur - pollHalf)
    nowP90[id] = Math.min(100, cur + pollHalf)
  }
  points.push({ date: asOf, kind: 'now', scores: nowScores, p10: nowP10, p90: nowP90 })

  // 3. Points futurs (de asOf jusqu'au 1er tour d'avril 2027) — uniquement si la projection est activée
  const daysToElection = Math.max(0, daysBetween(asOf, electionDate))
  if (settings.enabled && daysToElection > 0) {
    const steps = Math.max(4, Math.round(daysToElection / 14))
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps
      const dt = i === steps ? electionDate : addDays(asOf, Math.round(daysToElection * progress))
      const proj = projectCampaign(
        baseScores,
        candidates,
        settings,
        validHistory,
        asOf,
        electionDate,
        progress,
      ).projectedScores
      const growth = Math.sqrt(progress)
      const scores: Scores = {}
      const p10: Scores = {}
      const p90: Scores = {}
      for (const id of trackedIds) {
        const sc = proj[id] ?? 0
        scores[id] = sc
        const mc = mcCandidates[id]
        if (mc) {
          const lowSpread = Math.max(0, mc.median - mc.p10)
          const highSpread = Math.max(0, mc.p90 - mc.median)
          const pollHalf = nowP90[id]! - nowScores[id]!
          const lo = pollHalf + (lowSpread - pollHalf) * growth
          const hi = pollHalf + (highSpread - pollHalf) * growth
          p10[id] = Math.max(0, sc - Math.max(pollHalf, lo))
          p90[id] = Math.min(100, sc + Math.max(pollHalf, hi))
        } else {
          p10[id] = sc
          p90[id] = sc
        }
      }
      points.push({ date: dt, kind: 'projection', scores, p10, p90 })
    }
  }

  return {
    asOf,
    electionDate,
    trackedIds,
    historyPollCount: validHistory.length,
    points,
  }
}
