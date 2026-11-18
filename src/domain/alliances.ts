import { averagePolls, hypothesisMatches, imputeShares, latestPerInstitute, normalize, windowDaysOf } from './pollAverage'
import type {
  Alliance,
  AllianceLeak,
  Bloc,
  CandidateId,
  Entrant,
  EntrantMember,
  Hypothesis,
  HypothesisSet,
  LeaderBasis,
  PollsData,
  ReferencePart,
  Settings,
} from './types'

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

/** Nombre minimal d'instituts distincts qui testent une paire de membres pour qu'elle compte. */
export const MIN_PAIR_INSTITUTES = 2

/** Leader d'une alliance groupée et base de la décision. */
export interface GroupedLeader {
  id: CandidateId
  basis: LeaderBasis
}

/** Face-à-face gagnés et marge cumulée (en points) de chaque membre, et nombre de paires qui comptent. */
export interface HeadToHeads {
  record: Map<CandidateId, { wins: number; margin: number }>
  pairs: number
}

/**
 * Face-à-face d'un groupe : pour chaque paire de membres testée par au moins 2 instituts distincts (dernier
 * sondage de chaque institut, scores bruts jamais imputés), moyenne simple de leurs scores dans les hypothèses
 * qui les testent ensemble. Le gagnant d'une paire est celui dont la moyenne est la plus haute ; l'écart
 * s'ajoute à sa marge et se retranche de celle de l'autre.
 */
export function headToHeads(data: PollsData, members: CandidateId[]): HeadToHeads {
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const hypotheses = latest.flatMap((p) => p.hypotheses.map((h) => ({ institute: p.institute, scores: h.scores })))
  const record = new Map(members.map((id) => [id, { wins: 0, margin: 0 }]))
  let pairs = 0
  for (const [i, a] of members.entries()) {
    for (const b of members.slice(i + 1)) {
      const both = hypotheses.filter((h) => a in h.scores && b in h.scores)
      if (new Set(both.map((h) => h.institute)).size < MIN_PAIR_INSTITUTES) continue
      pairs++
      const mean = (id: CandidateId) => both.reduce((s, h) => s + h.scores[id]!, 0) / both.length
      const gap = mean(a) - mean(b)
      const [ra, rb] = [record.get(a)!, record.get(b)!]
      ra.margin += gap
      rb.margin -= gap
      if (gap > 0) ra.wins++
      else if (gap < 0) rb.wins++
    }
  }
  return { record, pairs }
}

/**
 * Alliances groupées : plusieurs candidats rassemblés derrière le membre qui gagne le plus de face-à-face
 * (`headToHeads`) ; à égalité, celui qui a la plus grande marge cumulée, puis le premier membre. Le plus fort
 * du groupe se mesure là où ses membres sont testés ensemble, et les scores imputés des petits candidats
 * rarement testés (Lagarde, testée par un seul institut) n'y entrent pas. Si aucune paire n'est testée par au
 * moins 2 instituts, repli : le candidat principal qui a le plus d'intentions de vote dans la moyenne du jeu
 * par défaut ; un petit candidat ne mène alors que si le groupe ne compte que des petits candidats (son score
 * parmi les hypothèses qui le testent). À égalité, le premier membre.
 */
export function groupedLeaderChoice(data: PollsData, members: CandidateId[]): GroupedLeader {
  const { record, pairs } = headToHeads(data, members)
  if (pairs > 0) {
    const id = members.reduce((best, m) => {
      const [x, y] = [record.get(m)!, record.get(best)!]
      return x.wins > y.wins || (x.wins === y.wins && x.margin > y.margin) ? m : best
    })
    return { id, basis: 'face-a-face' }
  }
  const { average } = averagePolls(data, defaultSet(data))
  const score = (id: CandidateId) => average[id] ?? testedShare(data, id)
  const principal = members.filter((id) => !data.candidates.find((c) => c.id === id)?.minor)
  const id = (principal.length > 0 ? principal : members).reduce((best, m) => (score(m) > score(best) ? m : best))
  return { id, basis: 'moyenne' }
}

/** Leader d'une alliance groupée (voir `groupedLeaderChoice`). */
export const groupedLeader = (data: PollsData, members: CandidateId[]): CandidateId =>
  groupedLeaderChoice(data, members).id

/** Données dont les alliances groupées ont leur leader et sa base : à appeler une fois, au chargement. */
export function resolveGroupedLeaders(data: PollsData): PollsData {
  if (!data.alliances.some((a) => a.grouped)) return data
  return {
    ...data,
    alliances: data.alliances.map((a) => {
      if (!a.grouped) return a
      const { id, basis } = groupedLeaderChoice(data, a.members)
      return { ...a, leader: id, leaderBasis: basis }
    }),
  }
}

/**
 * Alliance estimée par les reports de 2024 dans ce scénario : toute alliance avec l'option des alliances
 * non évaluées, les seules alliances groupées avec l'option des alliances groupées.
 */
export const isEstimable = (a: Alliance, settings: Pick<Settings, 'untestedAlliances' | 'groupedAlliances'>) =>
  settings.untestedAlliances || (!!a.grouped && settings.groupedAlliances)

export const defaultSet = (data: Pick<PollsData, 'hypothesisSets'>): HypothesisSet =>
  data.hypothesisSets.find((s) => s.default) ?? data.hypothesisSets[0]!

/**
 * Critères d'une hypothèse du scénario : tous les candidats simulés sauf les ralliés (et les exclus de la
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
 * ralliés mesure leur ralliement : sinon leurs électeurs iraient aussi vers ce candidat (Philippe absent
 * mais Attal en lice : rien ne dit que ses électeurs suivent Glucksmann).
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
  // Alliances dont le leader est testé et le rallié absent : les seules qui peuvent décrire l'hypothèse.
  const fitting = data.alliances.filter(
    (a) => !a.estimatedOnly && a.leader in h.scores && ralliedOf(a).every((id) => !(id in h.scores)),
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
 * chaque institut) : alliances compatibles, chaque leader seul candidat principal de son camp, et une
 * hypothèse qui teste tous les candidats simulés sauf leurs ralliés. Ordre des données.
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

/**
 * Plus petite combinaison testée qui ajoute cette alliance aux alliances retenues (undefined sinon). À taille
 * égale, celle dont les autres alliances rallient le même leader (« Philippe rejoint Lagarde » avec « Attal
 * rejoint Lagarde », plutôt qu'avec « Attal rejoint Retailleau »), puis l'ordre des données.
 */
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

/** Jeu des données aux mêmes candidats principaux et exclusions que le scénario d'alliances (« Philippe seul »). */
export function namedSet(data: PollsData, alliances: Alliance[]): HypothesisSet | undefined {
  const base = defaultSet(data)
  const filter = scenarioFilter(data, alliances)
  const rallied = alliances.flatMap(ralliedOf)
  const main = [...new Set([...base.require.filter((id) => !rallied.includes(id)), ...alliances.map((a) => a.leader)])]
  return data.hypothesisSets.find((s) => sameIds(s.require, main) && sameIds(s.exclude, filter.exclude))
}

/**
 * Jeu d'hypothèses du scénario (critères complets, pour la sélection) : nommé d'après un jeu des données
 * (« Philippe seul », « Lagarde seule »), sinon décrit par les ralliés absents.
 */
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

// ——— Options groupées testées : une par combinaison que les sondeurs testent ———

/** Un institut et l'hypothèse de son sondage qui teste une option. */
export interface TestedBy {
  institute: string
  hypothesis?: string
}

/**
 * Option des alliances groupées tirée des hypothèses testées : une combinaison d'alliances simples, qui peut
 * avoir plusieurs leaders, avec les hypothèses des sondages retenus qui la décrivent.
 */
export interface TestedOption {
  /** Identifiant stable : « teste- » suivi des ids d'alliance triés. */
  id: string
  /** Nom du jeu d'hypothèses correspondant, sinon « Derrière Philippe : Attal ; derrière Lisnard : Retailleau ». */
  label: string
  /** Candidats en lice, petits candidats testés selon les sondages, puis sondages qui la testent. */
  description: string
  alliances: Alliance[]
  testedBy: TestedBy[]
}

const blocOfCandidate = (data: PollsData, id: CandidateId) => data.candidates.find((c) => c.id === id)?.bloc
const shortName = (data: PollsData, id: CandidateId) => data.candidates.find((c) => c.id === id)?.shortName ?? id

/**
 * Combinaison qui décrit le mieux une hypothèse parmi celles qui la décrivent : la plus petite, puis celle qui
 * a le plus de paires (rallié, leader) du même bloc, puis le moins de leaders distincts, puis celle dont les
 * leaders comptent le plus de petits candidats que l'hypothèse teste, puis l'ordre des données. Sans ces
 * règles, « Lagarde » serait aussi décrite par « Attal rejoint Retailleau » et « Philippe rejoint Lagarde »,
 * de même taille mais sans logique de camp ; la dernière règle départage « Philippe et Attal rejoignent
 * Lagarde » de « Philippe et Attal rejoignent Retailleau », qui ignorerait Lagarde alors que l'hypothèse la teste.
 */
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

/**
 * Options groupées tirées des hypothèses testées : pour chaque hypothèse des sondages retenus décrite par au
 * moins une combinaison d'alliances simples, la meilleure combinaison (`bestCombo`) ; chaque combinaison
 * distincte donne une option, qui réunit les hypothèses (de plusieurs instituts) menant à elle. Une hypothèse
 * qui décrit déjà le scénario de base (jeu par défaut, ou seul un petit candidat manque) ne donne aucune option. Ces options ne sont qu'un raccourci au-dessus des
 * combinaisons d'`allianceCombos` : rien n'est saisi dans les données, et la liste suit la synchronisation.
 */
export function testedOptions(data: PollsData): TestedOption[] {
  const cached = optionsCache.get(data)
  if (cached) return cached
  const { latest } = latestPerInstitute(data.polls, data.asOf, windowDaysOf(data))
  const found = new Map<string, { alliances: Alliance[]; testedBy: TestedBy[]; tested: Set<CandidateId> }>()
  for (const poll of latest) {
    for (const h of poll.hypotheses) {
      // Une hypothèse qui décrit déjà le scénario de base n'est pas un ralliement : un petit candidat absent
      // n'est jamais requis, il n'est donc pas rallié.
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

/** Option cochée : l'ensemble des alliances testées retenues (`acceptAlliances`) est exactement sa combinaison. */
export const isOptionChecked = (option: TestedOption, accepted: Alliance[]) =>
  accepted.length === option.alliances.length && option.alliances.every((a) => accepted.includes(a))

// ——— Alliances non testées par les sondeurs (option) : estimation par les reports de 2024 ———

/** Répartition des électeurs d'un candidat rallié (fractions de 0 à 1) ; le reste s'abstient. */
export interface AllianceSplit {
  leader: number
  rn: number
}

/** Part d'un candidat dans les hypothèses qui le testent (dernier sondage de chaque institut, hors exclus). */
export function testedShare(data: PollsData, id: CandidateId, excluded: ReadonlySet<string> = new Set()): number {
  return averagePolls(data, { require: [id], exclude: [] }, excluded).average[id] ?? 0
}

/**
 * Ajoute à une moyenne un petit candidat qu'aucune de ses hypothèses ne teste (Ruffin, testé seulement avec
 * Attal, quand Attal rejoint Philippe), pour estimer son ralliement : sa part, reprise des hypothèses qui le
 * testent, est prélevée sur ses donneurs (`donors` : observés dans les sondages, à défaut les candidats vers
 * lesquels vont ses électeurs ; au prorata de ceux qui sont en lice, sinon de tous au prorata de leur score).
 * Total ramené à 100.
 */
export function insertMinor(
  average: Record<CandidateId, number>,
  id: CandidateId,
  share: number,
  donors: ReferencePart[],
): Record<CandidateId, number> {
  return normalize(imputeShares(average, { [id]: share }, { [id]: donors }))
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
