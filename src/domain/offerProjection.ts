import { normalize, pollWeight } from './pollAverage'
import type { Bloc, Candidate, CandidateId, Hypothesis, Poll } from './types'

type Scores = Record<CandidateId, number>

/**
 * Transfert mesuré pour un candidat x sur paires propres intra-institut (`|H_avec \ H_sans| = 1`,
 * `H_sans \ H_avec = ∅`). `shares[y]` = part des voix de x qui va vers y quand x se retire (ou que x
 * prélève à y quand x s'ajoute), total 1.
 */
export interface PairTransfer {
  shares: Record<CandidateId, number>
  pairs: { institute: string; without: string; with: string }[]
  /** Score moyen observé de x dans les hypothèses qui le testent (pondéré fraîcheur/échantillon). */
  meanShare: number
}

export interface PairTransferModel {
  byCandidate: Record<CandidateId, PairTransfer>
}

/**
 * Mesure les coefficients de transfert de 1er tour à partir de toutes les paires propres mono-candidat
 * (exactement 1 candidat d'écart entre deux hypothèses du même institut).
 */
export function measurePairTransfers(
  polls: readonly Pick<Poll, 'institute' | 'fieldwork' | 'sampleSize' | 'hypotheses'>[],
  candidates: readonly Candidate[],
  asOf: string,
): PairTransferModel {
  const simulated = new Set(candidates.map((c) => c.id))
  const sums: Record<CandidateId, Record<CandidateId, number>> = {}
  const pairs: Record<CandidateId, { institute: string; without: string; with: string }[]> = {}
  const scoreAcc: Record<CandidateId, { sum: number; weight: number }> = {}

  for (const poll of polls) {
    const w = pollWeight(poll, asOf)
    // Score moyen observé de chaque candidat simulé dans ce sondage
    const perCand = new Map<CandidateId, number[]>()
    for (const h of poll.hypotheses) {
      const norm = normalize(h.scores)
      for (const [id, v] of Object.entries(norm)) {
        if (!simulated.has(id) || id in (h.replacing ?? {})) continue
        const list = perCand.get(id) ?? []
        list.push(v)
        perCand.set(id, list)
      }
    }
    for (const [id, vals] of perCand) {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      const acc = (scoreAcc[id] ??= { sum: 0, weight: 0 })
      acc.sum += avg * w
      acc.weight += w
    }

    // Paires propres mono-candidat : a = b ∪ {x}
    for (const a of poll.hypotheses) {
      for (const b of poll.hypotheses) {
        if (a === b) continue
        const added = Object.keys(a.scores).filter((id) => !(id in b.scores))
        if (added.length !== 1) continue
        const x = added[0]!
        if (!simulated.has(x)) continue
        const removed = Object.keys(b.scores).filter((id) => !(id in a.scores))
        if (removed.length !== 0) continue

        const withX = normalize(a.scores)
        const withoutX = normalize(b.scores)
        const deltas = Object.keys(withoutX)
          .filter((id) => simulated.has(id))
          .map((id) => [id, Math.max(0, withoutX[id]! - withX[id]!)] as const)
        const total = deltas.reduce((s, [, v]) => s + v, 0)
        if (total <= 0) continue
        const bucket = (sums[x] ??= {})
        for (const [id, v] of deltas) if (v > 0) bucket[id] = (bucket[id] ?? 0) + v / total
        ;(pairs[x] ??= []).push({ institute: poll.institute, without: b.id, with: a.id })
      }
    }
  }

  const byCandidate: Record<CandidateId, PairTransfer> = {}
  for (const c of candidates) {
    const p = pairs[c.id] ?? []
    const acc = scoreAcc[c.id]
    const meanShare = acc && acc.weight > 0 ? acc.sum / acc.weight : 0
    if (p.length === 0 && meanShare <= 0) continue
    const shares =
      p.length > 0
        ? Object.fromEntries(Object.entries(sums[c.id]!).map(([id, v]) => [id, v / p.length]))
        : {}
    byCandidate[c.id] = { shares, pairs: p, meanShare }
  }
  return { byCandidate }
}

/** Proximité entre blocs utilisée uniquement en dernier repli lorsqu'aucune paire propre n'existe pour un retrait. */
const BLOC_FALLBACK_WEIGHTS: Record<Bloc, Record<Bloc, number>> = {
  gauche: { gauche: 0.75, centre: 0.15, droite: 0.05, extreme_droite: 0.05 },
  centre: { gauche: 0.25, centre: 0.5, droite: 0.2, extreme_droite: 0.05 },
  droite: { gauche: 0.05, centre: 0.35, droite: 0.45, extreme_droite: 0.15 },
  extreme_droite: { gauche: 0.05, centre: 0.05, droite: 0.2, extreme_droite: 0.7 },
}

/**
 * Calcule la répartition de transfert d'un candidat `x` vers les candidats présents `presentIds` :
 * priorité aux paires propres mesurées ; à défaut, proximité par bloc pondérée par les scores actuels.
 */
function transferWeights(
  x: CandidateId,
  presentIds: CandidateId[],
  scores: Scores,
  model: PairTransferModel,
  candidatesById: Map<CandidateId, Candidate>,
): Record<CandidateId, number> {
  const measured = model.byCandidate[x]
  if (measured && measured.pairs.length > 0) {
    const valid = presentIds
      .map((id) => [id, measured.shares[id] ?? 0] as const)
      .filter(([, w]) => w > 0)
    const sum = valid.reduce((s, [, w]) => s + w, 0)
    if (sum > 0) return Object.fromEntries(valid.map(([id, w]) => [id, w / sum]))
  }
  const xBloc = candidatesById.get(x)?.bloc
  const raw = presentIds.map((id) => {
    const targetBloc = candidatesById.get(id)?.bloc
    const aff = xBloc && targetBloc ? BLOC_FALLBACK_WEIGHTS[xBloc][targetBloc] : 0.25
    return [id, aff * Math.max(0.5, scores[id] ?? 0)] as const
  })
  const sum = raw.reduce((s, [, w]) => s + w, 0)
  return sum > 0 ? Object.fromEntries(raw.map(([id, w]) => [id, w / sum])) : {}
}

/** Retire `x` d'une offre et redistribue ses voix selon `weights` (90 % redistribuées, 10 % absorbées par renormalisation). */
function removeCandidate(
  scores: Scores,
  x: CandidateId,
  model: PairTransferModel,
  candidatesById: Map<CandidateId, Candidate>,
): Scores {
  const share = scores[x] ?? 0
  const next: Scores = { ...scores }
  delete next[x]
  if (share <= 0) return normalize(next)
  const present = Object.keys(next)
  const weights = transferWeights(x, present, next, model, candidatesById)
  // Conservation de 90 % des voix sur les destinataires directs ; les 10 % résiduels représentent l'abstention
  // différentielle / reports diffus et sont absorbés par la renormalisation finale à 100 %.
  const direct = share * 0.9
  for (const [id, w] of Object.entries(weights)) next[id] = (next[id] ?? 0) + direct * w
  return normalize(next)
}

/** Ajoute `x` à une offre avec sa part moyenne observée, prélevée sur les candidats présents selon `weights`. */
function addCandidate(
  scores: Scores,
  x: CandidateId,
  share: number,
  model: PairTransferModel,
  candidatesById: Map<CandidateId, Candidate>,
): Scores {
  if (share <= 0) return normalize(scores)
  const present = Object.keys(scores)
  const weights = transferWeights(x, present, scores, model, candidatesById)
  const next: Scores = {}
  for (const id of present) {
    const v = scores[id] ?? 0
    next[id] = Math.max(0.1, v - share * (weights[id] ?? 0))
  }
  next[x] = share
  return normalize(next)
}

export interface ProjectedHypothesis {
  hypothesis: Hypothesis
  scores: Scores
  steps: string[]
  /** Pénalité composite (distance de projection + bruit hors-offre), pour choisir la meilleure hypothèse. */
  penalty: number
}

/** Nombre maximal d'ajustements (ajouts + retraits de candidats principaux/requis) permis pour projeter un sondage. */
export const MAX_PROJECTION_EDITS = 2

/**
 * Projette la meilleure hypothèse d'un sondage vers l'offre cible (`filter` + `targetKeep`) en utilisant
 * les coefficients de transfert mesurés sur paires propres. Retourne null si aucune hypothèse n'est à portée
 * (distance > MAX_PROJECTION_EDITS, ou candidat requis sans score observé ailleurs).
 */
export function projectHypothesis(
  poll: Pick<Poll, 'institute' | 'hypotheses'>,
  filter: { require: CandidateId[]; exclude: CandidateId[] },
  targetKeep: ReadonlySet<CandidateId>,
  model: PairTransferModel,
  candidates: readonly Candidate[],
): ProjectedHypothesis | null {
  const candidatesById = new Map(candidates.map((c) => [c.id, c]))
  const shortName = (id: CandidateId) => candidatesById.get(id)?.shortName ?? id
  let best: ProjectedHypothesis | null = null

  for (const h of poll.hypotheses) {
    // Écarter toute hypothèse qui teste un remplaçant d'un candidat exclu ou requis (ex. Hollande à la place de Glucksmann)
    const replaced = Object.values(h.replacing ?? {})
    if (filter.exclude.some((id) => replaced.includes(id))) continue
    if (filter.require.some((id) => replaced.includes(id))) continue

    const missing = filter.require.filter((id) => !(id in h.scores))
    const toRemove = filter.exclude.filter((id) => id in h.scores)
    const edits = missing.length + toRemove.length
    if (edits === 0 || edits > MAX_PROJECTION_EDITS) continue

    // Tous les candidats manquants doivent disposer d'un score moyen observé dans les autres sondages récents
    if (missing.some((id) => (model.byCandidate[id]?.meanShare ?? 0) <= 0)) continue

    // Bruit des candidats hors-offre présents dans h (ex. Lagarde 8 % + petits candidats hors-seuil)
    const offTargetMass = Object.entries(h.scores).reduce(
      (s, [id, v]) => s + (targetKeep.has(id) || toRemove.includes(id) ? 0 : v),
      0,
    )
    const penalty = edits * 4 + offTargetMass
    if (best && penalty >= best.penalty) continue

    // Projeter sur les candidats simulés de l'offre cible + ceux à retirer
    let current: Scores = normalize(
      Object.fromEntries(
        Object.entries(h.scores).filter(([id]) => targetKeep.has(id) || toRemove.includes(id)),
      ),
    )
    const steps: string[] = []
    for (const id of toRemove) {
      current = removeCandidate(current, id, model, candidatesById)
      steps.push(`−${shortName(id)}`)
    }
    for (const id of missing) {
      const share = model.byCandidate[id]!.meanShare
      current = addCandidate(current, id, share, model, candidatesById)
      steps.push(`+${shortName(id)}`)
    }
    best = { hypothesis: h, scores: current, steps, penalty }
  }

  return best
}
