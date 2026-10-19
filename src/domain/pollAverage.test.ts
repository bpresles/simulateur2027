import { frozenData as simulationData } from '../test/frozenData'
import {
  averageHypothesisPolls,
  averagePolls,
  hypothesisMatches,
  latestPerInstitute,
  meanByKey,
  mostRecent,
  normalize,
} from './pollAverage'

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0)
const set = (id: string) => simulationData.polls.hypothesisSets.find((s) => s.id === id)!

describe('normalize / meanByKey', () => {
  it('ramène le total à 100', () => {
    expect(sum(normalize({ a: 30, b: 30, c: 41 }))).toBeCloseTo(100, 10)
  })
  it('ne moyenne une clé que là où elle est présente', () => {
    expect(meanByKey([{ a: 10, b: 4 }, { a: 20 }])).toEqual({ a: 15, b: 4 })
  })
})

describe('latestPerInstitute', () => {
  const poll = (institute: string, start: string, end: string) => ({ institute, fieldwork: { start, end } })
  it('garde le sondage le plus récent de chaque institut dans la fenêtre', () => {
    const old = poll('A', '2026-10-01', '2026-10-02')
    const recent = poll('A', '2026-10-10', '2026-10-12')
    const outside = poll('B', '2026-09-01', '2026-09-02')
    const res = latestPerInstitute([old, recent, outside], '2026-10-18', 21)
    expect(res.latest).toEqual([recent])
    expect(res.superseded).toEqual([old])
    expect(res.outOfWindow).toEqual([outside])
  })
  it('mostRecent départage par date de fin, puis de début', () => {
    const a = poll('A', '2026-10-10', '2026-10-12')
    const b = poll('B', '2026-10-11', '2026-10-12')
    expect(mostRecent([a, b, poll('C', '2026-10-01', '2026-10-11')])).toBe(b)
    expect(mostRecent([])).toBeUndefined()
  })
})

describe('hypothesisMatches', () => {
  const h = { id: 'H', scores: { philippe: 15, melenchon: 15, glucksmann: 12, lepen: 35, lisnard: 4 } }
  it('rejette une hypothèse contenant un candidat exclu', () => {
    expect(hypothesisMatches(h, set('philippe-seul'))).toBe(false)
  })
  it('accepte une hypothèse conforme', () => {
    const { lisnard: _, ...scores } = h.scores
    expect(hypothesisMatches({ id: 'H', scores }, set('philippe-seul'))).toBe(true)
  })
})

describe('averagePolls (données réelles au 18/10/2026)', () => {
  const res = averagePolls(simulationData.polls, set('philippe-seul'))
  const status = (id: string) => res.usage.find((u) => u.poll.id === id)!

  it('retient le dernier sondage de 6 instituts', () => {
    expect(res.institutesUsed).toBe(6)
    expect(status('ifop-20260929').status).toBe('superseded')
    expect(status('cluster17-20260916').status).toBe('out-of-window')
  })
  it('sélectionne les hypothèses conformes (Elabe : H1 et H6, H3 contient Lisnard)', () => {
    expect(status('elabe-20261016').matchedHypotheses).toEqual(['H1', 'H6'])
    expect(status('ifop-20261014').matchedHypotheses).toEqual(['H3'])
  })
  it('produit une moyenne normalisée sans candidat hors liste', () => {
    expect(sum(res.average)).toBeCloseTo(100, 8)
    expect(res.average).not.toHaveProperty('villepin')
    expect(res.average).not.toHaveProperty('attal')
  })
  it('exclut Odoxa de l’hypothèse avec Attal (aucune hypothèse conforme)', () => {
    const withAttal = averagePolls(simulationData.polls, set('philippe-attal'))
    expect(withAttal.institutesUsed).toBe(5)
    expect(withAttal.usage.find((u) => u.poll.id === 'odoxa-20261007')!.status).toBe('no-matching-hypothesis')
  })
})

describe('averagePolls, mode « dernier sondage uniquement »', () => {
  const res = averagePolls(simulationData.polls, set('philippe-seul'), 'latest')
  const status = (id: string) => res.usage.find((u) => u.poll.id === id)!

  it('retient le seul sondage le plus récent, tous instituts confondus', () => {
    expect(res.institutesUsed).toBe(1)
    expect(status('elabe-20261016').status).toBe('used')
    expect(status('ifop-20261014').status).toBe('not-latest')
    expect(status('ifop-20260929').status).toBe('not-latest')
    expect(status('cluster17-20260916').status).toBe('out-of-window')
  })
  it('prend la moyenne des hypothèses conformes de ce sondage, normalisée', () => {
    const elabe = averagePolls(simulationData.polls, set('philippe-seul')).usage.find(
      (u) => u.poll.id === 'elabe-20261016',
    )!
    expect(status('elabe-20261016').matchedHypotheses).toEqual(['H1', 'H6'])
    expect(sum(res.average)).toBeCloseTo(100, 8)
    for (const [id, v] of Object.entries(normalize(elabe.average!)))
      expect(res.average[id]).toBeCloseTo(v, 10)
  })
  it('ignore un sondage plus récent sans hypothèse conforme', () => {
    const scores = { a: 60, b: 40 }
    const older = {
      id: 'old',
      institute: 'A',
      fieldwork: { start: '2026-10-01', end: '2026-10-02' },
      hypotheses: [{ id: 'H1', scores }],
    }
    const newer = {
      id: 'new',
      institute: 'B',
      fieldwork: { start: '2026-10-10', end: '2026-10-11' },
      hypotheses: [{ id: 'H1', scores: { ...scores, c: 5 } }],
    }
    const r = averageHypothesisPolls(
      [older, newer],
      '2026-10-18',
      21,
      { require: [], exclude: ['c'] },
      new Set(['a', 'b']),
      'latest',
    )
    expect(r.usage.map((u) => u.status)).toEqual(['used', 'no-matching-hypothesis'])
    expect(r.average).toEqual({ a: 60, b: 40 })
  })
})
