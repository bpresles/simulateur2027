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

  it('une nouvelle période plus récente prend le relais et conserve par pont glissant les sondages ≤ 21 jours de la section précédente', () => {
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
    expect(next.period.label).toBe('Novembre 2026')
    // 2026-11-04 − 21 j = 2026-10-14 : YouGov (15/10), OpinionWay (14/10) et Ifop (14/10) sont reliés, Odoxa (07/10) écarté.
    expect(next.period.start).toBe('2026-10-14')
    expect(next.polls.map((p) => p.id)).toEqual([
      'elabe-20261104',
      'yougov-20261015',
      'opinionway-20261014',
      'opinionway-20261014',
      'ifop-fiducial-20261014',
    ])
    // Au-delà de 21 jours, la période précédente n'est plus reliée.
    const muchLater = WIKITEXT.replace(
      '===== Octobre-décembre 2026 =====',
      [
        '===== Novembre 2026 =====',
        '{| class="wikitable"',
        HEADER,
        row('[https://example.org Elabe]', '15-16 novembre', '1 500', ['20', 'colspan=2 |15', '25', '40', '—']),
        '|}',
        '===== Octobre-décembre 2026 =====',
      ].join('\n'),
    )
    const cleanNext = fromWikipedia(muchLater, resolver(), simulated)!
    expect(cleanNext.period).toEqual({ label: 'Novembre 2026', start: '2026-11-01' })
    expect(cleanNext.polls.map((p) => p.id)).toEqual(['elabe-20261116'])
  })

  it('traverse proprement le passage d’année (décembre 2026 → janvier 2027) sans tomber à un seul institut', () => {
    const jan2027 = `
== Sondages concernant le premier tour ==
=== Année 2027 ===
==== Janvier 2027 ====
{| class="wikitable"
${HEADER}
${row('[https://example.org Elabe]', '2-3 janvier', '1 500', ['20', 'colspan=2 |15', '25', '40', '—'])}
|}
=== Année 2026 ===
==== Octobre-décembre 2026 ====
{| class="wikitable"
${HEADER}
${row('[https://example.org Ifop]', '20-22 décembre', '1 400', ['19', 'colspan=2 |16', '25', '40', '—'])}
${row('[https://example.org Odoxa]', '1-2 décembre', '1 000', ['18', 'colspan=2 |17', '25', '40', '—'])}
|}
`
    const parsed = fromWikipedia(jan2027, resolver(), simulated)!
    expect(parsed.period).toEqual({ label: 'Janvier 2027', start: '2026-12-22' })
    expect(parsed.polls.map((p) => p.id)).toEqual(['elabe-20270103', 'ifop-fiducial-20261222'])
  })

  it('reconnaît une section « Depuis la publication de la liste officielle » (mars 2027) et bascule dès ≥ 3 instituts', () => {
    const preOfficial = `
=== Année 2027 ===
==== Mars 2027 ====
{| class="wikitable"
${HEADER}
${row('[https://example.org Odoxa]', '10-12 mars', '1 000', ['18', 'colspan=2 |17', '25', '40', '—'])}
|}
`
    const oneOfficial = `
== Sondages concernant le premier tour ==
=== Depuis la publication de la liste officielle ===
{| class="wikitable"
${HEADER}
${row('[https://example.org Elabe]', '20-21 mars', '1 500', ['20', 'colspan=2 |15', '25', '40', '—'])}
|}
${preOfficial}
`
    const partial = fromWikipedia(oneOfficial, resolver(), simulated)!
    expect(partial.period.label).toBe('Depuis la publication de la liste officielle')
    expect(partial.polls.map((p) => p.id)).toEqual(['elabe-20270321', 'odoxa-20270312'])

    const threeOfficial = `
== Sondages concernant le premier tour ==
=== Depuis la publication de la liste officielle ===
{| class="wikitable"
${HEADER}
${row('[https://example.org Elabe]', '20-21 mars', '1 500', ['20', 'colspan=2 |15', '25', '40', '—'])}
${row('[https://example.org Ifop]', '21-22 mars', '1 500', ['21', 'colspan=2 |14', '25', '40', '—'])}
${row('[https://example.org OpinionWay]', '21-22 mars', '1 200', ['19', 'colspan=2 |16', '25', '40', '—'])}
|}
${preOfficial}
`
    const full = fromWikipedia(threeOfficial, resolver(), simulated)!
    expect(full.officialList).toBe(true)
    expect(full.polls.map((p) => p.id)).toEqual(['elabe-20270321', 'ifop-fiducial-20270322', 'opinionway-20270322'])
    expect(full.history.length).toBeGreaterThanOrEqual(3)
    expect(partial.officialList).toBe(false)
  })

  it('extrait l’historique en utilisant un pôle RN générique (`rnIds`, ex. Bardella à la place de Le Pen)', () => {
    const withBardella = WIKITEXT.replaceAll('[[Marine Le Pen|Le Pen]]', '[[Jordan Bardella|Bardella]]')
    const res = new CandidateResolver(
      [...current.candidates, { ...current.candidates.find((c) => c.isRN)!, id: 'bardella', name: 'Jordan Bardella', shortName: 'Bardella' }],
      current.otherCandidates,
    )
    const simWithBardella = new Set([...simulated, 'bardella'])
    const parsed = fromWikipedia(withBardella, res, simWithBardella, 21, new Set(['bardella']))!
    expect(parsed.history.length).toBeGreaterThan(0)
    expect(parsed.history.every((h) => 'bardella' in h.scores && 'melenchon' in h.scores)).toBe(true)
  })

  it('page méconnaissable : aucun résultat', () => {
    expect(fromWikipedia('== Autre chose ==', resolver(), simulated)).toBeUndefined()
  })

  it('reconnaît la variante typographique « OpinonWay » comme OpinionWay', () => {
    const withTypo = `
== Sondages concernant le premier tour ==
=== Année 2026 ===
==== Octobre-décembre 2026 ====
{| class="wikitable"
${HEADER}
${row('[https://example.org OpinonWay]', '25-26 novembre', '1 000', ['20', 'colspan=2 |15', '25', '40', '—'])}
|}
`
    const parsed = fromWikipedia(withTypo, resolver(), simulated)!
    expect(parsed.skipped).toEqual([])
    expect(parsed.polls.map((p) => p.id)).toEqual(['opinionway-20261126'])
    expect(parsed.polls[0]?.institute).toBe('OpinionWay')
  })
})
