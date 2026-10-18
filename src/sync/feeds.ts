// Conversion des flux de sondages externes vers le format de polls-2027.json.
import { z } from 'zod'
import type { Candidate, OtherCandidate, Poll, SecondRoundPoll } from '../domain/types'

export const FEEDS = {
  etmoi: {
    label: '2027etmoi – sondages d’après les notices officielles (data.gouv.fr, Licence Ouverte 2.0)',
    url: 'https://2027etmoi.fr/data/sondages.json',
    page: 'https://www.data.gouv.fr/datasets/sondages-dintentions-de-vote-au-premier-tour-presidentielle-2027-notices-officielles',
  },
  mieuxvoter: {
    label: 'Mieux Voter – presidentielle2027 (GitHub, licence MIT)',
    url: 'https://raw.githubusercontent.com/MieuxVoter/presidentielle2027/main/presidentielle2027.json',
    page: 'https://github.com/MieuxVoter/presidentielle2027',
  },
} as const

// ——— Formats des flux (seuls les champs utilisés sont décrits) ———

export interface EtmoiFeed {
  mise_a_jour: string
  noms_hors_liste?: Record<string, string>
  sondages: {
    institut: string
    commanditaire: string
    terrain_debut: string
    terrain_fin: string
    echantillon: number
    source: { titre: string; url: string }
    source_primaire_verifiee?: boolean
    hypotheses: { label: string; scores: Record<string, number> }[]
  }[]
}

export interface MieuxVoterFeed {
  hypotheses?: { id: string; comment?: string }[]
  polls: {
    poll_id: string
    institut: string
    commanditaire: string
    debut_enquete: string
    fin_enquete: string
    echantillon: number
    hypothese: string
    tour: string
    candidats: { candidat: string; surname: string; intentions: number }[]
  }[]
}

// ——— Instituts et candidats ———

const INSTITUTES: [RegExp, string][] = [
  [/ifop/i, 'Ifop-Fiducial'],
  [/harris|toluna/i, 'Harris Interactive (Toluna)'],
  [/ipsos|bva/i, 'Ipsos BVA'],
  [/elabe/i, 'Elabe'],
  [/odoxa/i, 'Odoxa'],
  [/opinion\s*way/i, 'OpinionWay'],
  [/yougov/i, 'YouGov'],
  [/cluster\s*17/i, 'Cluster17'],
  [/verian|kantar/i, 'Verian'],
]

/** Nom d'institut harmonisé, pour regrouper les appellations différentes d'un même institut. */
export function canonicalInstitute(name: string): string {
  return INSTITUTES.find(([re]) => re.test(name))?.[1] ?? name.trim()
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Associe les noms des flux aux identifiants du simulateur. Un candidat inconnu est ajouté aux
 * candidats non simulés (il est retiré des hypothèses lors de la moyenne, comme Villepin ou Polony).
 */
export class CandidateResolver {
  private readonly byKey = new Map<string, string>()
  readonly others: OtherCandidate[]

  constructor(candidates: Candidate[], others: OtherCandidate[]) {
    this.others = [...others]
    for (const c of candidates) [c.id, c.name, c.shortName].forEach((k) => this.byKey.set(fold(k), c.id))
    for (const c of others) [c.id, c.name].forEach((k) => this.byKey.set(fold(k), c.id))
  }

  resolve(keys: string[], name: string, newId: string): string {
    for (const k of keys) {
      const id = this.byKey.get(fold(k))
      if (id) return id
    }
    const id = slugify(newId)
    this.others.push({ id, name })
    ;[id, name, ...keys].forEach((k) => this.byKey.set(fold(k), id))
    return id
  }
}

export const pollId = (institute: string, end: string) => `${slugify(institute)}-${end.replaceAll('-', '')}`

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

// ——— Conversions ———

export function fromEtmoi(feed: EtmoiFeed, resolver: CandidateResolver): Poll[] {
  return feed.sondages.map((s) => {
    const institute = canonicalInstitute(s.institut)
    return {
      id: pollId(institute, s.terrain_fin),
      origin: '2027etmoi',
      institute,
      sponsor: s.commanditaire,
      fieldwork: { start: s.terrain_debut, end: s.terrain_fin },
      sampleSize: s.echantillon,
      sources: [{ label: s.source.titre, url: s.source.url }],
      verified: s.source_primaire_verifiee
        ? 'Chiffres recopiés de la notice officielle (Commission des sondages), via 2027etmoi.'
        : undefined,
      note: s.source_primaire_verifiee ? undefined : 'Importé de 2027etmoi, notice non encore vérifiée.',
      hypotheses: s.hypotheses.map((h, i) => ({
        id: `H${i + 1}`,
        label: h.label,
        scores: Object.fromEntries(
          Object.entries(h.scores).map(([slug, v]) => [
            resolver.resolve([slug], feed.noms_hors_liste?.[slug] ?? titleCase(slug), slug),
            v,
          ]),
        ),
      })),
    }
  })
}

export function fromMieuxVoter(
  feed: MieuxVoterFeed,
  resolver: CandidateResolver,
  simulated: ReadonlySet<string>,
): { polls: Poll[]; secondRound: SecondRoundPoll[] } {
  const comments = new Map((feed.hypotheses ?? []).map((h) => [h.id, h.comment]))
  const byPoll = new Map<string, Poll>()
  const secondRound: SecondRoundPoll[] = []

  for (const entry of feed.polls) {
    const institute = canonicalInstitute(entry.institut)
    const scores = Object.fromEntries(
      entry.candidats.map((c) => [resolver.resolve([c.candidat, c.surname], c.candidat, c.surname), c.intentions]),
    )
    if (entry.tour.startsWith('2')) {
      const ids = Object.keys(scores)
      if (ids.length === 2 && ids.every((id) => simulated.has(id))) {
        secondRound.push({
          institute,
          sponsor: entry.commanditaire,
          fieldwork: { start: entry.debut_enquete, end: entry.fin_enquete },
          sampleSize: entry.echantillon,
          url: FEEDS.mieuxvoter.page,
          scores,
        })
      }
      continue
    }
    const id = pollId(institute, entry.fin_enquete)
    const poll = byPoll.get(id) ?? {
      id,
      origin: 'mieuxvoter' as const,
      institute,
      sponsor: entry.commanditaire,
      fieldwork: { start: entry.debut_enquete, end: entry.fin_enquete },
      sampleSize: entry.echantillon,
      sources: [{ label: `Mieux Voter – ${entry.poll_id.replace(/_[^_]+$/, '')}`, url: FEEDS.mieuxvoter.page }],
      verified: 'Chiffres compilés par Mieux Voter d’après la notice officielle (Commission des sondages).',
      hypotheses: [],
    }
    poll.hypotheses.push({
      id: entry.poll_id.split('_').at(-1) ?? `H${poll.hypotheses.length + 1}`,
      label: comments.get(entry.hypothese),
      scores,
    })
    byPoll.set(id, poll)
  }
  return { polls: [...byPoll.values()], secondRound }
}

// ——— Contrôle de forme des flux : un format inattendu est ignoré plutôt que d'altérer les données ———

const num = z.number().finite()
export const etmoiSchema: z.ZodType<EtmoiFeed> = z.object({
  mise_a_jour: z.string(),
  noms_hors_liste: z.record(z.string(), z.string()).optional(),
  sondages: z.array(
    z.object({
      institut: z.string(),
      commanditaire: z.string(),
      terrain_debut: z.iso.date(),
      terrain_fin: z.iso.date(),
      echantillon: num,
      source: z.object({ titre: z.string(), url: z.url() }),
      source_primaire_verifiee: z.boolean().optional(),
      hypotheses: z.array(z.object({ label: z.string(), scores: z.record(z.string(), num) })),
    }),
  ),
})

export const mieuxVoterSchema: z.ZodType<MieuxVoterFeed> = z.object({
  hypotheses: z.array(z.object({ id: z.string(), comment: z.string().optional() })).optional(),
  polls: z.array(
    z.object({
      poll_id: z.string(),
      institut: z.string(),
      commanditaire: z.string(),
      debut_enquete: z.iso.date(),
      fin_enquete: z.iso.date(),
      echantillon: num,
      hypothese: z.string(),
      tour: z.string(),
      candidats: z.array(z.object({ candidat: z.string(), surname: z.string(), intentions: num })),
    }),
  ),
})
