import { frozenData as simulationData } from '../test/frozenData'
import {
  averageHypothesisPolls,
  averagePolls,
  hypothesisMatches,
  latestPerInstitute,
  meanByKey,
  newestFirst,
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
  it('newestFirst trie par date de fin, puis de début, du plus récent au plus ancien', () => {
    const a = poll('A', '2026-10-10', '2026-10-12')
    const b = poll('B', '2026-10-11', '2026-10-12')
    const c = poll('C', '2026-10-01', '2026-10-11')
    expect([c, a, b].sort(newestFirst)).toEqual([b, a, c])
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
  it('rejette une hypothèse où un candidat exclu est remplacé (Hollande à la place de Glucksmann)', () => {
    const filter = { require: ['melenchon', 'philippe'], exclude: ['glucksmann'] }
    const scores = { melenchon: 16, hollande: 9, philippe: 15, lepen: 37 }
    expect(hypothesisMatches({ id: 'H', scores }, filter)).toBe(true)
    expect(hypothesisMatches({ id: 'H', scores, replacing: { hollande: 'glucksmann' } }, filter)).toBe(false)
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

describe('averagePolls, sondages décochés', () => {
  const all = averagePolls(simulationData.polls, set('philippe-seul'))
  const others = all.usage
    .filter((u) => u.status === 'used' && u.poll.id !== 'elabe-20261016')
    .map((u) => u.poll.id)

  it('un seul sondage coché : pas de moyenne entre instituts', () => {
    const res = averagePolls(simulationData.polls, set('philippe-seul'), new Set(others))
    const status = (id: string) => res.usage.find((u) => u.poll.id === id)!
    expect(res.institutesUsed).toBe(1)
    expect(status('elabe-20261016').status).toBe('used')
    expect(status('ifop-20261014').status).toBe('excluded')
    expect(status('ifop-20260929').status).toBe('superseded')
    expect(status('cluster17-20260916').status).toBe('out-of-window')
    expect(status('elabe-20261016').matchedHypotheses).toEqual(['H1', 'H6'])
    const elabe = all.usage.find((u) => u.poll.id === 'elabe-20261016')!
    expect(sum(res.average)).toBeCloseTo(100, 8)
    for (const [id, v] of Object.entries(normalize(elabe.average!)))
      expect(res.average[id]).toBeCloseTo(v, 10)
  })
  it('deux sondages cochés ou plus : moyenne des sondages cochés', () => {
    const kept = ['elabe-20261016', 'ifop-20261014']
    const res = averagePolls(
      simulationData.polls,
      set('philippe-seul'),
      new Set(others.filter((id) => !kept.includes(id))),
    )
    expect(res.institutesUsed).toBe(2)
    const used = res.usage.filter((u) => u.status === 'used')
    expect(used.map((u) => u.poll.id).sort()).toEqual([...kept].sort())
    const expected = normalize(meanByKey(used.map((u) => u.average!)))
    for (const [id, v] of Object.entries(expected)) expect(res.average[id]).toBeCloseTo(v, 10)
  })
  it('ignore la sélection si aucun sondage coché ne teste l’hypothèse', () => {
    const res = averagePolls(
      simulationData.polls,
      set('philippe-seul'),
      new Set([...others, 'elabe-20261016']),
    )
    expect(res.institutesUsed).toBe(all.institutesUsed)
    expect(res.average).toEqual(all.average)
  })
  it('un sondage décoché ne fait pas revenir l’ancien sondage du même institut', () => {
    const scores = { a: 60, b: 40 }
    const poll = (id: string, institute: string, start: string, end: string, s = scores) => ({
      id,
      institute,
      fieldwork: { start, end },
      hypotheses: [{ id: 'H1', scores: s }],
    })
    const older = poll('old', 'A', '2026-10-01', '2026-10-02')
    const newer = poll('new', 'A', '2026-10-10', '2026-10-11', { a: 50, b: 50 })
    const other = poll('other', 'B', '2026-10-05', '2026-10-06', { a: 40, b: 60 })
    const r = averageHypothesisPolls(
      [older, newer, other],
      '2026-10-18',
      21,
      { require: [], exclude: [] },
      new Set(['a', 'b']),
      (p) => p.id !== 'new',
    )
    expect(r.usage.map((u) => u.status)).toEqual(['superseded', 'excluded', 'used'])
    expect(r.average).toEqual({ a: 40, b: 60 })
  })
})
