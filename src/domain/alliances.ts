import { hypothesisMatches, latestPerInstitute, windowDaysOf } from './pollAverage'
import type { Alliance, AllianceLeak, Bloc, CandidateId, Entrant, EntrantMember, HypothesisSet, PollsData } from './types'

/*
 * Une alliance retire son candidat rallié du 1er tour : on ne garde que les hypothèses des sondages qui
 * testent tous les autres candidats simulés, mais pas le rallié (ni personne à sa place). Aucun taux de
 * report n'est appliqué au 1er tour : ce sont les sondés qui répartissent les électeurs du rallié. Les
 * alliances proposées sont donc celles qu'une hypothèse des sondages retenus permet, seule ou combinée ;
 * la liste suit les sondages synchronisés.
 */

export const ralliedOf = (a: Alliance) => a.members.filter((id) => id !== a.leader)

/**
 * Deux alliances sont incompatibles si elles partagent un candidat qui n'est pas leur leader commun :
 * un candidat ne rallie qu'une alliance, et un candidat rallié ne mène pas d'autre alliance.
 * Exemple : « Roussel rejoint Mélenchon » exclut « Roussel rejoint Glucksmann », alors que
 * « Tondelier rejoint Mélenchon » et « Roussel rejoint Mélenchon » se cumulent.
 */
export function alliancesConflict(a: Alliance, b: Alliance): boolean {
  if (a.id === b.id) return false
  return a.members.some((id) => b.members.includes(id) && !(a.leader === id && b.leader === id))
}

export const defaultSet = (data: Pick<PollsData, 'hypothesisSets'>): HypothesisSet =>
  data.hypothesisSets.find((s) => s.default) ?? data.hypothesisSets[0]!

/** Critères d'une hypothèse du scénario : tous les candidats simulés sauf les ralliés (et les exclus de la base). */
export function scenarioFilter(data: PollsData, alliances: Alliance[]): Pick<HypothesisSet, 'require' | 'exclude'> {
  const rallied = alliances.flatMap(ralliedOf)
  const exclude = [...new Set([...defaultSet(data).exclude, ...rallied])]
  return { require: data.candidates.map((c) => c.id).filter((id) => !exclude.includes(id)), exclude }
}

/**
 * Candidats principaux (requis par le jeu par défaut) restés en lice dans le camp d'un leader — son bloc
 * et ceux de ses ralliés —, autres que lui. Il ne doit en rester aucun pour qu'une hypothèse sans les
 * ralliés mesure leur ralliement : sinon leurs électeurs iraient aussi vers ce candidat (Philippe absent
 * mais Attal en lice : rien ne dit que ses électeurs suivent Glucksmann).
 */
export function campRivals(data: PollsData, alliances: Alliance[]): CandidateId[] {
  const blocOf = new Map<CandidateId, Bloc>(data.candidates.map((c) => [c.id, c.bloc]))
  const rallied = alliances.flatMap(ralliedOf)
  const main = defaultSet(data).require.filter((id) => !rallied.includes(id))
  return [
    ...new Set(
      alliances.flatMap((a) => {
        const camp = new Set(
          [a.leader, ...alliances.filter((b) => b.leader === a.leader).flatMap(ralliedOf)].map((id) => blocOf.get(id)),
        )
        return main.filter((id) => id !== a.leader && camp.has(blocOf.get(id)))
      }),
    ),
  ]
}

const key = (alliances: Alliance[]) => alliances.map((a) => a.id).join('|')
const combosCache = new WeakMap<PollsData, Alliance[][]>()

/**
 * Combinaisons d'alliances testées par au moins une hypothèse des sondages retenus (dernier sondage de
 * chaque institut) : alliances compatibles, chaque leader seul candidat principal de son camp, et une
 * hypothèse qui teste tous les candidats simulés sauf leurs ralliés. Ordre des données.
 */
export function allianceCombos(data: PollsData): Alliance[][] {
  const cached = combosCache.get(data)
  if (cached) return cached
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const combos = new Map<string, Alliance[]>()
  for (const h of latest.flatMap((p) => p.hypotheses)) {
    // Alliances dont le leader est testé et le rallié absent : les seules qui peuvent décrire l'hypothèse.
    const fitting = data.alliances.filter(
      (a) => !a.estimatedOnly && a.leader in h.scores && ralliedOf(a).every((id) => !(id in h.scores)),
    )
    const subsets = fitting.reduce<Alliance[][]>(
      (all, a) => [...all, ...all.filter((s) => !s.some((b) => alliancesConflict(a, b))).map((s) => [...s, a])],
      [[]],
    )
    for (const s of subsets) {
      if (s.length > 0 && campRivals(data, s).length === 0 && hypothesisMatches(h, scenarioFilter(data, s))) {
        combos.set(key(s), s)
      }
    }
  }
  const result = [...combos.values()]
  combosCache.set(data, result)
  return result
}

/** Alliances proposées : celles qui figurent dans au moins une combinaison testée. */
export function availableAlliances(data: PollsData): Alliance[] {
  const combos = allianceCombos(data)
  return data.alliances.filter((a) => combos.some((c) => c.includes(a)))
}

/** Plus grande combinaison testée parmi les alliances activées (à taille égale, l'ordre des données). */
export function acceptAlliances(data: PollsData, active: Record<string, boolean>): Alliance[] {
  return allianceCombos(data)
    .filter((c) => c.every((a) => active[a.id]))
    .reduce<Alliance[]>((best, c) => (c.length > best.length ? c : best), [])
}

/** Plus petite combinaison testée qui ajoute cette alliance aux alliances retenues (undefined sinon). */
export function comboWith(data: PollsData, accepted: Alliance[], alliance: Alliance): Alliance[] | undefined {
  return allianceCombos(data)
    .filter((c) => c.includes(alliance) && accepted.every((a) => c.includes(a)))
    .reduce<Alliance[] | undefined>((best, c) => (!best || c.length < best.length ? c : best), undefined)
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * Jeu d'hypothèses du scénario (critères complets, pour la sélection) : nommé d'après un jeu des données
 * aux mêmes candidats principaux et exclusions (« Philippe seul »), sinon décrit par les ralliés absents.
 */
export function scenarioSet(data: PollsData, alliances: Alliance[], name: (id: CandidateId) => string): HypothesisSet {
  const base = defaultSet(data)
  const filter = scenarioFilter(data, alliances)
  const rallied = alliances.flatMap(ralliedOf)
  const main = [...new Set([...base.require.filter((id) => !rallied.includes(id)), ...alliances.map((a) => a.leader)])]
  const named = data.hypothesisSets.find((s) => sameIds(s.require, main) && sameIds(s.exclude, filter.exclude))
  if (named) return { ...named, ...filter }
  const without = rallied.map(name).join(', ')
  return {
    id: [base.id, ...alliances.map((a) => a.id)].join('+'),
    label: `Sans ${without}`,
    description: `Hypothèses sans ${without} (${alliances.map((a) => a.label).join(', ')}).`,
    ...filter,
  }
}

// ——— Alliances non testées par les sondeurs (option) : estimation par les reports de 2024 ———

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
 * Applique au 1er tour des alliances estimées.
 * Les électeurs de chaque candidat rallié se répartissent selon `split` : une part suit le leader,
 * une part vote pour le candidat RN, le reste s'abstient. Les scores sont ensuite ramenés à 100.
 * Les poids des membres (part de chacun dans le score de l'entrant) servent à mélanger les profils
 * de reports au 2nd tour. Sans alliance, chaque candidat se présente seul.
 */
export function applyAlliances(
  scores: Record<CandidateId, number>,
  alliances: Alliance[],
  split: (allianceId: string, leaderId: CandidateId, joiningId: CandidateId) => AllianceSplit,
  rnId: CandidateId | null,
): AllianceResult {
  const joiningByLeader = new Map<
    CandidateId,
    { joining: { id: CandidateId; allianceId: string }[]; allianceIds: string[] }
  >()
  const absorbed = new Set<CandidateId>()
  for (const a of alliances) {
    const group = joiningByLeader.get(a.leader) ?? { joining: [], allianceIds: [] }
    const joining = ralliedOf(a).filter((id) => scores[id] !== undefined)
    group.joining.push(...joining.map((id) => ({ id, allianceId: a.id })))
    group.allianceIds.push(a.id)
    joiningByLeader.set(a.leader, group)
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
