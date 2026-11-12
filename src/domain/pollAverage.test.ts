import { frozenData as simulationData } from '../test/frozenData'
import {
  averageHypothesisPolls,
  averagePolls,
  hypothesisMatches,
  latestPerInstitute,
  meanByKey,
  newestFirst,
  imputeShares,
  normalize,
  observedDonors,
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

describe('imputeShares : un candidat ajouté prend sa part aux candidats vers lesquels vont ses électeurs', () => {
  it('prélève selon les poids des donneurs en lice ; le total reste 100', () => {
    const donors = { m: [
      { id: 'a', weight: 0.6 },
      { id: 'b', weight: 0.2 },
      { id: 'absent', weight: 0.2 },
    ] }
    expect(imputeShares({ a: 30, b: 20, c: 50 }, { m: 4 }, donors)).toEqual({ a: 27, b: 19, c: 50, m: 4 })
  })
  it('sans donneur en lice : prélève sur tous, au prorata de leur score', () => {
    expect(imputeShares({ a: 50, c: 50 }, { m: 4 }, { m: [{ id: 'x', weight: 1 }] })).toEqual({ a: 48, c: 48, m: 4 })
  })
  it('un donneur ne cède pas plus que son score : l’excédent est pris aux autres au prorata', () => {
    const r = imputeShares({ a: 2, b: 38, c: 60 }, { m: 10 }, { m: [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }] })
    // a cède 2 au lieu de 5 ; les 3 points restants sont pris à b (33) et c (60) au prorata.
    expect(r.a).toBe(0)
    expect(r.m).toBe(10)
    expect(r.b).toBeCloseTo(33 * (1 - 3 / 93), 10)
    expect(r.c).toBeCloseTo(60 * (1 - 3 / 93), 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })
  it('plusieurs candidats ajoutés : prélèvements cumulés, chacun garde sa part', () => {
    const r = imputeShares({ a: 60, b: 40 }, { m: 4, n: 6 }, { m: [{ id: 'a', weight: 1 }], n: [{ id: 'b', weight: 1 }] })
    expect(r).toEqual({ a: 56, b: 34, m: 4, n: 6 })
  })
})

describe('petits candidats : imputés dans les hypothèses qui ne les testent pas', () => {
  const poll = (id: string, institute: string, hypotheses: { id: string; scores: Record<string, number> }[]) => ({
    id,
    institute,
    fieldwork: { start: '2026-10-10', end: '2026-10-11' },
    hypotheses,
  })
  const pA = poll('p1', 'A', [
    { id: 'H1', scores: { a: 60, b: 40 } },
    { id: 'H2', scores: { a: 50, b: 40, t: 10 } },
  ])
  const pB = poll('p2', 'B', [{ id: 'H1', scores: { a: 50, b: 50 } }])
  const pC = poll('p3', 'C', [{ id: 'H1', scores: { a: 40, b: 45, t: 15 } }])
  const keep = new Set(['a', 'b', 't', 'u'])
  // Les électeurs de t et de u vont à a en leur absence.
  const donors = { t: [{ id: 'a', weight: 1 }], u: [{ id: 'a', weight: 1 }] }
  const average = (polls: ReturnType<typeof poll>[], exclude: string[] = []) =>
    averageHypothesisPolls(polls, '2026-10-18', 21, { require: ['a', 'b'], exclude }, keep, undefined, [], donors)

  it('aucune hypothèse retenue ne le teste : absent', () => {
    expect(average([pA, pB]).average).not.toHaveProperty('u')
  })
  it('un seul sondage le teste : score de ce sondage, total de 100', () => {
    const r = average([pA, pB])
    expect(r.average.t).toBeCloseTo(10, 10)
    expect(sum(r.average)).toBeCloseTo(100, 10)
    // A, H1 (sans t) : t vaut 10, sa part dans l'autre hypothèse du même sondage, prise à a → 50 / 40 / 10.
    expect(r.usage[0]!.average).toEqual({ a: 50, b: 40, t: 10 })
    // B (sans t) : t vaut 10, son score moyen, pris à a → 40 / 50 / 10.
    expect(r.usage[1]!.average).toEqual({ a: 40, b: 50, t: 10 })
    expect(r.average.a).toBeCloseTo(45, 10)
    expect(r.average.b).toBeCloseTo(45, 10)
  })
  it('deux sondages ou plus le testent : moyenne de leurs scores', () => {
    const r = average([pA, pB, pC])
    expect(r.average.t).toBeCloseTo(12.5, 10)
    expect(sum(r.average)).toBeCloseTo(100, 10)
    // B ne le teste pas : 12,5 pris à a.
    expect(r.usage[1]!.average).toEqual({ a: 37.5, b: 50, t: 12.5 })
  })
  it('un petit candidat exclu du scénario (rallié) n’est pas imputé', () => {
    const r = average([pA, pB], ['t'])
    expect(r.usage[0]!.matchedHypotheses).toEqual(['H1'])
    expect(r.average).toEqual({ a: 55, b: 45 })
  })
  it('un candidat `optional` absent d’une hypothèse y compte pour 0 (scrutins passés)', () => {
    const r = averageHypothesisPolls([pA, pB], '2026-10-18', 21, { require: ['a', 'b'], exclude: [] }, keep, undefined, ['t', 'u'])
    // A : (0 + 10) / 2 = 5 ; B : 0 → moyenne 2,5 ; u, à 0 partout, n'est pas présenté.
    expect(r.average.t).toBeCloseTo(2.5, 10)
    expect(r.average).not.toHaveProperty('u')
    expect(sum(r.average)).toBeCloseTo(100, 10)
  })
})

describe('donneurs observés : à qui un petit candidat prend ses points, lu dans les sondages', () => {
  const poll = (id: string, institute: string, hypotheses: { id: string; scores: Record<string, number> }[]) => ({
    id,
    institute,
    fieldwork: { start: '2026-10-10', end: '2026-10-11' },
    hypotheses,
  })
  // Sans x : a 50, b 30, c 20 ; avec x (10) : a et c perdent 5 points chacun, b rien.
  const p1 = poll('p1', 'A', [
    { id: 'H1', scores: { a: 50, b: 30, c: 20 } },
    { id: 'H2', scores: { a: 45, b: 30, c: 15, x: 10 } },
  ])
  const all = () => true

  it('pertes de chaque candidat entre l’hypothèse sans lui et celle avec lui, en parts de leur total', () => {
    expect(observedDonors([p1], ['x'], all)).toEqual({
      x: {
        parts: [
          { id: 'a', weight: 0.5 },
          { id: 'c', weight: 0.5 },
        ],
        pairs: [{ institute: 'A', without: 'H1', with: 'H2' }],
      },
    })
  })
  it('l’hypothèse avec lui doit contenir tous les candidats de l’autre', () => {
    const swap = poll('p1', 'A', [
      { id: 'H1', scores: { a: 50, b: 30, y: 20 } },
      { id: 'H2', scores: { a: 45, b: 30, c: 15, x: 10 } },
    ])
    expect(observedDonors([swap], ['x'], all)).toEqual({})
  })
  it('seuls les candidats donneurs autorisés comptent', () => {
    expect(observedDonors([p1], ['x'], (id) => id !== 'c').x!.parts).toEqual([{ id: 'a', weight: 1 }])
  })
  it('candidats ajoutés ensemble : mêmes parts', () => {
    const group = poll('p1', 'A', [
      { id: 'H1', scores: { a: 60, b: 40 } },
      { id: 'H2', scores: { a: 48, b: 37, x: 10, y: 5 } },
    ])
    const r = observedDonors([group], ['x', 'y'], all)
    expect(r.x!.parts).toEqual([
      { id: 'a', weight: 0.8 },
      { id: 'b', weight: 0.2 },
    ])
    expect(r.y).toEqual(r.x)
  })
  it('plusieurs paires : moyenne de leurs parts', () => {
    const p2 = poll('p2', 'B', [
      { id: 'H1', scores: { a: 50, b: 50 } },
      { id: 'H2', scores: { a: 40, b: 50, x: 10 } },
    ])
    const r = observedDonors([p1, p2], ['x'], all).x!
    expect(r.parts).toEqual([
      { id: 'a', weight: 0.75 },
      { id: 'c', weight: 0.25 },
    ])
    expect(r.pairs).toHaveLength(2)
  })

  describe('imputation', () => {
    const p2 = poll('p2', 'B', [{ id: 'H1', scores: { a: 40, b: 40, c: 20 } }])
    const keep = new Set(['a', 'b', 'c', 'x', 'y'])
    // Répartition des réglages : tout pris à b.
    const fallback = { x: [{ id: 'b', weight: 1 }], y: [{ id: 'b', weight: 1 }] }
    const average = (polls: ReturnType<typeof poll>[]) =>
      averageHypothesisPolls(polls, '2026-10-18', 21, { require: ['a'], exclude: [] }, keep, undefined, [], fallback)

    it('les points imputés suivent les donneurs observés, pas la répartition des réglages', () => {
      const r = average([p1, p2])
      // A, H1 (sans x) : x vaut 10, pris à a et c pour moitié, comme dans H2.
      expect(r.usage[0]!.average).toEqual({ a: 45, b: 30, c: 15, x: 10 })
      expect(r.usage[1]!.average).toEqual({ a: 35, b: 40, c: 15, x: 10 })
      expect(r.average).toEqual({ a: 40, b: 35, c: 15, x: 10 })
      expect(r.donors.x!.pairs).toEqual([{ institute: 'A', without: 'H1', with: 'H2' }])
    })
    it('faute de paire, répartition des réglages', () => {
      const only = poll('p1', 'A', [{ id: 'H2', scores: { a: 45, b: 30, c: 15, x: 10 } }])
      const r = average([only, p2])
      expect(r.usage[1]!.average).toEqual({ a: 40, b: 30, c: 20, x: 10 })
      expect(r.donors.x).toEqual({ parts: fallback.x, pairs: [] })
    })
    it('un petit candidat n’est pas donneur d’un autre : chacun garde la moyenne des sondages qui le testent', () => {
      const p3 = poll('p3', 'C', [
        { id: 'H1', scores: { a: 50, b: 20, c: 10, y: 20 } },
        { id: 'H2', scores: { a: 45, b: 20, c: 10, y: 15, x: 10 } },
      ])
      const r = average([p3, p2])
      expect(r.donors.x!.parts).toEqual([{ id: 'a', weight: 1 }])
      expect(r.average.x).toBeCloseTo(10, 10)
      expect(r.average.y).toBeCloseTo(17.5, 10)
      expect(sum(r.average)).toBeCloseTo(100, 10)
    })
  })
})
