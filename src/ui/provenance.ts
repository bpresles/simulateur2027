import type { ProvenanceId } from '../domain/types'

/** Classe CSS qui encode la provenance d'une valeur : pleine, pointillée ou hachurée. */
export function provenanceClass(p: ProvenanceId): string {
  if (p === 'derive') return 'prov-derive'
  if (p === 'transpose') return 'prov-transpose'
  if (p === 'reels2024') return 'prov-reels'
  if (p === 'camp') return 'prov-camp'
  if (p === 'hypothese') return 'prov-hypothese px-1'
  return ''
}
