import type { Alliance, AllianceLeak, CandidateId, Entrant, EntrantMember } from './types'

/**
 * Deux alliances sont incompatibles si elles partagent un candidat qui n'est pas leur leader fixe
 * commun : un candidat ne rallie qu'une alliance, et un candidat rallié ne mène pas d'autre alliance.
 * Exemple : « Roussel rejoint Mélenchon » exclut « Roussel rejoint Glucksmann », alors que
 * « Tondelier rejoint Mélenchon » et « Roussel rejoint Mélenchon » se cumulent.
 */
export function alliancesConflict(a: Alliance, b: Alliance): boolean {
  if (a.id === b.id) return false
  return a.members.some((id) => b.members.includes(id) && !(a.leader === id && b.leader === id))
}

/** Alliances retenues, dans l'ordre des données : une alliance incompatible avec une précédente est ignorée. */
export function resolveActiveAlliances(
  scores: Record<CandidateId, number>,
  alliances: Alliance[],
  active: Record<string, boolean>,
): Alliance[] {
  const accepted: Alliance[] = []
  for (const a of alliances) {
    if (!active[a.id]) continue
    if (a.members.filter((id) => scores[id] !== undefined).length < 2) continue
    if (accepted.some((b) => alliancesConflict(a, b))) continue
    accepted.push(a)
  }
  return accepted
}

/** Leader fixe, sinon le membre le mieux placé au 1er tour. */
export function allianceLeader(a: Alliance, scores: Record<CandidateId, number>): CandidateId {
  if (a.leader) return a.leader
  const present = a.members.filter((id) => scores[id] !== undefined)
  return present.reduce((best, id) => ((scores[id] ?? 0) > (scores[best] ?? 0) ? id : best))
}

/** Répartition des électeurs d'un candidat rallié (fractions de 0 à 1) ; le reste s'abstient. */
export interface AllianceSplit {
  leader: number
  rn: number
}

export interface AllianceResult {
  entrants: Entrant[]
  leaks: AllianceLeak[]
}

/**
 * Applique les alliances actives au 1er tour.
 * Les électeurs de chaque candidat rallié se répartissent selon `split` : une part suit le leader,
 * une part vote pour le candidat RN, le reste s'abstient. Les scores sont ensuite ramenés à 100.
 * Les poids des membres (part de chacun dans le score de l'entrant) servent à mélanger les profils
 * de reports au 2nd tour.
 */
export function applyAlliances(
  scores: Record<CandidateId, number>,
  alliances: Alliance[],
  active: Record<string, boolean>,
  split: (allianceId: string, leaderId: CandidateId, joiningId: CandidateId) => AllianceSplit,
  rnId: CandidateId | null,
): AllianceResult {
  const joiningByLeader = new Map<
    CandidateId,
    { joining: { id: CandidateId; allianceId: string }[]; allianceIds: string[] }
  >()
  const absorbed = new Set<CandidateId>()
  for (const a of resolveActiveAlliances(scores, alliances, active)) {
    const leader = allianceLeader(a, scores)
    const group = joiningByLeader.get(leader) ?? { joining: [], allianceIds: [] }
    const joining = a.members.filter((id) => id !== leader && scores[id] !== undefined)
    group.joining.push(...joining.map((id) => ({ id, allianceId: a.id })))
    group.allianceIds.push(a.id)
    joiningByLeader.set(leader, group)
    joining.forEach((id) => absorbed.add(id))
  }

  const leaks: AllianceLeak[] = []
  const entrants: Entrant[] = []
  for (const [id, score] of Object.entries(scores)) {
    if (absorbed.has(id)) continue
    const group = joiningByLeader.get(id)
    const members: EntrantMember[] = [{ candidateId: id, contribution: score, weight: 0, rate: 1, rnRate: 0 }]
    for (const { id: j, allianceId } of group?.joining ?? []) {
      const { leader, rn } = split(allianceId, id, j)
      const joiningScore = scores[j] ?? 0
      members.push({ candidateId: j, contribution: joiningScore * leader, weight: 0, rate: leader, rnRate: rn })
      if (rnId && rnId !== id && scores[rnId] !== undefined && !absorbed.has(rnId) && rn > 0) {
        leaks.push({ from: j, to: rnId, points: joiningScore * rn })
      }
    }
    entrants.push({ id, allianceIds: group?.allianceIds ?? [], members, score: 0 })
  }

  // Les électeurs ralliés qui votent RN rejoignent le score du candidat RN.
  for (const leak of leaks) {
    const target = entrants.find((e) => e.id === leak.to)
    if (target) target.members[0]!.contribution += leak.points
  }

  const total = entrants.reduce((s, e) => s + e.members.reduce((t, m) => t + m.contribution, 0), 0)
  const factor = total > 0 ? 100 / total : 0
  for (const e of entrants) {
    for (const m of e.members) m.contribution *= factor
    e.score = e.members.reduce((s, m) => s + m.contribution, 0)
    for (const m of e.members) m.weight = e.score > 0 ? m.contribution / e.score : 0
  }
  for (const leak of leaks) leak.points *= factor
  return { entrants: entrants.sort((a, b) => b.score - a.score), leaks }
}
