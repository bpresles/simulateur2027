import { parseData, simulationData } from '../data/schema'
import { MIN_MINOR_INSTITUTES } from '../domain/pollAverage'
import type { Poll, PollsData } from '../domain/types'
import { frozenData } from '../test/frozenData'
import { WIKITEXT } from '../test/wikipediaFixture'
import { CandidateResolver, canonicalInstitute } from './feeds'
import {
  AUTO_COLORS,
  autoCandidate,
  detectStructuralAlerts,
  mergePollHistory,
  promoteTested,
  stableStringify,
  syncPolls,
  testedNewcomers,
} from './sync'

const { polls: current } = frozenData

describe('conversion des noms', () => {
  it('harmonise les noms d’instituts', () => {
    expect(canonicalInstitute('Toluna Harris Interactive')).toBe('Harris Interactive (Toluna)')
    expect(canonicalInstitute('Harris')).toBe('Harris Interactive (Toluna)')
    expect(canonicalInstitute('IFOP')).toBe('Ifop-Fiducial')
    expect(canonicalInstitute('Ipsos bva')).toBe('Ipsos BVA')
  })

  it('associe les candidats et ajoute les inconnus aux candidats non simulés', () => {
    const r = new CandidateResolver(current.candidates, current.otherCandidates)
    expect(r.resolve(['Marine Le Pen', 'Le Pen'], 'Marine Le Pen', 'Le Pen')).toBe('lepen')
    expect(r.resolve(['Dominique de Villepin', 'Villepin'], 'Dominique de Villepin', 'de Villepin')).toBe(
      'villepin',
    )
    expect(r.resolve(['Sébastien Bonnal', 'Bonnal'], 'Sébastien Bonnal', 'Bonnal')).toBe('bonnal')
    expect(r.others.at(-1)).toEqual({ id: 'bonnal', name: 'Sébastien Bonnal' })
  })
})

describe('syncPolls', () => {
  const { data, report } = syncPolls(current, WIKITEXT, '2026-10-20')!
  const byId = (id: string) => data.polls.find((p) => p.id === id)!

  it('remplace les sondages par le dernier de chaque institut sur la période la plus récente', () => {
    expect(data).toMatchObject({
      asOf: '2026-10-20',
      period: { label: 'Octobre-décembre 2026', start: '2026-10-01' },
    })
    expect(report).toMatchObject({ changed: true, period: 'Octobre-décembre 2026' })
    expect(data.polls.map((p) => `${p.institute} ${p.fieldwork.end} ${p.origin ?? 'manuel'}`)).toEqual([
      'Elabe 2026-10-16 manuel',
      'YouGov 2026-10-15 wikipedia',
      'Ifop-Fiducial 2026-10-14 wikipedia',
      'OpinionWay 2026-10-14 wikipedia',
      'Harris Interactive (Toluna) 2026-10-08 manuel',
      'Odoxa 2026-10-07 wikipedia',
    ])
    expect(report.removed).toEqual(['ifop-20260929', 'cluster17-20260916'])
  })

  it('réunit les deux blocs d’un même sondage (même institut, mêmes dates) et garde les identifiants', () => {
    const opinionway = byId('opinionway-20261014')
    expect(opinionway).toMatchObject({ sponsor: 'CNews', sampleSize: 1043 })
    expect(opinionway.hypotheses.map((h) => h.id)).toEqual(['H1', 'H2'])
    expect(opinionway.sources).toHaveLength(3)
    expect(byId('ifop-20261014').origin).toBe('wikipedia')
  })

  it('ne garde, pour chaque institut et chaque duel, que le dernier duel de 2nd tour de la période', () => {
    expect(data.secondRoundPolls).toEqual([
      expect.objectContaining({ institute: 'YouGov', scores: { philippe: 48, lepen: 52 } }),
    ])
  })

  it('garde la part sans intention de vote saisie pour un duel resté sur la page et signale les autres', () => {
    expect(report.missingNoIntention).toEqual(['YouGov 2026-10-15 (philippe-lepen)'])
    const noIntention = {
      share: 32.5,
      base: 'inscrits' as const,
      source: { label: 'Notice (Commission des sondages)', url: 'https://example.org/notice.pdf' },
    }
    const entered = { ...data, secondRoundPolls: data.secondRoundPolls.map((d) => ({ ...d, noIntention })) }
    const again = syncPolls(entered, WIKITEXT, '2026-10-21')!
    expect(again.report).toMatchObject({ changed: false, missingNoIntention: [] })
    expect(again.data.secondRoundPolls).toEqual([expect.objectContaining({ institute: 'YouGov', noIntention })])
  })

  it('une seconde synchronisation sans changement de la page ne modifie rien (ni la date)', () => {
    const again = syncPolls(data, WIKITEXT, '2026-10-21')!
    expect(again.report.changed).toBe(false)
    expect(again.data).toBe(data)
  })

  it('une page méconnaissable ne produit rien : les données restent inchangées', () => {
    expect(syncPolls(current as PollsData, '== Page vide ==', '2026-10-20')).toBeUndefined()
  })

  it('garde les petits candidats simulés et n’en promeut un nouveau que s’il atteint MIN_MINOR_INSTITUTES', () => {
    const live = syncPolls(simulationData.polls, WIKITEXT, '2026-10-20')!
    expect(live.data.candidates).toEqual(simulationData.polls.candidates)
    expect(live.data.otherCandidates.map((c) => c.id)).not.toContain('lisnard')
    // Olivier Faure n'est testé que par 1 institut (Ifop) < MIN_MINOR_INSTITUTES (3) : pas promu.
    expect(live.report.promoted).toEqual([])
    expect(live.report.newCandidates).toEqual([])
    const scores = live.data.polls.flatMap((p) => p.hypotheses.map((h) => h.scores))
    expect(scores).toContainEqual(expect.objectContaining({ lisnard: 4, bouamrane: 0.5 }))
  })

  it('conserve les alliances et les jeux d’hypothèses des données', () => {
    const live = syncPolls(simulationData.polls, WIKITEXT, '2026-10-20')!
    const ids = (list: { id: string }[]) => list.map((x) => x.id)
    expect(ids(live.data.alliances)).toEqual(ids(simulationData.polls.alliances))
    expect(ids(live.data.alliances)).toEqual(expect.arrayContaining(['attal-lisnard', 'lisnard-attal']))
    expect(live.data.hypothesisSets).toEqual(simulationData.polls.hypothesisSets)
    expect(ids(live.data.hypothesisSets)).toContain('philippe-lisnard')
  })

  it('compare le contenu indépendamment de l’ordre des champs', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('ne promeut pas un candidat sous le seuil de 3 instituts et produit des données valides', () => {
    // Dans la fixture Wikipedia réduite, aucun candidat non simulé n'atteint MIN_MINOR_INSTITUTES (3).
    expect(report.promoted).toEqual([])
    expect(data.candidates.filter((c) => c.auto)).toEqual([])
    expect(data.otherCandidates.map((c) => c.id)).toEqual(
      expect.arrayContaining(['hollande', 'lisnard', 'villepin', 'faure']),
    )
    expect(report.newCandidates).toEqual(['Olivier Faure', 'Jordan Bardella'])
    expect(() => parseData({ ...frozenData, polls: data })).not.toThrow()
  })
})

describe('candidats apparus dans les sondages (seuil MIN_MINOR_INSTITUTES = 3)', () => {
  const hypothesis = (id: string, scores: Record<string, number>, replacing?: Record<string, string>) => ({
    id,
    scores,
    ...(replacing && { replacing }),
  })
  const poll = (id: string, hypotheses: ReturnType<typeof hypothesis>[]): Poll => ({
    id,
    institute: id,
    sponsor: '',
    fieldwork: { start: '2026-10-10', end: '2026-10-11' },
    sampleSize: 1000,
    sources: [],
    hypotheses,
  })
  const main = current.candidates.filter((c) => !c.minor)
  const [first, second] = main.map((c) => c.id) as [string, string]
  const polls = [
    poll('a', [
      hypothesis('H1', { [first]: 60, [second]: 30, nouveau: 10, rare: 2 }),
      hypothesis('H2', { [first]: 50, remplaçant: 50 }, { remplaçant: second }),
    ]),
    poll('b', [hypothesis('H1', { [first]: 50, [second]: 40, nouveau: 10 })]),
    poll('c', [hypothesis('H1', { [first]: 55, [second]: 35, nouveau: 10 })]),
  ]
  const others = [
    { id: 'nouveau', name: 'Camille Nouveau' },
    { id: 'rare', name: 'Sam Rare' },
    { id: 'remplaçant', name: 'Alex Remplaçant' },
  ]
  const input: PollsData = {
    ...current,
    candidates: current.candidates.filter((c) => !c.auto),
    otherCandidates: others,
    polls,
  }

  it('repère uniquement les candidats testés par au moins MIN_MINOR_INSTITUTES instituts distincts', () => {
    expect(MIN_MINOR_INSTITUTES).toBe(3)
    expect(testedNewcomers(polls, new Set([first, second]))).toEqual(['nouveau'])
  })

  it('les ajoute en petits candidats, avec des valeurs par défaut sans champ ref2022', () => {
    const { data: out, promoted } = promoteTested(input)
    expect(promoted.map((c) => c.id)).toEqual(['nouveau'])
    expect(out.otherCandidates).toEqual([others[1], others[2]])
    expect(out.candidates.at(-1)).toMatchObject({
      id: 'nouveau',
      name: 'Camille Nouveau',
      shortName: 'Nouveau',
      bloc: null,
      duelProfile: null,
      auto: true,
      minor: { transfers: [expect.objectContaining({ id: 'ensemble' })] },
    })
    expect(out.candidates.at(-1)).not.toHaveProperty('ref2022')
  })

  it('donne à chaque candidat ajouté une couleur neutre non utilisée', () => {
    const one = autoCandidate('x', 'X', polls, input.candidates)
    const two = autoCandidate('y', 'Y', polls, [...input.candidates, one])
    expect([one.color, two.color]).toEqual([AUTO_COLORS[0]![0], AUTO_COLORS[1]![0]])
  })

  it('laisse non simulé un candidat cité dans un jeu d’hypothèses (Hollande, exclu)', () => {
    const withHollande: PollsData = {
      ...input,
      otherCandidates: [...others, { id: 'hollande', name: 'François Hollande' }],
      polls: polls.map((p) => ({
        ...p,
        hypotheses: p.hypotheses.map((h) => ({ ...h, scores: { ...h.scores, hollande: 5 } })),
      })),
    }
    const { data: out, promoted } = promoteTested(withHollande)
    expect(promoted.map((c) => c.id)).toEqual(['nouveau'])
    expect(out.otherCandidates.map((c) => c.id)).toContain('hollande')
  })

  it('ne change rien quand aucun candidat non simulé n’atteint le seuil', () => {
    const none = { ...input, polls: [polls[0]!] }
    expect(promoteTested(none)).toEqual({ data: none, promoted: [] })
  })

  it('fusionne et trie l’historique des sondages sans doublon ni perte des vagues archivées', () => {
    const existing = {
      description: 'Historique test',
      polls: [
        {
          id: 'ifop-20250601',
          institute: 'Ifop-Fiducial',
          fieldwork: { start: '2025-05-30', end: '2025-06-01' },
          sampleSize: 1000,
          scores: { lepen: 35, philippe: 22 },
        },
      ],
    }
    const incoming = [
      {
        id: 'elabe-20261015',
        institute: 'Elabe',
        fieldwork: { start: '2026-10-13', end: '2026-10-15' },
        sampleSize: 1200,
        scores: { lepen: 34, philippe: 18 },
      },
      {
        id: 'ifop-20250601',
        institute: 'Ifop-Fiducial',
        fieldwork: { start: '2025-05-30', end: '2025-06-01' },
        sampleSize: 1000,
        scores: { lepen: 36, philippe: 21 },
      },
    ]
    const merged = mergePollHistory(existing, incoming)
    expect(merged.changed).toBe(true)
    expect(merged.data.polls.map((p) => p.id)).toEqual(['elabe-20261015', 'ifop-20250601'])
    expect(merged.data.polls[1]?.scores.lepen).toBe(36)
    expect(mergePollHistory(merged.data, incoming).changed).toBe(false)
  })

  it('detectStructuralAlerts repère liste officielle, retrait d’un candidat principal et remplaçant fréquent (Bardella → Le Pen)', () => {
    const withReplacement: PollsData = {
      ...current,
      otherCandidates: [...current.otherCandidates, { id: 'bardella', name: 'Jordan Bardella' }],
      polls: ['A', 'B', 'C'].map((inst) => ({
        id: `${inst.toLowerCase()}-20270201`,
        institute: inst,
        sponsor: '',
        fieldwork: { start: '2027-01-30', end: '2027-02-01' },
        sampleSize: 1000,
        sources: [],
        hypotheses: [
          {
            id: 'H1',
            scores: { arthaud: 1, melenchon: 20, roussel: 2, tondelier: 4, glucksmann: 12, philippe: 18, retailleau: 8, 'dupont-aignan': 2, zemmour: 3, bardella: 30 },
            replacing: { bardella: 'lepen' },
          },
        ],
      })),
    }
    const alerts = detectStructuralAlerts(withReplacement, [], true, false)
    expect(alerts.some((a) => /liste officielle/i.test(a))).toBe(true)
    expect(alerts.some((a) => /Marine Le Pen/.test(a))).toBe(true)
    expect(alerts.some((a) => /Jordan Bardella remplace Marine Le Pen/.test(a))).toBe(true)
  })
})
