import { hypothesisMatches, latestPerInstitute, windowDaysOf } from './pollAverage'
import type { Alliance, Bloc, CandidateId, Hypothesis, HypothesisSet, PollsData } from './types'

/*
 * Une alliance retire son candidat rallié du 1er tour : on retient l'offre de candidats où le rallié
 * est absent et son leader présent. Seules les alliances (ou combinaisons) effectivement testées par au
 * moins un sondage de la période sont proposées : aucune estimation par reports de 2nd tour 2024.
 */

export const ralliedOf = (a: Alliance) => a.members.filter((id) => id !== a.leader)

/**
 * Deux alliances sont incompatibles si elles partagent un candidat qui n'est pas leur leader commun :
 * un candidat ne rallie qu'une alliance, et un candidat rallié ne mène pas d'autre alliance.
 */
export function alliancesConflict(a: Alliance, b: Alliance): boolean {
  if (a.id === b.id) return false
  return a.members.some((id) => b.members.includes(id) && !(a.leader === id && b.leader === id))
}

export const defaultSet = (data: Pick<PollsData, 'hypothesisSets'>): HypothesisSet =>
  data.hypothesisSets.find((s) => s.default) ?? data.hypothesisSets[0]!

/**
 * Offre de repli déduite dynamiquement des sondages récents : candidats simulés présents dans au moins
 * la moitié des instituts retenus (utile si un retrait majeur ou la liste officielle rend le jeu par
 * défaut caduc avant mise à jour manuelle).
 */
export function majorityOfferSet(
  data: PollsData,
  excludedPolls: ReadonlySet<string> = new Set(),
): HypothesisSet | null {
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const pool = latest.filter((p) => !excludedPolls.has(p.id))
  const active = pool.length > 0 ? pool : latest
  if (active.length === 0) return null

  const baseExclude = defaultSet(data).exclude
  const threshold = Math.ceil(active.length / 2)
  const counts = new Map<CandidateId, number>()
  for (const poll of active) {
    const seenInPoll = new Set<CandidateId>()
    for (const h of poll.hypotheses) {
      for (const id of Object.keys(h.scores)) seenInPoll.add(id)
    }
    for (const id of seenInPoll) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const require = data.candidates
    .filter((c) => !c.minor && !baseExclude.includes(c.id) && (counts.get(c.id) ?? 0) >= threshold)
    .map((c) => c.id)
  if (require.length < 2) return null
  return {
    id: 'offre-majoritaire',
    label: 'Offre majoritaire des sondages',
    description:
      'Offre de repli automatique regroupant les candidats principaux testés par au moins la moitié des instituts récents.',
    require,
    exclude: baseExclude,
  }
}

/**
 * Critères d'une hypothèse du scénario : tous les candidats principaux sauf les ralliés (et les exclus de la
 * base). Les petits candidats ne sont requis que s'ils mènent une alliance.
 */
export function scenarioFilter(data: PollsData, alliances: Alliance[]): Pick<HypothesisSet, 'require' | 'exclude'> {
  const rallied = alliances.flatMap(ralliedOf)
  const leaders = alliances.map((a) => a.leader)
  const exclude = [...new Set([...defaultSet(data).exclude, ...rallied])]
  const require = data.candidates
    .filter((c) => (!c.minor || leaders.includes(c.id)) && !exclude.includes(c.id))
    .map((c) => c.id)
  return { require, exclude }
}

/**
 * Candidats principaux (requis par le jeu par défaut) restés en lice dans le camp d'un leader — son bloc
 * et ceux de ses ralliés —, autres que lui. Il ne doit en rester aucun pour qu'une hypothèse sans les
 * ralliés mesure leur ralliement.
 */
export function campRivals(data: PollsData, alliances: Alliance[]): CandidateId[] {
  const blocOf = new Map<CandidateId, Bloc | null>(data.candidates.map((c) => [c.id, c.bloc]))
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

/** Combinaisons d'alliances simples (non vides) qui décrivent une hypothèse, dans l'ordre des données. */
export function describingCombos(data: PollsData, h: Hypothesis): Alliance[][] {
  const fitting = data.alliances.filter(
    (a) => a.leader in h.scores && ralliedOf(a).every((id) => !(id in h.scores)),
  )
  const subsets = fitting.reduce<Alliance[][]>(
    (all, a) => [...all, ...all.filter((s) => !s.some((b) => alliancesConflict(a, b))).map((s) => [...s, a])],
    [[]],
  )
  return subsets.filter(
    (s) => s.length > 0 && hypothesisMatches(h, scenarioFilter(data, s)) && campRivals(data, s).length === 0,
  )
}

/**
 * Combinaisons d'alliances testées par au moins une hypothèse des sondages retenus (dernier sondage de
 * chaque institut). Ordre des données.
 */
export function allianceCombos(data: PollsData): Alliance[][] {
  const cached = combosCache.get(data)
  if (cached) return cached
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const combos = new Map<string, Alliance[]>()
  for (const h of latest.flatMap((p) => p.hypotheses)) {
    for (const s of describingCombos(data, h)) combos.set(key(s), s)
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
  const sameLeader = (c: Alliance[]) => c.filter((b) => b.leader === alliance.leader).length
  return allianceCombos(data)
    .filter((c) => c.includes(alliance) && accepted.every((a) => c.includes(a)))
    .reduce<Alliance[] | undefined>(
      (best, c) =>
        !best || c.length < best.length || (c.length === best.length && sameLeader(c) > sameLeader(best))
          ? c
          : best,
      undefined,
    )
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

export function namedSet(data: PollsData, alliances: Alliance[]): HypothesisSet | undefined {
  const base = defaultSet(data)
  const filter = scenarioFilter(data, alliances)
  const rallied = alliances.flatMap(ralliedOf)
  const main = [...new Set([...base.require.filter((id) => !rallied.includes(id)), ...alliances.map((a) => a.leader)])]
  return data.hypothesisSets.find((s) => sameIds(s.require, main) && sameIds(s.exclude, filter.exclude))
}

export function scenarioSet(data: PollsData, alliances: Alliance[], name: (id: CandidateId) => string): HypothesisSet {
  const base = defaultSet(data)
  const filter = scenarioFilter(data, alliances)
  const rallied = alliances.flatMap(ralliedOf)
  const named = namedSet(data, alliances)
  if (named) return { ...named, ...filter }
  const without = rallied.map(name).join(', ')
  return {
    id: [base.id, ...alliances.map((a) => a.id)].join('+'),
    label: `Sans ${without}`,
    description: `Hypothèses sans ${without} (${alliances.map((a) => a.label).join(', ')}).`,
    ...filter,
  }
}

export interface TestedBy {
  institute: string
  hypothesis?: string
}

export interface TestedOption {
  id: string
  label: string
  description: string
  alliances: Alliance[]
  testedBy: TestedBy[]
}

const blocOfCandidate = (data: PollsData, id: CandidateId) => data.candidates.find((c) => c.id === id)?.bloc
const shortName = (data: PollsData, id: CandidateId) => data.candidates.find((c) => c.id === id)?.shortName ?? id

function bestCombo(data: PollsData, h: Hypothesis, combos: Alliance[][]): Alliance[] | undefined {
  const sameBloc = (c: Alliance[]) =>
    c.reduce(
      (n, a) => n + ralliedOf(a).filter((id) => blocOfCandidate(data, id) === blocOfCandidate(data, a.leader)).length,
      0,
    )
  const leaders = (c: Alliance[]) => new Set(c.map((a) => a.leader)).size
  const minorLeaders = (c: Alliance[]) =>
    new Set(c.map((a) => a.leader).filter((id) => id in h.scores && data.candidates.find((x) => x.id === id)?.minor)).size
  const rank = (c: Alliance[]): number[] => [c.length, -sameBloc(c), leaders(c), -minorLeaders(c)]
  return combos.reduce<Alliance[] | undefined>((best, c) => {
    if (!best) return c
    const [a, b] = [rank(c), rank(best)]
    const i = a.findIndex((v, k) => v !== b[k])
    return i >= 0 && a[i]! < b[i]! ? c : best
  }, undefined)
}

const optionsCache = new WeakMap<PollsData, TestedOption[]>()

export function testedOptions(data: PollsData): TestedOption[] {
  const cached = optionsCache.get(data)
  if (cached) return cached
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const found = new Map<string, { alliances: Alliance[]; testedBy: TestedBy[]; tested: Set<CandidateId> }>()
  for (const poll of latest) {
    for (const h of poll.hypotheses) {
      if (hypothesisMatches(h, scenarioFilter(data, []))) continue
      const combo = bestCombo(data, h, describingCombos(data, h))
      if (!combo) continue
      const id = `teste-${combo.map((a) => a.id).sort().join('-')}`
      const entry = found.get(id) ?? { alliances: combo, testedBy: [], tested: new Set<CandidateId>() }
      if (!entry.testedBy.some((t) => t.institute === poll.institute && t.hypothesis === h.label)) {
        entry.testedBy.push({ institute: poll.institute, hypothesis: h.label })
      }
      for (const c of data.candidates) if (c.minor && c.id in h.scores) entry.tested.add(c.id)
      found.set(id, entry)
    }
  }
  const order = (c: Alliance[]) => c.map((a) => data.alliances.indexOf(a)).sort((a, b) => a - b)
  const options = [...found.entries()]
    .sort(([, a], [, b]) => {
      const [x, y] = [order(a.alliances), order(b.alliances)]
      return a.alliances.length - b.alliances.length || x.join().localeCompare(y.join(), undefined, { numeric: true })
    })
    .map(([id, { alliances, testedBy, tested }]): TestedOption => {
      const leaders = [...new Set(alliances.map((a) => a.leader))]
      const behind = leaders
        .map(
          (l) =>
            `derrière ${shortName(data, l)} : ${alliances
              .filter((a) => a.leader === l)
              .flatMap(ralliedOf)
              .map((id) => shortName(data, id))
              .join(', ')}`,
        )
        .join(' ; ')
      const label = namedSet(data, alliances)?.label ?? `D${behind.slice(1)}`
      const require = scenarioFilter(data, alliances).require
      const inRace = data.candidates.filter((c) => require.includes(c.id)).map((c) => c.shortName)
      const extra = data.candidates
        .filter((c) => c.minor && tested.has(c.id) && !require.includes(c.id))
        .map((c) => c.shortName)
      const by = testedBy.map((t) => (t.hypothesis ? `${t.institute} (hypothèse « ${t.hypothesis} »)` : t.institute))
      return {
        id,
        label,
        description: `Candidats : ${inRace.join(', ')}${extra.length ? ` ; selon les sondages, aussi : ${extra.join(', ')}` : ''}. Testée par : ${by.join(', ')}`,
        alliances,
        testedBy,
      }
    })
  optionsCache.set(data, options)
  return options
}

export const isOptionChecked = (option: TestedOption, accepted: Alliance[]) =>
  accepted.length === option.alliances.length && option.alliances.every((a) => accepted.includes(a))
