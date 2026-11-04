import { z } from 'zod'
import { resolveGroupedLeaders } from '../domain/alliances'
import { BLOG_BIAS_BLOCS } from '../domain/blogBias'
import { EQUIVALENTS_2017 } from '../domain/pastElections'
import { referenceIds } from '../domain/references'
import { BLOCS } from '../domain/types'
import type {
  PastElectionReference,
  PollsData,
  Reference2017,
  Reference2022,
  SimulationData,
  TransfersData,
  TurnoutCertaintyData,
} from '../domain/types'
import pollsJson from './polls-2027.json'
import reference2017Json from './reference-2017.json'
import referenceJson from './reference-2022.json'
import transfersJson from './transfers-legislatives-2024.json'
import turnoutCertaintyJson from './turnout-certainty.json'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date ISO AAAA-MM-JJ attendue')
const percent = z.number().min(0).max(100)
const bloc = z.enum(['gauche', 'centre', 'droite', 'extreme_droite'])
const profileId = z.enum(['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn'])
const provenance = z.enum(['franceinfo', 'publicsenat', 'lcp', 'derive', 'transpose', 'camp', 'hypothese'])
const sourceLink = z.object({ label: z.string(), url: z.url() })
const pollSource = sourceLink.extend({ kind: z.enum(['synthese', 'notice']).optional() })
const fieldwork = z.object({ start: isoDate, end: isoDate })
const scores = z.record(z.string(), percent)
const pollOrigin = z.enum(['manuel', 'mieuxvoter', '2027etmoi', 'wikipedia'])

const pollsSchema: z.ZodType<PollsData> = z.object({
  asOf: isoDate,
  electionDate: isoDate,
  windowDays: z.number().int().positive(),
  period: z.object({ label: z.string(), start: isoDate }).optional(),
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
      minor: z
        .object({
          transfers: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                parts: z.array(z.object({ id: z.string(), weight: z.number().positive() })).min(1),
                note: z.string(),
                sources: z.array(sourceLink).optional(),
              }),
            )
            .min(1),
        })
        .optional(),
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
      // Absent d'une alliance groupée : déduit au chargement (voir `resolveGroupedLeaders`).
      leader: z.string().default(''),
      grouped: z.boolean().optional(),
      estimatedOnly: z.boolean().optional(),
    }),
  ),
  polls: z.array(
    z.object({
      id: z.string(),
      origin: pollOrigin.optional(),
      institute: z.string(),
      sponsor: z.string(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      sources: z.array(pollSource).min(1),
      verified: z.string().optional(),
      note: z.string().optional(),
      hypotheses: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().optional(),
            scores,
            replacing: z.record(z.string(), z.string()).optional(),
          }),
        )
        .min(1),
    }),
  ),
  secondRoundPolls: z.array(
    z.object({
      origin: pollOrigin.optional(),
      institute: z.string(),
      sponsor: z.string(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      url: z.url(),
      scores,
      noIntention: z
        .object({
          share: percent,
          base: z.enum(['inscrits', 'votants']),
          undecided: percent.optional(),
          calculation: z.string().optional(),
          source: sourceLink,
        })
        .optional(),
    }),
  ),
})

const pastElectionShape = {
  electionDate: isoDate,
  windowDays: z.number().int().positive(),
  description: z.string(),
  resultsSource: sourceLink,
  pollsSource: sourceLink,
  expressed: z.number().int().positive(),
  registered: z.number().int().positive(),
  voters: z.number().int().positive(),
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
  campaignPolls: z.object({
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
}

const secondRoundShape = z.object({
  registered: z.number().int().positive(),
  voters: z.number().int().positive(),
  blank: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  expressed: z.number().int().positive(),
  source: sourceLink,
})

const referenceSchema: z.ZodType<Reference2022> = z.object({ ...pastElectionShape, secondRound: secondRoundShape })

const reference2017Schema: z.ZodType<Reference2017> = z.object({ ...pastElectionShape, secondRound: secondRoundShape })

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

const turnoutCertaintySchema: z.ZodType<TurnoutCertaintyData> = z.object({
  description: z.string(),
  measures: z.array(
    z
      .object({
        id: z.string(),
        cycle: z.union([z.literal(2022), z.literal(2027)]),
        final: z.boolean().optional(),
        fieldwork,
        envisage: percent.optional(),
        certain: percent.optional(),
        registeredShare: percent.optional(),
        source: sourceLink,
      })
      .refine(
        (m) => m.registeredShare !== undefined || (m.envisage !== undefined && m.certain !== undefined),
        'part des inscrits (registeredShare) ou couple envisage/certain attendu',
      ),
  ),
  control: z.object({
    description: z.string(),
    source: sourceLink,
    measures: z.array(
      z.object({
        fieldwork,
        share: percent,
        election: z.union([z.literal(2017), z.literal(2022), z.null()]),
      }),
    ),
  }),
})

/** Contrôles d'un scrutin passé : candidats connus, dates de terrain, total des voix. */
function validatePastElection(label: string, ref: PastElectionReference): string[] {
  const errors: string[] = []
  const ids = new Set(ref.candidates.map((c) => c.id))
  for (const poll of ref.polls) {
    for (const id of Object.keys(poll.scores)) {
      if (!ids.has(id)) errors.push(`${label} ${poll.institute} : candidat inconnu « ${id} »`)
    }
  }
  const campaign = ref.campaignPolls
  const known = new Set([...ids, ...campaign.otherCandidates.map((c) => c.id)])
  for (const id of [...campaign.require, ...campaign.exclude]) {
    if (!known.has(id)) errors.push(`Campagne ${label} : candidat inconnu « ${id} » dans le filtre`)
  }
  for (const poll of campaign.polls) {
    if (poll.fieldwork.start > poll.fieldwork.end) errors.push(`Campagne ${label} ${poll.institute} : dates inversées`)
    for (const h of poll.hypotheses) {
      for (const id of Object.keys(h.scores)) {
        if (!known.has(id)) errors.push(`Campagne ${label} ${poll.institute}/${h.id} : candidat inconnu « ${id} »`)
      }
    }
  }
  const totalVotes = ref.candidates.reduce((s, c) => s + c.votes, 0)
  if (totalVotes !== ref.expressed) errors.push(`${label} : total des voix ${totalVotes} ≠ exprimés`)
  if (!(ref.expressed <= ref.voters && ref.voters <= ref.registered))
    errors.push(`${label} : 1er tour incohérent (exprimés ≤ votants ≤ inscrits attendu)`)
  return errors
}

/** Contrôles de cohérence entre fichiers, que Zod ne peut pas exprimer seul. */
export function validateData(data: SimulationData): string[] {
  const errors: string[] = []
  const { polls, reference2022, reference2017, transfers } = data
  const simulated = new Set(polls.candidates.map((c) => c.id))
  const main = new Set(polls.candidates.filter((c) => !c.minor).map((c) => c.id))
  const known = new Set([...simulated, ...polls.otherCandidates.map((c) => c.id)])
  const ref2022Ids = new Set(reference2022.candidates.map((c) => c.id))
  const profileIds = new Set(transfers.profiles.map((p) => p.id))

  for (const c of polls.candidates) {
    for (const id of referenceIds(c)) {
      if (!ref2022Ids.has(id)) errors.push(`${c.id} : référence 2022 inconnue « ${id} »`)
    }
    if (c.duelProfile && !profileIds.has(c.duelProfile)) errors.push(`${c.id} : profil inconnu « ${c.duelProfile} »`)
    const transfers = c.minor?.transfers ?? []
    if (new Set(transfers.map((t) => t.id)).size !== transfers.length) errors.push(`${c.id} : répartitions en double`)
    for (const t of transfers) {
      for (const p of t.parts) {
        if (!main.has(p.id)) errors.push(`${c.id}/${t.id} : report vers « ${p.id} », qui n'est pas un candidat principal`)
      }
    }
    if (c.minor && c.isRN) errors.push(`${c.id} : le candidat RN ne peut pas être un petit candidat`)
  }
  if (polls.candidates.filter((c) => c.isRN).length !== 1) errors.push('Il faut exactement un candidat marqué isRN')

  for (const set of polls.hypothesisSets) {
    for (const id of [...set.require, ...set.exclude]) {
      if (!known.has(id)) errors.push(`Jeu d'hypothèses ${set.id} : candidat inconnu « ${id} »`)
      else if (simulated.has(id) && !main.has(id)) errors.push(`Jeu d'hypothèses ${set.id} : petit candidat « ${id} »`)
    }
  }
  if (polls.hypothesisSets.filter((s) => s.default).length !== 1) errors.push('Il faut exactement un jeu par défaut')

  for (const a of polls.alliances) {
    for (const id of a.members) {
      if (!simulated.has(id)) errors.push(`Alliance ${a.id} : candidat non simulé « ${id} »`)
    }
    if (!a.members.includes(a.leader)) errors.push(`Alliance ${a.id} : le leader n'est pas membre`)
    if (a.grouped && !a.estimatedOnly) errors.push(`Alliance ${a.id} : une alliance groupée est toujours estimée`)
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
    if ((p.noIntention?.undecided ?? 0) > (p.noIntention?.share ?? 100)) {
      errors.push(`Sondage de 2nd tour ${p.institute} : plus d'indécis que de personnes sans intention de vote`)
    }
  }

  errors.push(...validatePastElection('2022', reference2022), ...validatePastElection('2017', reference2017))
  for (const [id2022, id2017] of Object.entries(EQUIVALENTS_2017)) {
    if (!ref2022Ids.has(id2022)) errors.push(`Équivalent 2017 : candidat 2022 inconnu « ${id2022} »`)
    if (!reference2017.candidates.some((c) => c.id === id2017)) errors.push(`Équivalent 2017 : candidat 2017 inconnu « ${id2017} »`)
  }
  for (const [label, ref, blocs] of [
    ['2022', reference2022, BLOG_BIAS_BLOCS[2022]],
    ['2017', reference2017, BLOG_BIAS_BLOCS[2017]],
  ] as const) {
    const ids = new Set([...ref.candidates, ...ref.campaignPolls.otherCandidates].map((c) => c.id))
    for (const id of Object.values(blocs).flat()) {
      if (!ids.has(id)) errors.push(`Blocs du billet ${label} : candidat inconnu « ${id} »`)
    }
  }
  for (const [label, ref] of [
    ['2022', reference2022],
    ['2017', reference2017],
  ] as const) {
    const t2 = ref.secondRound
    if (t2.voters - t2.blank - t2.invalid !== t2.expressed) errors.push(`${label} : 2nd tour incohérent (votants − blancs − nuls ≠ exprimés)`)
    if (t2.voters > t2.registered) errors.push(`${label} : 2nd tour incohérent (votants > inscrits)`)
  }

  const turnoutMeasures = data.turnoutCertainty.measures
  for (const m of turnoutMeasures) {
    if (m.fieldwork.start > m.fieldwork.end) errors.push(`Participation ${m.id} : dates de terrain inversées`)
  }
  if (turnoutMeasures.filter((m) => m.cycle === 2022 && m.final).length !== 1)
    errors.push('Participation : il faut exactement une mesure finale pour 2022')
  if (!turnoutMeasures.some((m) => m.cycle === 2022 && !m.final)) errors.push('Participation : aucune mesure de campagne 2022')
  if (!turnoutMeasures.some((m) => m.cycle === 2027)) errors.push('Participation : aucune mesure 2027')
  if (turnoutMeasures.some((m) => m.cycle === 2027 && m.final)) errors.push('Participation : une mesure 2027 ne peut pas être finale')

  for (const profile of transfers.profiles) {
    for (const b of BLOCS) {
      const row = profile.rows[b]
      const sum = row.finalist + row.rn + row.abstention
      if (Math.abs(sum - 100) > 0.01) errors.push(`Reports ${profile.id}/${b} : total ${sum} ≠ 100`)
    }
  }
  return errors
}

export function parseData(raw: {
  polls: unknown
  reference2022: unknown
  reference2017: unknown
  transfers: unknown
  turnoutCertainty: unknown
}): SimulationData {
  const data: SimulationData = {
    polls: resolveGroupedLeaders(pollsSchema.parse(raw.polls)),
    reference2022: referenceSchema.parse(raw.reference2022),
    reference2017: reference2017Schema.parse(raw.reference2017),
    transfers: transfersSchema.parse(raw.transfers),
    turnoutCertainty: turnoutCertaintySchema.parse(raw.turnoutCertainty),
  }
  const errors = validateData(data)
  if (errors.length > 0) throw new Error(`Données invalides :\n- ${errors.join('\n- ')}`)
  return data
}

export const simulationData: SimulationData = parseData({
  polls: pollsJson,
  reference2022: referenceJson,
  reference2017: reference2017Json,
  transfers: transfersJson,
  turnoutCertainty: turnoutCertaintyJson,
})
