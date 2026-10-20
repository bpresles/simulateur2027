import { frozenData } from '../test/frozenData'
import { HEADER, NOTICE, WIKITEXT, row } from '../test/wikipediaFixture'
import { CandidateResolver } from './feeds'
import { NO_SPONSOR, fromWikipedia, parseFieldwork, parsePercent, sponsorFromNotice } from './wikipedia'

const { polls: current } = frozenData
const resolver = () => new CandidateResolver(current.candidates, current.otherCandidates)
const simulated = new Set(current.candidates.map((c) => c.id))

describe('lecture de la liste des sondages (Wikipedia)', () => {
  it('lit les dates en français, sans année (celle de la section) ou à cheval sur deux mois', () => {
    expect(parseFieldwork('14-16 octobre', 2026)).toEqual({ start: '2026-10-14', end: '2026-10-16' })
    expect(parseFieldwork('24 septembre - 7 octobre', 2026)).toEqual({
      start: '2026-09-24',
      end: '2026-10-07',
    })
    expect(parseFieldwork('1er-3 oct. 2026')).toEqual({ start: '2026-10-01', end: '2026-10-03' })
    expect(parseFieldwork('28 décembre - 2 janvier', 2027)).toEqual({
      start: '2026-12-28',
      end: '2027-01-02',
    })
    expect(parseFieldwork('14-16 octobre')).toBeUndefined()
  })

  it('lit les scores : virgule décimale, {{blanc|…}}, « — » non testé, « <1 » à la moitié du seuil', () => {
    expect(parsePercent("'''{{blanc|32,5}}'''")).toBe(32.5)
    expect(parsePercent(' — ')).toBeNull()
    expect(parsePercent('<1')).toBe(0.5)
    expect(parsePercent('n.d.')).toBeUndefined()
  })

  it('déduit le commanditaire du nom de la notice', () => {
    expect(sponsorFromNotice(`${NOTICE}/10323-pres-iv-yougov-le-huffpost-18-octobre.pdf`)).toBe('Le HuffPost')
    expect(
      sponsorFromNotice(`${NOTICE}/10314-pres-climat-politique-post-primaire-ps-pp-ifop-lci-14-octobre.pdf`),
    ).toBe('LCI')
    expect(sponsorFromNotice(`${NOTICE}/10324-pres-iv-elabe-17-octobre.pdf`)).toBe(NO_SPONSOR)
    expect(sponsorFromNotice('https://www.odoxa.fr/sondage')).toBe(NO_SPONSOR)
  })

  const result = fromWikipedia(WIKITEXT, resolver(), simulated)!

  it('retient la période la plus récente du 1er tour, hors section « Autres » (vote blanc)', () => {
    expect(result.period).toEqual({ label: 'Octobre-décembre 2026', start: '2026-10-01' })
    expect(result.polls.map((p) => `${p.institute} ${p.fieldwork.end}`)).toEqual([
      'YouGov 2026-10-15',
      'OpinionWay 2026-10-14',
      'OpinionWay 2026-10-14',
      'OpinionWay 2026-10-07',
      'Odoxa 2026-10-07',
      'Ifop-Fiducial 2026-10-14',
    ])
  })

  it('une ligne par hypothèse : colonne « Autres », remplaçant dans la colonne PS, colonne double', () => {
    const yougov = result.polls[0]!
    expect(yougov).toMatchObject({
      id: 'yougov-20261015',
      origin: 'wikipedia',
      sponsor: 'Le HuffPost',
      sampleSize: 1094,
    })
    expect(yougov.hypotheses).toEqual([
      {
        id: 'H1',
        label: 'Glucksmann, Lisnard, Bouamrane',
        scores: { melenchon: 20, glucksmann: 15.5, philippe: 20, lepen: 40, lisnard: 4, bouamrane: 0.5 },
      },
      {
        id: 'H2',
        label: 'Hollande',
        scores: { melenchon: 21, hollande: 9, philippe: 25, lepen: 45 },
        replacing: { hollande: 'glucksmann' },
      },
    ])
    // Faure testé à côté de Glucksmann (deux cellules de la colonne double) : pas un remplaçant.
    expect(result.polls.at(-1)!.hypotheses[0]).toEqual({
      id: 'H1',
      scores: { melenchon: 20, glucksmann: 12, faure: 4, philippe: 24, lepen: 40 },
    })
  })

  it('signale les lignes au total aberrant, sans les lignes de couleurs ni d’événement', () => {
    expect(result.skipped).toEqual(['Elabe (11/10/2026) : total de 120 %'])
  })

  it('reprend les duels de 2nd tour de la période entre candidats simulés', () => {
    expect(result.secondRound).toEqual([
      {
        origin: 'wikipedia',
        institute: 'YouGov',
        sponsor: 'Le HuffPost',
        fieldwork: { start: '2026-10-12', end: '2026-10-15' },
        sampleSize: 1094,
        url: `${NOTICE}/10323-pres-iv-yougov-le-huffpost-18-octobre.pdf`,
        scores: { philippe: 48, lepen: 52 },
      },
    ])
  })

  it('une nouvelle période plus récente prend le relais, quel que soit son titre', () => {
    const newer = WIKITEXT.replace(
      '===== Octobre-décembre 2026 =====',
      [
        '===== Novembre 2026 =====',
        '{| class="wikitable"',
        HEADER,
        row('[https://example.org Elabe]', '3-4 novembre', '1 500', ['20', 'colspan=2 |15', '25', '40', '—']),
        '|}',
        '===== Octobre-décembre 2026 =====',
      ].join('\n'),
    )
    const next = fromWikipedia(newer, resolver(), simulated)!
    expect(next.period).toEqual({ label: 'Novembre 2026', start: '2026-11-01' })
    expect(next.polls.map((p) => p.id)).toEqual(['elabe-20261104'])
  })

  it('page méconnaissable : aucun résultat', () => {
    expect(fromWikipedia('== Autre chose ==', resolver(), simulated)).toBeUndefined()
  })
})
