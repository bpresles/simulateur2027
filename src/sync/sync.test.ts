import type { PollsData } from '../domain/types'
import { frozenData } from '../test/frozenData'
import { WIKITEXT } from '../test/wikipediaFixture'
import { CandidateResolver, canonicalInstitute } from './feeds'
import { stableStringify, syncPolls } from './sync'

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

  it('une seconde synchronisation sans changement de la page ne modifie rien (ni la date)', () => {
    const again = syncPolls(data, WIKITEXT, '2026-10-21')!
    expect(again.report.changed).toBe(false)
    expect(again.data).toBe(data)
  })

  it('une page méconnaissable ne produit rien : les données restent inchangées', () => {
    expect(syncPolls(current as PollsData, '== Page vide ==', '2026-10-20')).toBeUndefined()
  })

  it('compare le contenu indépendamment de l’ordre des champs', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
  })
})
