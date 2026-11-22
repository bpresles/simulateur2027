import { z } from 'zod'
import { BLOCS } from '../domain/types'
import type {
  DeclaredTransfersData,
  PastElectionReference,
  PollHistoryData,
  PollsData,
  Reference2017,
  Reference2022,
  SecondRoundDropoutData,
  SecondRoundPollBiasData,
  SimulationData,
  TransfersData,
} from '../domain/types'
import pollsJson from './polls-2027.json'
import pollsHistoryJson from './polls-history-2027.json'
import reference2017Json from './reference-2017.json'
import referenceJson from './reference-2022.json'
import secondRoundDropoutJson from './second-round-dropout.json'
import secondRoundPollBiasJson from './second-round-poll-bias.json'
import transfersJson from './transfers-legislatives-2024.json'
import declaredTransfersJson from './transfers-2027-declared.json'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date ISO AAAA-MM-JJ attendue')
const percent = z.number().min(0).max(100)
const bloc = z.enum(['gauche', 'centre', 'droite', 'extreme_droite'])
const profileId = z.enum(['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn'])
const provenance = z.enum([
  'franceinfo',
  'publicsenat',
  'lcp',
  'presidentielles2017_2022',
  'presidentielles2007_2012',
  'declare2027',
  'derive',
  'transpose',
  'camp',
  'hypothese',
])
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
      bloc: bloc.nullable(),
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      colorDark: z.string().regex(/^#[0-9a-f]{6}$/i),
      duelProfile: profileId.nullable(),
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
      auto: z.boolean().optional(),
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
      leader: z.string(),
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

const referenceSchema: z.ZodType<Reference2022> = z.object({
  ...pastElectionShape,
  secondRound: secondRoundShape.extend({
    candidates: z.array(z.object({ id: z.string(), votes: z.number().int().nonnegative() })).min(2),
  }),
})

const reference2017Schema: z.ZodType<Reference2017> = z.object({ ...pastElectionShape, secondRound: secondRoundShape })

const transferValuesSchema = z.object({ finalist: percent, rn: percent, abstention: percent })
const transferRow = transferValuesSchema.extend({
  camp: z.enum(['finalist', 'rn']).optional(),
  provenance: z.object({ finalist: provenance, rn: provenance, abstention: provenance }),
  note: z.string().optional(),
})
const fidelitySplitSchema = z.object({ loyal: percent, cross: percent, abstention: percent })
const blocRecord = <T extends z.ZodType>(value: T) => z.record(bloc, value)

const transfersSchema: z.ZodType<TransfersData> = z.object({
  sources: z.record(
    provenance,
    z.object({ label: z.string(), description: z.string(), url: z.url().optional() }),
  ),
  completionRule: z.string(),
  fidelity: z.object({
    default: fidelitySplitSchema,
    byCandidate: z.record(z.string(), fidelitySplitSchema),
    note: z.string(),
  }),
  presidentialCenterRn: z.object({
    description: z.string(),
    defaultWeight: z.number().min(0).max(1),
    elections: z.object({
      '2017': blocRecord(transferValuesSchema),
      '2022': blocRecord(transferValuesSchema),
    }),
    rows: blocRecord(transferRow),
  }),
  profiles: z.array(
    z.object({ id: profileId, label: z.string(), sourceDuel: z.string(), rows: blocRecord(transferRow) }),
  ),
  nonRnPresidential: z.object({
    description: z.string(),
    leftVsCenterRight: blocRecord(z.object({ left: percent, right: percent, abstention: percent })),
    sameSide: z.object({
      abstention: blocRecord(percent),
      affinity: blocRecord(blocRecord(z.number().min(0))),
    }),
  }),
})

const declaredTransfersSchema: z.ZodType<DeclaredTransfersData> = z.object({
  description: z.string(),
  sources: z.array(sourceLink).min(1),
  logitCorrection: z.object({
    description: z.string(),
    deltaFinalist: z.number(),
    deltaRn: z.number(),
  }),
  profiles: z.record(
    profileId,
    blocRecord(
      transferValuesSchema.extend({
        camp: z.enum(['finalist', 'rn']).optional(),
        note: z.string().optional(),
      }),
    ),
  ),
})

const presidentialRound = z.object({
  registered: z.number().int().positive(),
  voters: z.number().int().positive(),
  expressed: z.number().int().positive(),
  source: sourceLink,
})

const aggregatedProfile = z.object({
  label: z.string(),
  finalistBlocs: z.array(bloc).min(2),
  constituenciesCount: z.number().int().positive(),
  firstRoundExpressed: z.number().int().positive(),
  secondRoundExpressed: z.number().int().positive(),
  secondRoundVotes: z.object({ finalist: z.number().int().nonnegative(), rn: z.number().int().nonnegative() }),
  firstRoundVotesByBloc: blocRecord(z.number().int().nonnegative()),
})

const finalistShares = z.array(z.object({ id: z.string(), share: percent })).length(2)

const newVotersSchema = z.object({
  description: z.string(),
  ifop2022: z.object({
    description: z.string(),
    source: sourceLink.extend({ pages: z.string() }),
    abstainedFirstRound: finalistShares,
    abstainersVote: finalistShares,
    allVotersVote: finalistShares,
    abstainersWhoVotedShare: percent,
    roundingMargin: z.number().nonnegative(),
  }),
  insee: z.array(
    z.object({
      year: z.number().int(),
      bothRounds: percent,
      firstOnly: percent,
      secondOnly: percent,
      neither: percent,
      scope: z.string(),
      source: sourceLink,
    }),
  ),
  legislatives2024: z.object({
    constituencies: z.number().int().positive(),
    votersFirstRound: z.number().int().positive(),
    votersSecondRound: z.number().int().positive(),
    expressedFirstRound: z.number().int().positive(),
    expressedSecondRound: z.number().int().positive(),
    note: z.string(),
    sources: z.array(sourceLink).min(1),
  }),
  blankNullNote: z.string(),
})

const secondRoundDropoutSchema: z.ZodType<SecondRoundDropoutData> = z.object({
  description: z.string(),
  newVoters: newVotersSchema,
  presidential: z.object({
    description: z.string(),
    elections: z.array(
      z.object({
        year: z.number().int(),
        duel: z.string(),
        rn: z.boolean(),
        firstRound: presidentialRound,
        secondRound: presidentialRound,
      }),
    ),
  }),
  legislatives2024: z.object({
    description: z.string(),
    method: z.string(),
    nuanceBlocs: blocRecord(z.array(z.string())),
    sources: z.array(sourceLink).min(1),
    profiles: z.record(profileId, aggregatedProfile),
  }),
})

const secondRoundPollBiasSchema: z.ZodType<SecondRoundPollBiasData> = z.object({
  description: z.string(),
  elections: z.array(
    z.object({
      year: z.number().int(),
      duel: z.string(),
      electionDate: isoDate,
      secondRoundDate: isoDate,
      result: z.object({ antiRn: percent, rn: percent, source: sourceLink }),
      listSource: sourceLink,
      polls: z.array(
        z.object({ institute: z.string(), end: isoDate, antiRn: percent, rn: percent, url: z.url() }),
      ),
    }),
  ),
})

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
  const { polls, reference2022, reference2017, transfers, declaredTransfers } = data
  const simulated = new Set(polls.candidates.map((c) => c.id))
  const main = new Set(polls.candidates.filter((c) => !c.minor).map((c) => c.id))
  const known = new Set([...simulated, ...polls.otherCandidates.map((c) => c.id)])
  const ref2022Ids = new Set(reference2022.candidates.map((c) => c.id))
  const profileIds = new Set(transfers.profiles.map((p) => p.id))

  for (const c of polls.candidates) {
    if (c.duelProfile && !profileIds.has(c.duelProfile)) errors.push(`${c.id} : profil inconnu « ${c.duelProfile} »`)
    const minorTransfers = c.minor?.transfers ?? []
    if (new Set(minorTransfers.map((t) => t.id)).size !== minorTransfers.length)
      errors.push(`${c.id} : répartitions en double`)
    for (const t of minorTransfers) {
      for (const p of t.parts) {
        if (!main.has(p.id))
          errors.push(`${c.id}/${t.id} : report vers « ${p.id} », qui n'est pas un candidat principal`)
      }
    }
    if (c.minor && c.isRN) errors.push(`${c.id} : le candidat RN ne peut pas être un petit candidat`)
    if (!c.bloc && !c.minor) errors.push(`${c.id} : un candidat principal doit avoir un bloc`)
  }
  if (polls.candidates.filter((c) => c.isRN).length !== 1) errors.push('Il faut exactement un candidat marqué isRN')
  for (const c of polls.otherCandidates) {
    if (simulated.has(c.id)) errors.push(`${c.id} : à la fois candidat simulé et non simulé`)
  }

  for (const set of polls.hypothesisSets) {
    for (const id of [...set.require, ...set.exclude]) {
      if (!known.has(id)) errors.push(`Jeu d'hypothèses ${set.id} : candidat inconnu « ${id} »`)
      else if (simulated.has(id) && !main.has(id) && (set.default || !set.require.includes(id)))
        errors.push(`Jeu d'hypothèses ${set.id} : petit candidat « ${id} »`)
    }
  }
  if (polls.hypothesisSets.filter((s) => s.default).length !== 1) errors.push('Il faut exactement un jeu par défaut')

  for (const a of polls.alliances) {
    for (const id of a.members) {
      if (!simulated.has(id)) errors.push(`Alliance ${a.id} : candidat non simulé « ${id} »`)
      else if (!polls.candidates.find((c) => c.id === id)!.bloc)
        errors.push(`Alliance ${a.id} : candidat sans bloc « ${id} »`)
    }
    if (!a.members.includes(a.leader)) errors.push(`Alliance ${a.id} : le leader n'est pas membre`)
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
    if (ids.length !== 2 || ids.some((id) => !simulated.has(id)))
      errors.push(`Sondage de 2nd tour ${p.institute} invalide`)
    if ((p.noIntention?.undecided ?? 0) > (p.noIntention?.share ?? 100)) {
      errors.push(`Sondage de 2nd tour ${p.institute} : plus d'indécis que de personnes sans intention de vote`)
    }
  }

  const finalists = reference2022.secondRound.candidates
  if (finalists.some((c) => !ref2022Ids.has(c.id))) errors.push('2nd tour 2022 : finaliste inconnu du 1er tour')
  if (finalists.reduce((t, c) => t + c.votes, 0) !== reference2022.secondRound.expressed)
    errors.push('2022 : total des voix des finalistes ≠ exprimés du 2nd tour')
  const { ifop2022, insee } = data.secondRoundDropout.newVoters
  const ifopLists = [ifop2022.abstainedFirstRound, ifop2022.abstainersVote, ifop2022.allVotersVote]
  if (ifopLists.some((l) => l.some((s) => !finalists.some((c) => c.id === s.id))))
    errors.push('Nouveaux votants : un finaliste de l’Ifop n’est pas un finaliste de 2022')
  for (const l of [ifop2022.abstainersVote, ifop2022.allVotersVote]) {
    if (Math.abs(l.reduce((t, s) => t + s.share, 0) - 100) > 1e-9)
      errors.push('Nouveaux votants : parts Ifop de total ≠ 100 %')
  }
  for (const y of insee) {
    if (Math.abs(y.bothRounds + y.firstOnly + y.secondOnly + y.neither - 100) > 0.5)
      errors.push(`Nouveaux votants : parts Insee ${y.year} de total éloigné de 100 %`)
  }
  errors.push(...validatePastElection('2022', reference2022), ...validatePastElection('2017', reference2017))
  for (const [label, ref] of [
    ['2022', reference2022],
    ['2017', reference2017],
  ] as const) {
    const t2 = ref.secondRound
    if (t2.voters - t2.blank - t2.invalid !== t2.expressed)
      errors.push(`${label} : 2nd tour incohérent (votants − blancs − nuls ≠ exprimés)`)
    if (t2.voters > t2.registered) errors.push(`${label} : 2nd tour incohérent (votants > inscrits)`)
  }

  // Vérification des fidélités (total 100 %)
  const checkFid = (label: string, f: { loyal: number; cross: number; abstention: number }) => {
    if (Math.abs(f.loyal + f.cross + f.abstention - 100) > 0.01)
      errors.push(`Fidélité ${label} : total ${f.loyal + f.cross + f.abstention} ≠ 100`)
  }
  checkFid('défaut', transfers.fidelity.default)
  for (const [id, f] of Object.entries(transfers.fidelity.byCandidate)) {
    if (!simulated.has(id)) errors.push(`Fidélité : candidat inconnu « ${id} »`)
    checkFid(id, f)
  }

  // Vérification des profils de reports (total 100 %)
  for (const profile of transfers.profiles) {
    for (const b of BLOCS) {
      const row = profile.rows[b]
      const sum = row.finalist + row.rn + row.abstention
      if (Math.abs(sum - 100) > 0.01) errors.push(`Reports ${profile.id}/${b} : total ${sum} ≠ 100`)
    }
  }
  for (const b of BLOCS) {
    const row = transfers.presidentialCenterRn.rows[b]
    const sum = row.finalist + row.rn + row.abstention
    if (Math.abs(sum - 100) > 0.01) errors.push(`Reports présidentiels centre-RN/${b} : total ${sum} ≠ 100`)
    const nr = transfers.nonRnPresidential.leftVsCenterRight[b]
    const nrSum = nr.left + nr.right + nr.abstention
    if (Math.abs(nrSum - 100) > 0.01) errors.push(`Reports hors-RN/${b} : total ${nrSum} ≠ 100`)
  }
  for (const [pid, rows] of Object.entries(declaredTransfers.profiles)) {
    for (const b of BLOCS) {
      const row = rows[b]
      const sum = row.finalist + row.rn + row.abstention
      if (Math.abs(sum - 100) > 0.01) errors.push(`Reports déclarés 2027 ${pid}/${b} : total ${sum} ≠ 100`)
    }
  }

  const dropout = data.secondRoundDropout
  for (const profile of transfers.profiles) {
    const agg = dropout.legislatives2024.profiles[profile.id]
    if (!agg) errors.push(`Agrégats 2024 : profil « ${profile.id} » absent`)
    else {
      const votes = Object.values(agg.firstRoundVotesByBloc).reduce((t, v) => t + v, 0)
      if (Math.abs(votes - agg.firstRoundExpressed) > agg.constituenciesCount * 5)
        errors.push(`Agrégats 2024 ${profile.id} : voix par bloc ≠ exprimés du 1er tour`)
      if (Math.abs(agg.secondRoundVotes.finalist + agg.secondRoundVotes.rn - agg.secondRoundExpressed) > agg.constituenciesCount * 5)
        errors.push(`Agrégats 2024 ${profile.id} : voix du finaliste et du RN ≠ exprimés du 2nd tour`)
    }
  }
  for (const e of dropout.presidential.elections) {
    for (const [label, r] of [
      ['1er tour', e.firstRound],
      ['2nd tour', e.secondRound],
    ] as const) {
      if (!(r.expressed <= r.voters && r.voters <= r.registered))
        errors.push(`Abandon ${e.year} ${label} : incohérent (exprimés ≤ votants ≤ inscrits attendu)`)
    }
  }
  for (const e of data.secondRoundPollBias.elections) {
    if (Math.abs(e.result.antiRn + e.result.rn - 100) > 0.01)
      errors.push(`Écart des sondages ${e.year} : résultat ≠ 100`)
    for (const p of e.polls) {
      if (Math.abs(p.antiRn + p.rn - 100) > 0.51)
        errors.push(`Écart des sondages ${e.year} ${p.institute} ${p.end} : scores ≠ 100`)
      if (p.end >= e.electionDate) errors.push(`Écart des sondages ${e.year} ${p.institute} ${p.end} : postérieur au 1er tour`)
    }
  }
  return errors
}

const pollHistorySchema: z.ZodType<PollHistoryData> = z.object({
  description: z.string(),
  polls: z.array(
    z.object({
      id: z.string(),
      institute: z.string(),
      fieldwork,
      sampleSize: z.number().int().positive(),
      scores,
    }),
  ),
})

export function parseData(raw: {
  polls: unknown
  pollHistory: unknown
  reference2022: unknown
  reference2017: unknown
  transfers: unknown
  declaredTransfers: unknown
  secondRoundDropout: unknown
  secondRoundPollBias: unknown
}): SimulationData {
  const data: SimulationData = {
    polls: pollsSchema.parse(raw.polls),
    pollHistory: pollHistorySchema.parse(raw.pollHistory),
    reference2022: referenceSchema.parse(raw.reference2022),
    reference2017: reference2017Schema.parse(raw.reference2017),
    transfers: transfersSchema.parse(raw.transfers),
    declaredTransfers: declaredTransfersSchema.parse(raw.declaredTransfers),
    secondRoundDropout: secondRoundDropoutSchema.parse(raw.secondRoundDropout),
    secondRoundPollBias: secondRoundPollBiasSchema.parse(raw.secondRoundPollBias),
  }
  const errors = validateData(data)
  if (errors.length > 0) throw new Error(`Données invalides :\n- ${errors.join('\n- ')}`)
  return data
}

export const simulationData: SimulationData = parseData({
  polls: pollsJson,
  pollHistory: pollsHistoryJson,
  reference2022: referenceJson,
  reference2017: reference2017Json,
  transfers: transfersJson,
  declaredTransfers: declaredTransfersJson,
  secondRoundDropout: secondRoundDropoutJson,
  secondRoundPollBias: secondRoundPollBiasJson,
})
