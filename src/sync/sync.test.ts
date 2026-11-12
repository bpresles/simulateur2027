import { parseData, simulationData } from '../data/schema'
import type { Poll, PollsData } from '../domain/types'
import { frozenData } from '../test/frozenData'
import { WIKITEXT } from '../test/wikipediaFixture'
import { CandidateResolver, canonicalInstitute } from './feeds'
import { AUTO_COLORS, autoCandidate, promoteTested, stableStringify, syncPolls, testedNewcomers } from './sync'

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
    // Elabe (ligne écartée) et Harris (absent de la page) : saisies manuelles de la période conservées.
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

  it('garde les petits candidats simulés et leurs reports, sans les rajouter aux candidats non simulés', () => {
    const live = syncPolls(simulationData.polls, WIKITEXT, '2026-10-20')!
    const known = simulationData.polls.candidates.length
    expect(live.data.candidates.slice(0, known)).toEqual(simulationData.polls.candidates)
    expect(live.data.otherCandidates.map((c) => c.id)).not.toContain('lisnard')
    // Olivier Faure, testé seul (Ifop H1) dans la page de test : ajouté aux candidats simulés.
    expect(live.report.promoted).toEqual(['Olivier Faure'])
    expect(live.report.newCandidates).toEqual([])
    const scores = live.data.polls.flatMap((p) => p.hypotheses.map((h) => h.scores))
    expect(scores).toContainEqual(expect.objectContaining({ lisnard: 4, bouamrane: 0.5 }))
  })

  it('compare le contenu indépendamment de l’ordre des champs', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('ajoute aux candidats simulés ceux que les sondages testent, sauf ceux cités dans un jeu d’hypothèses', () => {
    expect(report.promoted).toEqual(['Dominique de Villepin', 'Natacha Polony', 'Olivier Faure'])
    expect(data.candidates.filter((c) => c.auto).map((c) => c.id)).toEqual(['villepin', 'polony', 'faure'])
    const others = data.otherCandidates.map((c) => c.id)
    expect(others).not.toContain('villepin')
    // Exclus des jeux d'hypothèses : restent non simulés.
    expect(others).toEqual(expect.arrayContaining(['hollande', 'lisnard']))
    // Testé seulement à la place d'un autre candidat : reste non simulé.
    expect(report.newCandidates).toEqual(['Jordan Bardella'])
    expect(() => parseData({ ...frozenData, polls: data })).not.toThrow()
  })
})

describe('candidats apparus dans les sondages', () => {
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
      hypothesis('H1', { [first]: 60, [second]: 30, nouveau: 10 }),
      hypothesis('H2', { [first]: 50, remplaçant: 50 }, { remplaçant: second }),
    ]),
    poll('b', [hypothesis('H1', { [first]: 50, [second]: 50 })]),
  ]
  const others = [
    { id: 'nouveau', name: 'Camille Nouveau' },
    { id: 'remplaçant', name: 'Alex Remplaçant' },
  ]
  const input: PollsData = {
    ...current,
    candidates: current.candidates.filter((c) => !c.auto),
    otherCandidates: others,
    polls,
  }

  it('repère les candidats testés, sauf à la place d’un autre candidat', () => {
    expect(testedNewcomers(polls, new Set([first, second]))).toEqual(['nouveau'])
  })

  it('les ajoute en petits candidats, avec des valeurs par défaut', () => {
    const { data: out, promoted } = promoteTested(input)
    expect(promoted.map((c) => c.id)).toEqual(['nouveau'])
    expect(out.otherCandidates).toEqual([others[1]])
    expect(out.candidates.at(-1)).toMatchObject({
      id: 'nouveau',
      name: 'Camille Nouveau',
      shortName: 'Nouveau',
      bloc: null,
      duelProfile: null,
      ref2022: null,
      auto: true,
      minor: { transfers: [expect.objectContaining({ id: 'ensemble' })] },
    })
    // Électeurs répartis comme l'ensemble des électeurs principaux de l'hypothèse qui le teste (2/3, 1/3).
    expect(out.candidates.at(-1)!.minor!.transfers[0]!.parts).toEqual([
      { id: first, weight: 65 },
      { id: second, weight: 35 },
    ])
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
      polls: [...polls, poll('c', [hypothesis('H1', { [first]: 50, [second]: 45, hollande: 5 })])],
    }
    const { data: out, promoted } = promoteTested(withHollande)
    expect(promoted.map((c) => c.id)).toEqual(['nouveau'])
    expect(out.otherCandidates.map((c) => c.id)).toContain('hollande')
  })

  it('ne change rien quand aucun candidat non simulé n’est testé', () => {
    const none = { ...input, polls: [polls[1]!] }
    expect(promoteTested(none)).toEqual({ data: none, promoted: [] })
  })
})
