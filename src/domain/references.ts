import type { Candidate, ReferencePart } from './types'

/**
 * Références 2022 d'un candidat, avec leurs poids normalisés (total 1).
 * Pour une référence composite à deux candidats, `blend` remplace le poids du second.
 */
export function referenceParts(c: Candidate, blend?: number): ReferencePart[] {
  if (!c.ref2022) return []
  if (typeof c.ref2022 === 'string') return [{ id: c.ref2022, weight: 1 }]
  const parts =
    blend !== undefined && c.ref2022.length === 2
      ? [
          { id: c.ref2022[0]!.id, weight: 1 - blend },
          { id: c.ref2022[1]!.id, weight: blend },
        ]
      : c.ref2022
  const total = parts.reduce((s, p) => s + p.weight, 0)
  return total > 0 ? parts.map((p) => ({ id: p.id, weight: p.weight / total })) : []
}

/** Ratio d'une référence composite : moyenne des ratios de chaque référence, pondérée par son poids. */
export function blendedRatio(parts: ReferencePart[], ratios: Record<string, number>): number | null {
  const known = parts.filter((p) => ratios[p.id] !== undefined && p.weight > 0)
  const total = known.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return null
  return known.reduce((s, p) => s + p.weight * ratios[p.id]!, 0) / total
}

export function referenceIds(c: Candidate): string[] {
  return referenceParts(c).map((p) => p.id)
}
