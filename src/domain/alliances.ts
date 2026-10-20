import { hypothesisMatches, latestPerInstitute, windowDaysOf } from './pollAverage'
import type { Alliance, Bloc, CandidateId, HypothesisSet, PollsData } from './types'

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
    const fitting = data.alliances.filter((a) => a.leader in h.scores && ralliedOf(a).every((id) => !(id in h.scores)))
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
