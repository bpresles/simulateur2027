import type { CSSProperties } from 'react'
import { simulationData } from '../data/schema'
import type { Bloc, Candidate, CandidateId, Entrant, ProfileId, ReferencePart } from '../domain/types'
import { pct } from './format'

export const candidatesById = new Map(simulationData.polls.candidates.map((c) => [c.id, c]))

export function cand(id: CandidateId): Candidate {
  const c = candidatesById.get(id)
  if (!c) throw new Error(`Candidat inconnu : ${id}`)
  return c
}

/** Nom d'un candidat simulé ou non simulé (Hollande, Bayrou…). */
export function anyName(id: CandidateId): string {
  return (
    candidatesById.get(id)?.name ?? simulationData.polls.otherCandidates.find((c) => c.id === id)?.name ?? id
  )
}

/** Variables CSS consommées par .cand-fill / .cand-ghost / .cand-hatch. */
export function colorVars(c: Candidate): CSSProperties {
  return { '--c': c.color, '--c-dark': c.colorDark } as CSSProperties
}

export function entrantLabel(e: Entrant): string {
  return e.members.map((m) => cand(m.candidateId).shortName).join(' + ')
}

export const BLOC_LABELS: Record<Bloc, string> = {
  gauche: 'Gauche',
  centre: 'Centre',
  droite: 'Droite (LR)',
  extreme_droite: 'Extrême droite',
}

export const BLOC_VOTERS: Record<Bloc, string> = {
  gauche: 'Électeurs de gauche',
  centre: 'Électeurs du centre',
  droite: 'Électeurs LR',
  extreme_droite: 'Électeurs d’extrême droite',
}

export function profileLabel(id: ProfileId): string {
  return simulationData.transfers.profiles.find((p) => p.id === id)?.label ?? id
}

/** Petits candidats simulés (Ruffin, Villepin…), dans l'ordre des données. */
export const MINOR_CANDIDATES = simulationData.polls.candidates.filter((c) => c.minor)

/** Électorats suivis par les électeurs d'un petit candidat : « Glucksmann 50 %, Philippe 50 % ». */
export function transferLabel(parts: ReferencePart[]): string {
  const total = parts.reduce((s, p) => s + p.weight, 0)
  if (parts.length === 1) return cand(parts[0]!.id).shortName
  return parts.map((p) => `${cand(p.id).shortName} ${pct((p.weight * 100) / total, 0)}`).join(', ')
}
