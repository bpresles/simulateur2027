import { computeReference2022 } from '../domain/corrections'
import type { Poll } from '../domain/types'
import { frozenData } from '../test/frozenData'
import { CandidateResolver, canonicalInstitute, fromEtmoi, fromMieuxVoter } from './feeds'
import type { EtmoiFeed, MieuxVoterFeed } from './feeds'
import { mergePolls, stableStringify, syncPolls } from './sync'

const { polls: current, reference2022 } = frozenData
const stats = computeReference2022(reference2022)
const resolver = () => new CandidateResolver(current.candidates, current.otherCandidates)
const simulated = new Set(current.candidates.map((c) => c.id))

const etmoiPoll = (over: Partial<EtmoiFeed['sondages'][number]> = {}): EtmoiFeed['sondages'][number] => ({
  institut: 'Ifop-Fiducial',
  commanditaire: 'LCI',
  terrain_debut: '2026-10-12',
  terrain_fin: '2026-10-14',
  echantillon: 1390,
  source: { titre: 'Notice Ifop', url: 'https://www.commission-des-sondages.fr/notices/x.pdf' },
  source_primaire_verifiee: true,
  hypotheses: [{ label: 'Philippe', scores: { melenchon: 16, 'le-pen': 35, philippe: 18, glucksmann: 13.5, bonnal: 1 } }],
  ...over,
})
const etmoi = (sondages: EtmoiFeed['sondages']): EtmoiFeed => ({
  mise_a_jour: '2026-10-17',
  noms_hors_liste: { bonnal: 'Sébastien Bonnal' },
  sondages,
})

describe('conversion des flux', () => {
  it('harmonise les noms d’instituts', () => {
    expect(canonicalInstitute('Toluna Harris Interactive')).toBe('Harris Interactive (Toluna)')
    expect(canonicalInstitute('IFOP')).toBe('Ifop-Fiducial')
    expect(canonicalInstitute('Ipsos bva')).toBe('Ipsos BVA')
  })

  it('associe les candidats et ajoute les inconnus aux candidats non simulés', () => {
    const r = resolver()
    expect(r.resolve(['le-pen'], 'Le Pen', 'le-pen')).toBe('lepen')
    expect(r.resolve(['Marine Le Pen', 'Le Pen'], 'Marine Le Pen', 'Le Pen')).toBe('lepen')
    expect(r.resolve(['Dominique de Villepin'], 'Dominique de Villepin', 'de Villepin')).toBe('villepin')
    expect(r.resolve(['bonnal'], 'Sébastien Bonnal', 'bonnal')).toBe('bonnal')
    expect(r.others.at(-1)).toEqual({ id: 'bonnal', name: 'Sébastien Bonnal' })
  })

  it('2027etmoi : un sondage vérifié sur notice, scores aux identifiants du simulateur', () => {
    const [poll] = fromEtmoi(etmoi([etmoiPoll()]), resolver())
    expect(poll).toMatchObject({ id: 'ifop-fiducial-20261014', origin: '2027etmoi', institute: 'Ifop-Fiducial' })
    expect(poll!.hypotheses[0]!.scores).toEqual({ melenchon: 16, lepen: 35, philippe: 18, glucksmann: 13.5, bonnal: 1 })
    expect(poll!.verified).toMatch(/notice officielle/)
  })

  it('Mieux Voter : regroupe les hypothèses d’un sondage et garde les duels de candidats simulés', () => {
    const entry = (poll_id: string, tour: string, candidats: [string, string, number][]) => ({
      poll_id,
      institut: 'Harris Interactive',
      commanditaire: 'M6, RTL',
      debut_enquete: '2026-10-05',
      fin_enquete: '2026-10-08',
      echantillon: 2348,
      hypothese: 'H1',
      tour,
      candidats: candidats.map(([candidat, surname, intentions]) => ({ candidat, surname, intentions })),
    })
    const feed: MieuxVoterFeed = {
      polls: [
        entry('20261005_1008_hi_A', '1er Tour', [['Jean-Luc Mélenchon', 'Mélenchon', 18], ['Marine Le Pen', 'Le Pen', 35]]),
        entry('20261005_1008_hi_B', '1er Tour', [['Jean-Luc Mélenchon', 'Mélenchon', 18], ['Marine Le Pen', 'Le Pen', 36]]),
        entry('20261005_1008_hi_2A', '2nd Tour', [['Jean-Luc Mélenchon', 'Mélenchon', 33], ['Marine Le Pen', 'Le Pen', 67]]),
        entry('20261005_1008_hi_2B', '2nd Tour', [['Jordan Bardella', 'Bardella', 60], ['Marine Le Pen', 'Le Pen', 40]]),
      ],
    }
    const { polls, secondRound } = fromMieuxVoter(feed, resolver(), simulated)
    expect(polls).toHaveLength(1)
    expect(polls[0]!.hypotheses.map((h) => h.id)).toEqual(['A', 'B'])
    expect(secondRound).toEqual([expect.objectContaining({ scores: { melenchon: 33, lepen: 67 } })])
  })
})

describe('fusion', () => {
  const manual = current.polls.find((p) => p.id === 'ifop-20261014')!

  it('un sondage vérifié sur notice remplace la saisie manuelle et garde son identifiant', () => {
    const imported = fromEtmoi(etmoi([etmoiPoll()]), resolver())
    const merged = mergePolls([manual], imported, '2026-06-01')
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'ifop-20261014', origin: '2027etmoi' })
  })

  it('réunit les publications d’un même sondage (même institut, même fin de terrain)', () => {
    const imported = fromEtmoi(
      etmoi([
        etmoiPoll({ institut: 'OpinionWay', commanditaire: 'Les Echos', terrain_debut: '2026-10-13' }),
        etmoiPoll({
          institut: 'OpinionWay',
          commanditaire: 'CNews',
          terrain_debut: '2026-10-13',
          source: { titre: 'Notice 2', url: 'https://www.commission-des-sondages.fr/notices/y.pdf' },
        }),
      ]),
      resolver(),
    )
    const [poll] = mergePolls([], imported, '2026-06-01')
    expect(poll!.hypotheses.map((h) => h.id)).toEqual(['H1', 'H2'])
    expect(poll!.sponsor).toBe('Les Echos ; CNews')
    expect(poll!.sources).toHaveLength(2)
  })

  it('une compilation ne remplace pas un sondage vérifié sur notice', () => {
    const verified: Poll = { ...manual, origin: '2027etmoi' }
    const compiled: Poll = { ...manual, id: 'ifop-fiducial-20261014', origin: 'mieuxvoter', sampleSize: 1525 }
    expect(mergePolls([verified], [compiled], '2026-06-01')[0]!.sampleSize).toBe(manual.sampleSize)
  })

  it('n’importe pas les sondages plus anciens que la durée de rétention', () => {
    const old = fromEtmoi(etmoi([etmoiPoll({ terrain_debut: '2026-01-01', terrain_fin: '2026-01-02' })]), resolver())
    expect(mergePolls([], old, '2026-06-01')).toEqual([])
  })
})

describe('syncPolls', () => {
  it('sans nouveau sondage ni changement de fenêtre, les données (et leur date) restent inchangées', () => {
    const { data, report } = syncPolls(current, {}, current.asOf, reference2022, stats)
    expect(report.changed).toBe(false)
    expect(data).toBe(current)
  })

  it('un nouveau sondage fait avancer la date de référence', () => {
    const feed = etmoi([etmoiPoll({ institut: 'Cluster17', terrain_debut: '2026-10-17', terrain_fin: '2026-10-18' })])
    const { data, report } = syncPolls(current, { etmoi: feed }, '2026-10-19', reference2022, stats)
    expect(report).toMatchObject({ changed: true, asOf: '2026-10-19', added: ['cluster17-20261018'] })
    expect(data.asOf).toBe('2026-10-19')
    expect(data.otherCandidates.map((c) => c.id)).toContain('bonnal')
  })

  it('quand la fenêtre glissante écarte des sondages, les données changent même sans nouveau sondage', () => {
    const { report } = syncPolls(current, {}, '2026-11-05', reference2022, stats)
    expect(report).toMatchObject({ changed: true, selectionChanged: true, added: [] })
  })

  it('compare le contenu indépendamment de l’ordre des champs', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
  })
})
