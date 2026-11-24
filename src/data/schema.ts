import { z } from 'zod'
import { BLOCS } from '../domain/types'
import type {
  DeclaredTransfersData,
  LegislativeDuelPolls2024Data,
  PastElectionReference,
  PollHistoryData,
  PollsData,
  Reference2012,
  Reference2017,
  Reference2022,
  SecondRoundDropoutData,
  SecondRoundPollBiasData,
  SecondRoundReferenceMatricesData,
  SimulationData,
  TransfersData,
} from '../domain/types'
import legislativeDuelPolls2024Json from './legislative-duel-polls-2024.json'
import pollsJson from './polls-2027.json'
import pollsHistoryJson from './polls-history-2027.json'
import reference2012Json from './reference-2012.json'
import reference2017Json from './reference-2017.json'
import referenceJson from './reference-2022.json'
import secondRoundDropoutJson from './second-round-dropout.json'
import secondRoundPollBiasJson from './second-round-poll-bias.json'
import secondRoundReferenceMatricesJson from './second-round-reference-matrices.json'
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
  officialList: z.boolean().optional(),
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

const reference2012Schema: z.ZodType<Reference2012> = z.object({
  ...pastElectionShape,
  secondRound: z.object({
    registered: z.number().int().positive(),
    voters: z.number().int().positive(),
    blankOrInvalid: z.number().int().nonnegative(),
    expressed: z.number().int().positive(),
    candidates: z.array(z.object({ id: z.string(), votes: z.number().int().nonnegative() })).min(2),
    source: sourceLink,
  }),
})

const reference2017Schema: z.ZodType<Reference2017> = z.object({
  ...pastElectionShape,
  secondRound: secondRoundShape.extend({
    candidates: z.array(z.object({ id: z.string(), votes: z.number().int().nonnegative() })).min(2),
  }),
})

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
  updatedAt: isoDate.optional(),
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

const pollBiasPhase = z.enum(['avantPremierTour', 'entreDeuxTours'])

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
        z.object({
          institute: z.string(),
          end: isoDate,
          phase: pollBiasPhase,
          antiRn: percent,
          rn: percent,
          url: z.url(),
        }),
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
  const { polls, reference2022, reference2017, reference2012, transfers, declaredTransfers } = data
  const simulated = new Set(polls.candidates.map((c) => c.id))
  const main = new Set(polls.candidates.filter((c) => !c.minor).map((c) => c.id))
  const known = new Set([...simulated, ...polls.otherCandidates.map((c) => c.id)])
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
  errors.push(
    ...validatePastElection('2022', reference2022),
    ...validatePastElection('2017', reference2017),
    ...validatePastElection('2012', reference2012),
  )
  {
    const t2 = reference2012.secondRound
    if (t2.voters - t2.blankOrInvalid !== t2.expressed)
      errors.push('2012 : 2nd tour incohérent (votants − blancs et nuls ≠ exprimés)')
    if (t2.candidates.reduce((t, c) => t + c.votes, 0) !== t2.expressed)
      errors.push('2012 : total des voix des finalistes ≠ exprimés du 2nd tour')
    if (t2.voters > t2.registered) errors.push('2012 : 2nd tour incohérent (votants > inscrits)')
  }
  for (const [label, ref] of [
    ['2022', reference2022],
    ['2017', reference2017],
  ] as const) {
    const t2 = ref.secondRound
    const r1Ids = new Set(ref.candidates.map((c) => c.id))
    if (t2.candidates.some((c) => !r1Ids.has(c.id))) errors.push(`2nd tour ${label} : finaliste inconnu du 1er tour`)
    if (t2.candidates.reduce((t, c) => t + c.votes, 0) !== t2.expressed)
      errors.push(`${label} : total des voix des finalistes ≠ exprimés du 2nd tour`)
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
      if (p.phase === 'avantPremierTour' && p.end >= e.electionDate)
        errors.push(`Écart des sondages ${e.year} ${p.institute} ${p.end} : avantPremierTour postérieur au 1er tour`)
      if (p.phase === 'entreDeuxTours' && (p.end < e.electionDate || p.end >= e.secondRoundDate))
        errors.push(`Écart des sondages ${e.year} ${p.institute} ${p.end} : entreDeuxTours hors [1er tour ; 2nd tour[`)
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
  reference2012: unknown
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
    reference2012: reference2012Schema.parse(raw.reference2012),
    transfers: transfersSchema.parse(raw.transfers),
    declaredTransfers: declaredTransfersSchema.parse(raw.declaredTransfers),
    secondRoundDropout: secondRoundDropoutSchema.parse(raw.secondRoundDropout),
    secondRoundPollBias: secondRoundPollBiasSchema.parse(raw.secondRoundPollBias),
  }
  const errors = validateData(data)
  if (errors.length > 0) throw new Error(`Données invalides :\n- ${errors.join('\n- ')}`)
  return data
}

const referenceTransferTripletSchema = z.object({
  antiRn: percent,
  rn: percent,
  nonExpressed: percent,
})

const referenceMatrixRowSchema = z.object({
  candidateId: z.string(),
  bySurvey: z.record(z.string(), referenceTransferTripletSchema.nullable()),
})

const referenceParticipationTableSchema = z.object({
  surveyId: z.string(),
  pdfPage: z.number().int().positive(),
  printedPage: z.number().int().positive().nullable(),
  abstentionPctByCandidate: z.record(z.string(), percent),
})

export const secondRoundReferenceMatricesSchema: z.ZodType<SecondRoundReferenceMatricesData> = z.object({
  description: z.string(),
  surveys: z
    .array(
      z.object({
        id: z.string(),
        year: z.union([z.literal(2017), z.literal(2022)]),
        institute: z.enum(['Ipsos Sopra Steria', 'Ifop-Fiducial']),
        fieldwork,
        timing: z.enum(['before', 'electionDay', 'after']),
        sampleSize: z.number().int().positive(),
        mode: z.string(),
        weighting: z.string().nullable(),
        note: z.string().optional(),
        url: z.url(),
        noticeUrl: z.url().optional(),
        pdfPage: z.number().int().positive(),
        printedPage: z.number().int().positive().nullable(),
        participationPdfPage: z.number().int().positive().optional(),
        participationPrintedPage: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(1),
  rows: z.object({
    '2017': z.array(referenceMatrixRowSchema).min(1),
    '2022': z.array(referenceMatrixRowSchema).min(1),
  }),
  participation: z.object({
    '2017': referenceParticipationTableSchema,
    '2022': referenceParticipationTableSchema,
  }),
  abstainers: z.object({
    '2022': z.object({
      surveyId: z.string(),
      turnoutPdfPage: z.number().int().positive(),
      turnoutPrintedPage: z.number().int().positive().nullable(),
      expressedPdfPage: z.number().int().positive(),
      expressedPrintedPage: z.number().int().positive().nullable(),
      votersSharePct: percent,
      expressedSplit: z.object({ antiRn: percent, rn: percent }),
    }),
  }),
})

/** Contrôles croisés des matrices de référence 2017–2022 (somme à 100 ± 1 pt, candidats et enquêtes déclarés). */
export function validateSecondRoundReferenceMatrices(
  matrices: SecondRoundReferenceMatricesData,
  refs: { '2017': Pick<Reference2017, 'candidates'>; '2022': Pick<Reference2022, 'candidates'> },
): string[] {
  const errors: string[] = []
  const surveyById = new Map<string, (typeof matrices.surveys)[number]>()
  for (const s of matrices.surveys) {
    if (surveyById.has(s.id)) errors.push(`Matrices 2nd tour : enquête en double « ${s.id} »`)
    surveyById.set(s.id, s)
    if (s.fieldwork.start > s.fieldwork.end) errors.push(`Matrices 2nd tour ${s.id} : dates de terrain inversées`)
  }

  for (const year of ['2017', '2022'] as const) {
    const yearNum = Number(year)
    const refIds = new Set(refs[year].candidates.map((c) => c.id))
    const seenCandidates = new Set<string>()
    for (const row of matrices.rows[year]) {
      if (!refIds.has(row.candidateId)) {
        errors.push(`Matrices 2nd tour ${year} : candidat inconnu « ${row.candidateId} »`)
      }
      if (seenCandidates.has(row.candidateId)) {
        errors.push(`Matrices 2nd tour ${year} : candidat en double « ${row.candidateId} »`)
      }
      seenCandidates.add(row.candidateId)
      const entries = Object.entries(row.bySurvey)
      if (!entries.some(([, v]) => v !== null)) {
        errors.push(`Matrices 2nd tour ${year}/${row.candidateId} : aucune enquête renseignée`)
      }
      for (const [surveyId, triplet] of entries) {
        const survey = surveyById.get(surveyId)
        if (!survey) {
          errors.push(`Matrices 2nd tour ${year}/${row.candidateId} : enquête non déclarée « ${surveyId} »`)
        } else if (survey.year !== yearNum) {
          errors.push(`Matrices 2nd tour ${year}/${row.candidateId} : enquête « ${surveyId} » d'une autre année`)
        }
        if (triplet !== null) {
          const sum = triplet.antiRn + triplet.rn + triplet.nonExpressed
          if (Math.abs(sum - 100) > 1) {
            errors.push(`Matrices 2nd tour ${year}/${row.candidateId}/${surveyId} : somme ${sum} hors [99 ; 101]`)
          }
        }
      }
    }

    const part = matrices.participation[year]
    const partSurvey = surveyById.get(part.surveyId)
    if (!partSurvey) {
      errors.push(`Participation 2nd tour ${year} : enquête non déclarée « ${part.surveyId} »`)
    } else if (partSurvey.year !== yearNum) {
      errors.push(`Participation 2nd tour ${year} : enquête « ${part.surveyId} » d'une autre année`)
    }
    for (const candidateId of Object.keys(part.abstentionPctByCandidate)) {
      if (!refIds.has(candidateId)) {
        errors.push(`Participation 2nd tour ${year} : candidat inconnu « ${candidateId} »`)
      }
    }
  }

  const abs2022 = matrices.abstainers['2022']
  const absSurvey = surveyById.get(abs2022.surveyId)
  if (!absSurvey) errors.push(`Abstentionnistes 2022 : enquête non déclarée « ${abs2022.surveyId} »`)
  else if (absSurvey.year !== 2022) errors.push(`Abstentionnistes 2022 : enquête « ${abs2022.surveyId} » d'une autre année`)
  const absSum = abs2022.expressedSplit.antiRn + abs2022.expressedSplit.rn
  if (Math.abs(absSum - 100) > 1) {
    errors.push(`Abstentionnistes 2022 : somme exprimée ${absSum} hors [99 ; 101]`)
  }

  return errors
}

export function parseSecondRoundReferenceMatrices(
  raw: unknown,
  refs: { '2017': Pick<Reference2017, 'candidates'>; '2022': Pick<Reference2022, 'candidates'> },
): SecondRoundReferenceMatricesData {
  const parsed = secondRoundReferenceMatricesSchema.parse(raw)
  const errors = validateSecondRoundReferenceMatrices(parsed, refs)
  if (errors.length > 0) throw new Error(`Matrices de référence 2nd tour invalides :\n- ${errors.join('\n- ')}`)
  return parsed
}

export const simulationData: SimulationData = parseData({
  polls: pollsJson,
  pollHistory: pollsHistoryJson,
  reference2022: referenceJson,
  reference2017: reference2017Json,
  reference2012: reference2012Json,
  transfers: transfersJson,
  declaredTransfers: declaredTransfersJson,
  secondRoundDropout: secondRoundDropoutJson,
  secondRoundPollBias: secondRoundPollBiasJson,
})

const legislativeDuelCandidateSchema = z.object({
  name: z.string().min(1),
  party: z.string().min(1),
  officialNuance: z.string().min(1),
  partySource: sourceLink,
  pollScore: percent,
  officialScore: percent,
})

const legislativeDuelPolls2024Schema: z.ZodType<LegislativeDuelPolls2024Data> = z.object({
  description: z.string(),
  inventoryNote: z.string(),
  electionDates: z.object({ firstRound: isoDate, secondRound: isoDate }),
  candidateParties: z.record(z.string(), z.string().min(1).nullable()),
  polls: z.array(
    z.object({
      id: z.string().min(1),
      constituencyCode: z.string().min(1),
      constituencyLabel: z.string().min(1),
      institute: z.string().min(1),
      sponsor: z.string().min(1),
      fieldwork,
      sampleSize: z.number().int().positive(),
      sampleNote: z.string().optional(),
      url: z.url(),
      officialResultSource: sourceLink,
      candidates: z.tuple([legislativeDuelCandidateSchema, legislativeDuelCandidateSchema]),
    }),
  ),
})

/** Contrôles croisés sur les sondages de circonscription d'entre-deux-tours des législatives 2024 (P4). */
export function validateLegislativeDuelPolls2024(
  data: LegislativeDuelPolls2024Data,
  polls: Pick<PollsData, 'candidates'>,
): string[] {
  const errors: string[] = []
  const { firstRound, secondRound } = data.electionDates
  if (firstRound >= secondRound) {
    errors.push('Législatives 2024 : dates des deux tours inversées')
  }

  const simulatedIds = new Set(polls.candidates.map((c) => c.id))
  for (const id of Object.keys(data.candidateParties)) {
    if (!simulatedIds.has(id)) {
      errors.push(`Législatives 2024 candidateParties : candidat inconnu « ${id} »`)
    }
  }
  for (const id of simulatedIds) {
    if (!(id in data.candidateParties)) {
      errors.push(`Législatives 2024 candidateParties : candidat simulé manquant « ${id} »`)
    }
  }

  const seenIds = new Set<string>()
  for (const poll of data.polls) {
    if (seenIds.has(poll.id)) errors.push(`Législatives 2024 : identifiant en doublon « ${poll.id} »`)
    seenIds.add(poll.id)

    if (poll.fieldwork.start > poll.fieldwork.end) {
      errors.push(`Législatives 2024 ${poll.id} : dates de terrain inversées`)
    }
    if (poll.fieldwork.start < firstRound || poll.fieldwork.end >= secondRound) {
      errors.push(`Législatives 2024 ${poll.id} : terrain hors entre-deux-tours [${firstRound} ; ${secondRound}[`)
    }
    const [c1, c2] = poll.candidates
    if (c1.party === c2.party) {
      errors.push(`Législatives 2024 ${poll.id} : les deux candidats du duel ont le même parti « ${c1.party} »`)
    }
    const pollSum = c1.pollScore + c2.pollScore
    if (Math.abs(pollSum - 100) > 0.51) {
      errors.push(`Législatives 2024 ${poll.id} : somme des scores du sondage ${pollSum} ≠ 100`)
    }
    const officialSum = c1.officialScore + c2.officialScore
    if (Math.abs(officialSum - 100) > 0.05) {
      errors.push(`Législatives 2024 ${poll.id} : somme des résultats officiels ${officialSum} ≠ 100`)
    }
  }

  return errors
}

export function parseLegislativeDuelPolls2024(
  raw: unknown,
  polls: Pick<PollsData, 'candidates'>,
): LegislativeDuelPolls2024Data {
  const parsed = legislativeDuelPolls2024Schema.parse(raw)
  const errors = validateLegislativeDuelPolls2024(parsed, polls)
  if (errors.length > 0) throw new Error(`Sondages législatifs 2024 invalides :\n- ${errors.join('\n- ')}`)
  return parsed
}

/** Matrices brutes 2017–2022 validées ; non branchées sur le moteur par défaut tant que P1 n'est pas adopté (R1.12). */
export const secondRoundReferenceMatrices: SecondRoundReferenceMatricesData = parseSecondRoundReferenceMatrices(
  secondRoundReferenceMatricesJson,
  { '2017': simulationData.reference2017, '2022': simulationData.reference2022 },
)

/** Sondages de circonscription d'entre-deux-tours des législatives 2024 (P4, affichage seulement, jamais dans les calculs). */
export const legislativeDuelPolls2024: LegislativeDuelPolls2024Data = parseLegislativeDuelPolls2024(
  legislativeDuelPolls2024Json,
  simulationData.polls,
)
