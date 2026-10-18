import type { CSSProperties } from 'react'
import { simulationData } from '../data/schema'
import type { Bloc, Candidate, CandidateId, Entrant, ProfileId } from '../domain/types'

export const candidatesById = new Map(simulationData.polls.candidates.map((c) => [c.id, c]))

export function cand(id: CandidateId): Candidate {
  const c = candidatesById.get(id)
  if (!c) throw new Error(`Candidat inconnu : ${id}`)
  return c
}

/** Nom d'un candidat simulé ou non simulé (Villepin, Polony…). */
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
