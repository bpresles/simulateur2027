import { addDays, latestPerInstitute, meanByKey, normalize } from './pollAverage'
import { blendedRatio, referenceParts } from './references'
import type { Candidate, CandidateId, FirstRoundRow, Reference2022, Reference2022Poll, Settings } from './types'

export interface Reference2022Stats {
  pollsUsed: Reference2022Poll[]
  /** Moyenne des derniers sondages par institut, normalisée à 100. */
  pollAverage: Record<string, number>
  /** Résultat officiel en % des suffrages exprimés. */
  result: Record<string, number>
  /** résultat / moyenne des sondages. */
  ratio: Record<string, number>
}

export function computeReference2022(ref: Reference2022): Reference2022Stats {
  // La fenêtre se termine la veille du scrutin : aucun sondage n'est publié le jour du vote.
  const asOf = addDays(ref.electionDate, -1)
  const { latest } = latestPerInstitute(ref.polls, asOf, ref.windowDays)
  const pollAverage = normalize(meanByKey(latest.map((p) => normalize(p.scores))))
  const result = Object.fromEntries(ref.candidates.map((c) => [c.id, (c.votes * 100) / ref.expressed]))
  const ratio = Object.fromEntries(
    ref.candidates.flatMap((c) => {
      const avg = pollAverage[c.id]
      const res = result[c.id]
      return avg && res !== undefined ? [[c.id, res / avg]] : []
    }),
  )
  return { pollsUsed: latest, pollAverage, result, ratio }
}

/**
 * Correction par défaut d'un candidat, en points : base × (ratio 2022 − 1).
 * Exemple : un candidat sous-estimé de 28 % en 2022 et sondé à 15 % reçoit +4,2 pts.
 */
export function defaultCorrection(base: number, ratio: number | null): number {
  return ratio === null ? 0 : base * (ratio - 1)
}

/**
 * Ajustements du 1er tour, dans l'ordre :
 * 1. progression (optionnelle) : moyenne × (1 + (progression 2022 de la référence − 1) × intensité),
 *    ramenée à 100 — estimation des derniers sondages avant le vote ;
 * 2. correction : écart relatif entre derniers sondages et résultat en 2022, appliqué au résultat
 *    de l'étape 1 (les deux se cumulent), puis ramené à 100.
 */
export function applyCorrections(
  base: Record<CandidateId, number>,
  candidates: Candidate[],
  stats: Reference2022Stats,
  settings: Pick<
    Settings,
    'correctionsEnabled' | 'correctionIntensity' | 'correctionOverrides' | 'progressionEnabled'
  > & { referenceBlend?: Settings['referenceBlend']; progressionIntensity?: Settings['progressionIntensity'] },
  progression: { ratio: Record<string, number> } | null = null,
): FirstRoundRow[] {
  const present = candidates.filter((c) => base[c.id] !== undefined)
  const partsOf = (c: Candidate) => referenceParts(c, settings.referenceBlend?.[c.id])
  const progressionOf = (c: Candidate) => (progression ? blendedRatio(partsOf(c), progression.ratio) : null)
  const intensity = settings.progressionIntensity ?? 1
  const factorOf = (c: Candidate) => {
    const p = settings.progressionEnabled ? progressionOf(c) : null
    return p === null ? null : Math.max(0, 1 + (p - 1) * intensity)
  }
  const projected = normalize(
    Object.fromEntries(present.map((c) => [c.id, (base[c.id] ?? 0) * (factorOf(c) ?? 1)])),
  )
  const draft = present.map((c) => {
    const score = projected[c.id] ?? 0
    const ratio = blendedRatio(partsOf(c), stats.ratio)
    const def = defaultCorrection(score, ratio)
    const override = settings.correctionOverrides[c.id]
    const isOverride = settings.correctionsEnabled && override !== undefined
    const applied = !settings.correctionsEnabled ? 0 : isOverride ? override : def * settings.correctionIntensity
    return { c, score, ratio, def, applied, isOverride, raw: Math.max(0, score + applied) }
  })
  const corrected = normalize(Object.fromEntries(draft.map((d) => [d.c.id, d.raw])))
  return draft.map((d) => ({
    candidateId: d.c.id,
    base: base[d.c.id] ?? 0,
    progressionRatio: progressionOf(d.c),
    progressionFactor: factorOf(d.c),
    projected: d.score,
    ratio2022: d.ratio,
    references: partsOf(d.c),
    defaultCorrection: d.def,
    appliedCorrection: d.applied,
    isOverride: d.isOverride,
    corrected: corrected[d.c.id] ?? 0,
  }))
}
