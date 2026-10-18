import { z } from 'zod'
import { referenceIds } from '../domain/references'
import { BLOCS } from '../domain/types'
import type { PollsData, Reference2022, SimulationData, TransfersData } from '../domain/types'
import pollsJson from './polls-2027.json'
import referenceJson from './reference-2022.json'
import transfersJson from './transfers-legislatives-2024.json'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date ISO AAAA-MM-JJ attendue')
const percent = z.number().min(0).max(100)
const bloc = z.enum(['gauche', 'centre', 'droite', 'extreme_droite'])
const profileId = z.enum(['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn'])
const provenance = z.enum(['franceinfo', 'publicsenat', 'lcp', 'derive', 'transpose', 'camp', 'hypothese'])
const sourceLink = z.object({ label: z.string(), url: z.url() })
const fieldwork = z.object({ start: isoDate, end: isoDate })
const scores = z.record(z.string(), percent)

const pollsSchema: z.ZodType<PollsData> = z.object({
  asOf: isoDate,
  electionDate: isoDate,
  windowDays: z.number().int().positive(),
  collection: z.object({ description: z.string(), sources: z.array(sourceLink) }),
  candidates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      shortName: z.string(),
      party: z.string(),
      bloc,
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      colorDark: z.string().regex(/^#[0-9a-f]{6}$/i),
      duelProfile: profileId.nullable(),
      ref2022: z
        .union([z.string(), z.array(z.object({ id: z.string(), weight: z.number().positive() })).min(2)])
        .nullable(),
      ref2022Note: z.string().optional(),
      isRN: z.boolean().optional(),
    }),
  ),
  otherCandidates: z.array(z.object({ id: z.string(), name: z.string() })),
  hypothesisSets: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      default: z.boolean().optional(),
      require: z.array(z.string()),
      exclude: z.array(z.string()),
    }),
  ),
  alliances: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
      members: z.array(z.string()).min(2),
      leader: z.string().optional(),
    }),
  ),
  polls: z.array(
    z.object({
      id: z.string(),
      institute: z.string(),
      sponsor: z.string(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      sources: z.array(sourceLink).min(1),
      verified: z.string().optional(),
      note: z.string().optional(),
      hypotheses: z
        .array(z.object({ id: z.string(), label: z.string().optional(), scores }))
        .min(1),
    }),
  ),
  secondRoundPolls: z.array(
    z.object({
      institute: z.string(),
      sponsor: z.string(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      url: z.url(),
      scores,
    }),
  ),
})

const referenceSchema: z.ZodType<Reference2022> = z.object({
  electionDate: isoDate,
  windowDays: z.number().int().positive(),
  description: z.string(),
  resultsSource: sourceLink,
  pollsSource: sourceLink,
  expressed: z.number().int().positive(),
  secondRound: z.object({
    registered: z.number().int().positive(),
    voters: z.number().int().positive(),
    blank: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    expressed: z.number().int().positive(),
    source: sourceLink,
  }),
  candidates: z.array(z.object({ id: z.string(), name: z.string(), votes: z.number().int().nonnegative() })),
  polls: z.array(
    z.object({
      institute: z.string(),
      sponsor: z.string().optional(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      url: z.url(),
      scores,
    }),
  ),
  autumnPolls: z.object({
    description: z.string(),
    windowDays: z.number().int().positive(),
    require: z.array(z.string()),
    exclude: z.array(z.string()),
    otherCandidates: z.array(z.object({ id: z.string(), name: z.string() })),
    source: sourceLink,
    polls: z.array(
      z.object({
        institute: z.string(),
        fieldwork,
        sampleSize: z.number().int().positive(),
        url: z.url(),
        hypotheses: z.array(z.object({ id: z.string(), label: z.string().optional(), scores })).min(1),
      }),
    ),
  }),
})

const transferRow = z.object({
  finalist: percent,
  rn: percent,
  abstention: percent,
  camp: z.enum(['finalist', 'rn']).optional(),
  provenance: z.object({ finalist: provenance, rn: provenance, abstention: provenance }),
  note: z.string().optional(),
})

const blocRecord = <T extends z.ZodType>(value: T) => z.record(bloc, value)

const transfersSchema: z.ZodType<TransfersData> = z.object({
  sources: z.record(
    provenance,
    z.object({ label: z.string(), description: z.string(), url: z.url().optional() }),
  ),
  completionRule: z.string(),
  defaultFidelity: z.number().min(0).max(1),
  profiles: z.array(
    z.object({ id: profileId, label: z.string(), sourceDuel: z.string(), rows: blocRecord(transferRow) }),
  ),
  fallback: z.object({
    description: z.string(),
    affinity: blocRecord(blocRecord(z.number().min(0))),
    abstention: blocRecord(percent),
  }),
})

/** Contrôles de cohérence entre fichiers, que Zod ne peut pas exprimer seul. */
export function validateData(data: SimulationData): string[] {
  const errors: string[] = []
  const { polls, reference2022, transfers } = data
  const simulated = new Set(polls.candidates.map((c) => c.id))
  const known = new Set([...simulated, ...polls.otherCandidates.map((c) => c.id)])
  const ref2022Ids = new Set(reference2022.candidates.map((c) => c.id))
  const profileIds = new Set(transfers.profiles.map((p) => p.id))

  for (const c of polls.candidates) {
    for (const id of referenceIds(c)) {
      if (!ref2022Ids.has(id)) errors.push(`${c.id} : référence 2022 inconnue « ${id} »`)
    }
    if (c.duelProfile && !profileIds.has(c.duelProfile)) errors.push(`${c.id} : profil inconnu « ${c.duelProfile} »`)
  }
  if (polls.candidates.filter((c) => c.isRN).length !== 1) errors.push('Il faut exactement un candidat marqué isRN')

  for (const set of polls.hypothesisSets) {
    for (const id of [...set.require, ...set.exclude]) {
      if (!known.has(id)) errors.push(`Jeu d'hypothèses ${set.id} : candidat inconnu « ${id} »`)
    }
  }
  if (polls.hypothesisSets.filter((s) => s.default).length !== 1) errors.push('Il faut exactement un jeu par défaut')

  for (const a of polls.alliances) {
    for (const id of a.members) {
      if (!simulated.has(id)) errors.push(`Alliance ${a.id} : candidat non simulé « ${id} »`)
    }
    if (a.leader && !a.members.includes(a.leader)) errors.push(`Alliance ${a.id} : le leader n'est pas membre`)
  }

  for (const poll of polls.polls) {
    if (poll.fieldwork.start > poll.fieldwork.end) errors.push(`${poll.id} : dates de terrain inversées`)
    for (const h of poll.hypotheses) {
      for (const id of Object.keys(h.scores)) {
        if (!known.has(id)) errors.push(`${poll.id}/${h.id} : candidat inconnu « ${id} »`)
      }
    }
  }
  for (const p of polls.secondRoundPolls) {
    const ids = Object.keys(p.scores)
    if (ids.length !== 2 || ids.some((id) => !simulated.has(id))) errors.push(`Sondage de 2nd tour ${p.institute} invalide`)
  }

  for (const poll of reference2022.polls) {
    for (const id of Object.keys(poll.scores)) {
      if (!ref2022Ids.has(id)) errors.push(`2022 ${poll.institute} : candidat inconnu « ${id} »`)
    }
  }
  const autumn = reference2022.autumnPolls
  const known2021 = new Set([...ref2022Ids, ...autumn.otherCandidates.map((c) => c.id)])
  for (const id of [...autumn.require, ...autumn.exclude]) {
    if (!known2021.has(id)) errors.push(`Automne 2021 : candidat inconnu « ${id} » dans le filtre`)
  }
  for (const poll of autumn.polls) {
    if (poll.fieldwork.start > poll.fieldwork.end) errors.push(`Automne 2021 ${poll.institute} : dates inversées`)
    for (const h of poll.hypotheses) {
      for (const id of Object.keys(h.scores)) {
        if (!known2021.has(id)) errors.push(`Automne 2021 ${poll.institute}/${h.id} : candidat inconnu « ${id} »`)
      }
    }
  }
  const t2 = reference2022.secondRound
  if (t2.voters - t2.blank - t2.invalid !== t2.expressed) errors.push('2022 : 2nd tour incohérent (votants − blancs − nuls ≠ exprimés)')
  const totalVotes = reference2022.candidates.reduce((s, c) => s + c.votes, 0)
  if (totalVotes !== reference2022.expressed) errors.push(`2022 : total des voix ${totalVotes} ≠ exprimés`)

  for (const profile of transfers.profiles) {
    for (const b of BLOCS) {
      const row = profile.rows[b]
      const sum = row.finalist + row.rn + row.abstention
      if (Math.abs(sum - 100) > 0.01) errors.push(`Reports ${profile.id}/${b} : total ${sum} ≠ 100`)
    }
  }
  return errors
}

export function parseData(raw: { polls: unknown; reference2022: unknown; transfers: unknown }): SimulationData {
  const data: SimulationData = {
    polls: pollsSchema.parse(raw.polls),
    reference2022: referenceSchema.parse(raw.reference2022),
    transfers: transfersSchema.parse(raw.transfers),
  }
  const errors = validateData(data)
  if (errors.length > 0) throw new Error(`Données invalides :\n- ${errors.join('\n- ')}`)
  return data
}

export const simulationData: SimulationData = parseData({
  polls: pollsJson,
  reference2022: referenceJson,
  transfers: transfersJson,
})
