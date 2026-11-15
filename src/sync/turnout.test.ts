import type { TurnoutMeasure } from '../domain/types'
import n10284 from './__fixtures__/notice-10284-ifop-figaro-20260930.txt?raw'
import n10314 from './__fixtures__/notice-10314-ifop-lci-20261014.txt?raw'
import n10351 from './__fixtures__/notice-10351-ifop-lci-20261103.txt?raw'
import n10352 from './__fixtures__/notice-10352-ifop-lci-20261103.txt?raw'
import n9216 from './__fixtures__/notice-9216-ifop-figaro-20211001.txt?raw'
import n9224 from './__fixtures__/notice-9224-ifop-figaro-20211013.txt?raw'
import rawTurnout from '../data/__fixtures__/turnout-certainty-20261115.json?raw'
import { mergeTurnoutMeasures, parseFieldworkText, parseTurnoutNotice, serializeTurnout } from './turnout'

const BASE = 'https://www.commission-des-sondages.fr/notices/files/notices/'
const URL_10352 = `${BASE}2026/novembre/10352-pres-iv-ifop-lci-3-novembre.pdf`
const URL_10351 = 'http://www.commission-des-sondages.fr/notices/files/notices/2026/novembre/10351-pres-iv-ifop-lci-3-novembre.pdf'

describe('parseTurnoutNotice : notices de la Commission des sondages', () => {
  it('Ifop pour LCI, 27–29/10/2026 : 96,7 puis 78,0 (redressé), à J−171', () => {
    const m = parseTurnoutNotice(n10352, { url: URL_10352 })!
    expect(m).toMatchObject({
      id: 'ifop-2026-10-29',
      cycle: 2027,
      fieldwork: { start: '2026-10-27', end: '2026-10-29' },
      envisage: 96.7,
      certain: 78,
    })
    expect(m.final).toBeUndefined()
    expect(m.source).toEqual({
      label: 'Ifop-Fiducial pour LCI, 27–29/10/2026 (notice de la Commission des sondages)',
      url: URL_10352,
    })
    expect((m.envisage! * m.certain!) / 100).toBeCloseTo(75.43, 2)
  })

  it('Ifop pour LCI et Sud Radio, 12–14/10/2026 : 95,8 et 77,3', () => {
    const m = parseTurnoutNotice(n10314, { url: `${BASE}2026/octobre/10314.pdf` })!
    expect(m).toMatchObject({ cycle: 2027, fieldwork: { start: '2026-10-12', end: '2026-10-14' }, envisage: 95.8, certain: 77.3 })
    expect(m.source.label).toBe('Ifop-Fiducial pour LCI et Sud Radio, 12–14/10/2026 (notice de la Commission des sondages)')
  })

  it('Ifop, 25–29/09/2026 : 95,9 et 77,7, commanditaires sur deux lignes', () => {
    const m = parseTurnoutNotice(n10284, { url: `${BASE}2026/septembre/10284.pdf` })!
    expect(m).toMatchObject({ cycle: 2027, fieldwork: { start: '2026-09-25', end: '2026-09-29' }, envisage: 95.9, certain: 77.7 })
    expect(m.source.label).toContain('pour LCI, le Figaro et Sud Radio, 25–29/09/2026')
  })

  it('Ifop pour Le Figaro, 09–13/10/2021 : 94,6 et 69,4, scrutin 2022', () => {
    const m = parseTurnoutNotice(n9224, { url: `${BASE}2021/octobre/9224-p-ifop-le-figaro.pdf` })!
    expect(m).toMatchObject({ id: 'ifop-2021-10-13', cycle: 2022, fieldwork: { start: '2021-10-09', end: '2021-10-13' }, envisage: 94.6, certain: 69.4 })
  })

  it('vague 4 de 2021, terrain à cheval sur deux mois : 29/09–01/10/2021, 94,5 et 71,4', () => {
    const m = parseTurnoutNotice(n9216, { url: `${BASE}2021/octobre/9216-p-ifop-le-figaro-v4.pdf` })!
    expect(m).toMatchObject({ cycle: 2022, fieldwork: { start: '2021-09-29', end: '2021-10-01' }, envisage: 94.5, certain: 71.4 })
    expect(m.source.label).toContain('29/09–01/10/2021')
  })

  it('renvoie null pour une question sur un autre scrutin ou sans la question', () => {
    const municipales = n10352.replace(/prochaine élection présidentielle/g, 'prochaines élections municipales')
    expect(parseTurnoutNotice(municipales, { url: URL_10352 })).toBeNull()
    expect(parseTurnoutNotice('Notice technique\nEtude réalisée par Ifop pour LCI\nen ligne du 1 au 2 mars 2026.', { url: URL_10352 })).toBeNull()
  })

  it('renvoie null pour des valeurs invraisemblables ou une date illisible', () => {
    expect(parseTurnoutNotice(n10352.replace('96,2 96,7', '96,2 36,7'), { url: URL_10352 })).toBeNull()
    expect(parseTurnoutNotice(n10352.replace('78,0', '18,0'), { url: URL_10352 })).toBeNull()
    expect(parseTurnoutNotice(n10352.replace('en ligne du 27 au 29 octobre 2026', 'en ligne cet automne'), { url: URL_10352 })).toBeNull()
  })
})

describe('parseFieldworkText', () => {
  it('lit les quatre formes de dates de terrain', () => {
    expect(parseFieldworkText('en ligne du 27 au 29 octobre 2026')).toEqual({ start: '2026-10-27', end: '2026-10-29' })
    expect(parseFieldworkText('du 30 septembre au 2 octobre 2026')).toEqual({ start: '2026-09-30', end: '2026-10-02' })
    expect(parseFieldworkText('du 30 décembre 2026 au 2 janvier 2027')).toEqual({ start: '2026-12-30', end: '2027-01-02' })
    expect(parseFieldworkText('les 12 et 13 novembre 2026')).toEqual({ start: '2026-11-12', end: '2026-11-13' })
    expect(parseFieldworkText('le 14 novembre 2026')).toEqual({ start: '2026-11-14', end: '2026-11-14' })
    expect(parseFieldworkText('du 1er au 3 octobre 2026')).toEqual({ start: '2026-10-01', end: '2026-10-03' })
    expect(parseFieldworkText('du 4 (18h00) au 6 décembre 2021')).toEqual({ start: '2021-12-04', end: '2021-12-06' })
    expect(parseFieldworkText('du 25 février au 1er mars', 2022)).toEqual({ start: '2022-02-25', end: '2022-03-01' })
    expect(parseFieldworkText('du 30 décembre au 2 janvier', 2022)).toEqual({ start: '2021-12-30', end: '2022-01-02' })
    expect(parseFieldworkText('du 25 février au 1er mars')).toBeUndefined()
    expect(parseFieldworkText('en septembre')).toBeUndefined()
  })
})

describe('mergeTurnoutMeasures', () => {
  const existing: TurnoutMeasure[] = [
    {
      id: 'ifop-2026-10',
      cycle: 2027,
      fieldwork: { start: '2026-10-12', end: '2026-10-14' },
      envisage: 95.8,
      certain: 77.3,
      source: { label: 'saisie manuelle', url: 'https://exemple.fr/a.pdf' },
    },
    {
      id: 'ifop-2021-10',
      cycle: 2022,
      fieldwork: { start: '2021-10-09', end: '2021-10-13' },
      envisage: 94.6,
      certain: 69.4,
      source: { label: 'saisie manuelle', url: 'https://exemple.fr/b.pdf' },
    },
  ]

  it('ajoute une mesure nouvelle et trie par scrutin puis par date', () => {
    const m = parseTurnoutNotice(n10352, { url: URL_10352 })!
    const { measures, added } = mergeTurnoutMeasures(existing, [m])
    expect(added).toEqual([m])
    expect(measures.map((x) => x.id)).toEqual(['ifop-2021-10', 'ifop-2026-10', 'ifop-2026-10-29'])
  })

  it('ne modifie ni ne retire une mesure existante, même si la mesure trouvée diffère', () => {
    const same = { ...parseTurnoutNotice(n10314, { url: 'https://exemple.fr/c.pdf' })!, certain: 70 }
    const { measures, added } = mergeTurnoutMeasures(existing, [same])
    expect(added).toEqual([])
    expect(measures).toHaveLength(2)
    expect(measures.find((x) => x.id === 'ifop-2026-10')).toEqual(existing[0])
  })

  it('écarte le doublon par l’adresse même si la date diffère', () => {
    const moved = { ...parseTurnoutNotice(n10352, { url: 'https://exemple.fr/a.pdf' })! }
    expect(mergeTurnoutMeasures(existing, [moved]).added).toEqual([])
  })

  it('dédoublonne les deux versions de la même enquête (notices 10351 et 10352)', () => {
    const a = parseTurnoutNotice(n10352, { url: URL_10352 })!
    const b = parseTurnoutNotice(n10351, { url: URL_10351 })!
    expect(b.fieldwork).toEqual(a.fieldwork)
    expect([b.envisage, b.certain]).toEqual([a.envisage, a.certain])
    const first = mergeTurnoutMeasures(existing, [a])
    const second = mergeTurnoutMeasures(first.measures, [b])
    expect(second.added).toEqual([])
    expect(second.measures).toHaveLength(3)
  })
})

describe('serializeTurnout', () => {
  it('redonne à l’identique le fichier saisi à la main (dates sur une ligne, 2 espaces, fin de ligne)', () => {
    expect(serializeTurnout(JSON.parse(rawTurnout))).toBe(rawTurnout)
  })
})
