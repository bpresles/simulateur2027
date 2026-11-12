import type {
  CandidateId,
  Fieldwork,
  Hypothesis,
  HypothesisSet,
  ImputationDonors,
  Poll,
  PollStatus,
  PollUsage,
  PollsData,
  ReferencePart,
  Settings,
} from './types'
import { minorTransferParts } from './transfers'

type Scores = Record<CandidateId, number>

const DAY_MS = 86_400_000

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Ramène un ensemble de scores à un total de 100. */
export function normalize(scores: Scores): Scores {
  const total = Object.values(scores).reduce((s, v) => s + v, 0)
  if (total <= 0) return { ...scores }
  return Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, (v * 100) / total]))
}

/** Moyenne par clé, calculée uniquement sur les enregistrements où la clé est présente. */
export function meanByKey(records: Scores[]): Scores {
  const sums = new Map<string, { total: number; count: number }>()
  for (const record of records) {
    for (const [id, v] of Object.entries(record)) {
      const acc = sums.get(id) ?? { total: 0, count: 0 }
      acc.total += v
      acc.count += 1
      sums.set(id, acc)
    }
  }
  return Object.fromEntries([...sums].map(([id, { total, count }]) => [id, total / count]))
}

export function pick(scores: Scores, ids: ReadonlySet<CandidateId>): Scores {
  return Object.fromEntries(Object.entries(scores).filter(([id]) => ids.has(id)))
}

interface Dated {
  institute: string
  fieldwork: Fieldwork
}

export interface WindowSelection<T> {
  latest: T[]
  superseded: T[]
  outOfWindow: T[]
}

/** `poll` est plus récent que `current` : date de fin de terrain, puis date de début. */
function isNewer(poll: Dated, current: Dated | undefined): boolean {
  return (
    !current ||
    poll.fieldwork.end > current.fieldwork.end ||
    (poll.fieldwork.end === current.fieldwork.end && poll.fieldwork.start > current.fieldwork.start)
  )
}

/** Tri du plus récent au plus ancien : date de fin de terrain, puis date de début. */
export function newestFirst(a: Dated, b: Dated): number {
  return b.fieldwork.end.localeCompare(a.fieldwork.end) || b.fieldwork.start.localeCompare(a.fieldwork.start)
}

/**
 * Garde, pour chaque institut, le sondage le plus récent dont le terrain se termine dans la fenêtre
 * [asOf − windowDays ; asOf]. Départage par date de fin, puis date de début.
 */
export function latestPerInstitute<T extends Dated>(polls: T[], asOf: string, windowDays: number): WindowSelection<T> {
  const cutoff = addDays(asOf, -windowDays)
  const inWindow = polls.filter((p) => p.fieldwork.end >= cutoff && p.fieldwork.end <= asOf)
  const outOfWindow = polls.filter((p) => !inWindow.includes(p))
  const byInstitute = new Map<string, T>()
  for (const poll of inWindow) {
    if (isNewer(poll, byInstitute.get(poll.institute))) byInstitute.set(poll.institute, poll)
  }
  const latest = [...byInstitute.values()]
  return { latest, superseded: inWindow.filter((p) => !latest.includes(p)), outOfWindow }
}

export type HypothesisFilter = Pick<HypothesisSet, 'require' | 'exclude'>

/**
 * Candidats requis présents, exclus absents. Un exclu ne doit pas non plus être remplacé par un autre
 * candidat (Hollande à la place de Glucksmann) : l'hypothèse ne mesure alors pas son absence.
 */
export function hypothesisMatches(h: Hypothesis, set: HypothesisFilter): boolean {
  const tested = (id: CandidateId) => id in h.scores
  const replaced = Object.values(h.replacing ?? {})
  return set.require.every(tested) && !set.exclude.some((id) => tested(id) || replaced.includes(id))
}

export interface PollAverageResult<P = Poll> {
  usage: PollUsage<P>[]
  /** Moyenne entre instituts, normalisée à 100, sur les candidats retenus présents. */
  average: Scores
  institutesUsed: number
  /** Donneurs de chaque candidat imputable (`imputed`, hors exclus). */
  donors: Record<CandidateId, ImputationDonors>
}

interface HypothesisPoll extends Dated {
  hypotheses: Hypothesis[]
}

/** Répartition, pour chaque candidat imputable, des électeurs qu'il prend aux autres candidats. */
export type Donors = Readonly<Record<CandidateId, readonly ReferencePart[]>>

/**
 * Donneurs observés dans les sondages. Quand un sondage teste deux hypothèses dont l'une, avec X, contient
 * tous les candidats de l'autre, sans X, les points que chaque candidat perd de la seconde à la première
 * sont ceux que lui prennent X et les autres candidats ajoutés avec lui (ils reçoivent les mêmes parts).
 * Pour chaque candidat de `ids` : moyenne, sur toutes les paires de `polls`, des pertes des candidats
 * `donor` en parts de leur total. Un candidat sans paire n'est pas renvoyé.
 */
export function observedDonors(
  polls: readonly HypothesisPoll[],
  ids: readonly CandidateId[],
  donor: (id: CandidateId) => boolean,
): Record<CandidateId, ImputationDonors> {
  const sums: Record<CandidateId, Scores> = {}
  const pairs: Record<CandidateId, ImputationDonors['pairs']> = {}
  for (const poll of polls) {
    for (const a of poll.hypotheses) {
      for (const b of poll.hypotheses) {
        const added = ids.filter((id) => id in a.scores && !(id in b.scores))
        if (added.length === 0 || !Object.keys(b.scores).every((id) => id in a.scores)) continue
        const [withX, withoutX] = [normalize(a.scores), normalize(b.scores)]
        const loss = Object.keys(withoutX)
          .filter(donor)
          .map((id) => [id, Math.max(0, withoutX[id]! - withX[id]!)] as const)
        const total = loss.reduce((s, [, v]) => s + v, 0)
        if (total <= 0) continue
        for (const id of added) {
          const sum = (sums[id] ??= {})
          for (const [k, v] of loss) if (v > 0) sum[k] = (sum[k] ?? 0) + v / total
          ;(pairs[id] ??= []).push({ institute: poll.institute, without: b.id, with: a.id })
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(sums).map(([id, sum]) => [
      id,
      {
        parts: Object.entries(sum)
          .map(([k, v]) => ({ id: k, weight: v / pairs[id]!.length }))
          .sort((x, y) => y.weight - x.weight),
        pairs: pairs[id]!,
      },
    ]),
  )
}

/**
 * Ajoute à des scores (total 100) des candidats qu'ils ne comptent pas, avec la part `shares[id]`. Cette
 * part est prise aux candidats vers lesquels vont leurs électeurs en leur absence (`donors[id]`, au prorata
 * des poids de ceux qui sont en lice ; à défaut, à tous au prorata de leur score). Un candidat ne cède
 * jamais plus que son score : l'excédent est pris aux autres au prorata. Le total reste 100, et chaque
 * candidat ajouté garde exactement sa part.
 */
export function imputeShares(scores: Scores, shares: Scores, donors: Donors): Scores {
  const taken: Scores = {}
  for (const [id, share] of Object.entries(shares)) {
    const present = (donors[id] ?? []).filter((p) => p.weight > 0 && (scores[p.id] ?? 0) > 0)
    const from = present.length > 0 ? present : Object.entries(scores).map(([k, v]) => ({ id: k, weight: v }))
    const total = from.reduce((s, p) => s + p.weight, 0)
    if (total <= 0) continue
    for (const p of from) taken[p.id] = (taken[p.id] ?? 0) + (share * p.weight) / total
  }
  const left = Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, Math.max(0, v - (taken[id] ?? 0))]))
  const excess = Object.entries(scores).reduce((s, [id, v]) => s + Math.max(0, (taken[id] ?? 0) - v), 0)
  if (excess <= 0) return { ...left, ...shares }
  const rest = Object.values(left).reduce((s, v) => s + v, 0)
  // Parts ajoutées supérieures à ce qu'il reste : simple normalisation.
  if (rest <= excess) return normalize({ ...scores, ...shares })
  return { ...Object.fromEntries(Object.entries(left).map(([id, v]) => [id, v * (1 - excess / rest)])), ...shares }
}

/**
 * Imputation des candidats `imputed` dans les hypothèses retenues qui ne les testent pas : leur part y est
 * leur score moyen dans les autres hypothèses retenues du même sondage, sinon leur score moyen dans les
 * sondages qui les testent (moyenne de chaque sondage, puis entre sondages), prise aux autres candidats
 * selon `imputed[id]` (`imputeShares`). Un candidat qu'aucune hypothèse retenue ne teste n'est pas imputé.
 */
function imputer<P>(retained: Map<P, Scores[]>, imputed: Donors): (poll: P, scores: Scores) => Scores {
  const byPoll = Object.keys(imputed).flatMap((id) => {
    const scores = new Map(
      [...retained].flatMap(([p, hs]) => {
        const tested = hs.filter((s) => id in s).map((s) => s[id]!)
        return tested.length > 0 ? [[p, mean(tested)] as const] : []
      }),
    )
    return scores.size > 0 ? [{ id, scores, overall: mean([...scores.values()]) }] : []
  })
  return (poll, scores) =>
    imputeShares(
      scores,
      Object.fromEntries(
        byPoll.filter(({ id }) => !(id in scores)).map(({ id, scores: s, overall }) => [id, s.get(poll) ?? overall]),
      ),
      imputed,
    )
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

/**
 * Moyenne de 1er tour :
 * 1. dernier sondage de chaque institut dans la fenêtre [asOf − windowDays ; asOf], parmi ceux que
 *    `include` retient ; si aucun sondage ayant une hypothèse conforme n'est retenu, `include` est
 *    ignoré ;
 * 2. dans ce sondage, hypothèses conformes au filtre (candidats requis présents, exclus absents),
 *    réduites aux candidats retenus puis renormalisées à 100, et moyennées entre elles ; un candidat
 *    `optional` absent d'une hypothèse y compte pour 0 ;
 * 3. moyenne simple entre instituts (aucune s'il n'en reste qu'un), puis normalisation à 100.
 * Un candidat `imputed` (petit candidat) absent d'une hypothèse retenue y est imputé (`imputer`), sauf s'il
 * est exclu du filtre (rallié) : chaque hypothèse garde un total de 100, et son score final est celui de
 * l'unique sondage qui le teste, ou la moyenne des sondages qui le testent. Testé par aucune hypothèse
 * retenue, il n'est pas présenté. Ses points sont pris aux candidats retenus non imputés selon les donneurs
 * observés dans les sondages retenus (`observedDonors`, toutes hypothèses confondues), à défaut selon
 * `imputed[id]`.
 */
export function averageHypothesisPolls<P extends HypothesisPoll>(
  polls: P[],
  asOf: string,
  windowDays: number,
  filter: HypothesisFilter,
  keep: ReadonlySet<CandidateId>,
  include: (poll: P) => boolean = () => true,
  optional: readonly CandidateId[] = [],
  imputed: Donors = {},
): PollAverageResult<P> {
  const { latest, superseded } = latestPerInstitute(polls, asOf, windowDays)
  const inWindow = [...latest, ...superseded]
  const matches = new Map(latest.map((p) => [p, p.hypotheses.filter((h) => hypothesisMatches(h, filter))]))
  const eligible = latest.filter((p) => matches.get(p)!.length > 0)
  const included = eligible.some(include) ? eligible.filter(include) : eligible
  const absent = (id: CandidateId) => filter.exclude.includes(id) || !keep.has(id)
  const zeros = Object.fromEntries(optional.filter((id) => !absent(id) && !(id in imputed)).map((id) => [id, 0]))
  const retained = new Map(
    included.map((p) => [p, matches.get(p)!.map((h) => ({ ...zeros, ...normalize(pick(h.scores, keep)) }))]),
  )
  const imputable = Object.keys(imputed).filter((id) => !absent(id))
  const observed = observedDonors(included, imputable, (id) => keep.has(id) && !(id in imputed))
  const donors: Record<CandidateId, ImputationDonors> = Object.fromEntries(
    imputable.map((id) => [id, observed[id] ?? { parts: [...imputed[id]!], pairs: [] }]),
  )
  const impute = imputer(retained, Object.fromEntries(Object.entries(donors).map(([id, d]) => [id, d.parts])))
  const usage: PollUsage<P>[] = polls.map((poll) => {
    const skip = (status: PollStatus): PollUsage<P> => ({
      poll,
      status,
      matchedHypotheses: [],
      average: null,
    })
    if (!inWindow.includes(poll)) return skip('out-of-window')
    if (superseded.includes(poll)) return skip('superseded')
    const matched = matches.get(poll)!
    if (matched.length === 0) return skip('no-matching-hypothesis')
    if (!included.includes(poll)) return skip('excluded')
    const average = meanByKey(retained.get(poll)!.map((s) => impute(poll, s)))
    return { poll, status: 'used', matchedHypotheses: matched.map((h) => h.id), average }
  })
  const used = usage.filter((u) => u.average)
  // Un petit candidat à 0 % n'est pas présenté.
  const average = used.length
    ? Object.fromEntries(
        Object.entries(normalize(meanByKey(used.map((u) => u.average!)))).filter(
          ([id, v]) => v > 0 || !(optional.includes(id) || id in imputed),
        ),
      )
    : {}
  return { usage, average, institutesUsed: used.length, donors }
}

/** Durée retenue avant la date de référence : depuis le début de la période, sinon la fenêtre glissante. */
export function windowDaysOf(data: Pick<PollsData, 'asOf' | 'windowDays' | 'period'>): number {
  return data.period ? Math.max(0, daysBetween(data.period.start, data.asOf)) : data.windowDays
}

/**
 * Petits candidats des données, imputés dans les hypothèses qui ne les testent pas. Faute de donneurs
 * observés, leur part est prise aux candidats vers lesquels vont leurs électeurs (répartition choisie dans
 * les réglages, sinon la première).
 */
export function minorDonors(data: Pick<PollsData, 'candidates'>, choices: Settings['minorTransfers'] = {}): Donors {
  const parts = minorTransferParts(data.candidates, choices)
  return Object.fromEntries(data.candidates.filter((c) => c.minor).map((c) => [c.id, parts[c.id] ?? []]))
}

/** Moyenne des sondages 2027 pour un jeu d'hypothèses, sur les candidats simulés, hors sondages exclus. */
export function averagePolls(
  data: PollsData,
  set: HypothesisFilter,
  excluded: ReadonlySet<string> = new Set(),
  choices: Settings['minorTransfers'] = {},
): PollAverageResult {
  const simulated = new Set(data.candidates.map((c) => c.id))
  const include = (p: Poll) => !excluded.has(p.id)
  return averageHypothesisPolls(
    data.polls,
    data.asOf,
    windowDaysOf(data),
    set,
    simulated,
    include,
    [],
    minorDonors(data, choices),
  )
}

/** Nombre de jours entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}
