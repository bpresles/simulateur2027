import { frozenData as simulationData } from '../test/frozenData'
import {
  averageHypothesisPolls,
  averagePolls,
  hypothesisMatches,
  imputeShares,
  latestPerInstitute,
  meanByKey,
  newestFirst,
  normalize,
  observedDonors,
  POLL_HALF_LIFE_DAYS,
  pollWeight,
  SAMPLE_SIZE_CAP,
  weightedMeanByKey,
} from './pollAverage'

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0)
const set = (id: string) => simulationData.polls.hypothesisSets.find((s) => s.id === id)!

describe('normalize / meanByKey / weightedMeanByKey / pollWeight', () => {
  it('ramène le total à 100', () => {
    expect(sum(normalize({ a: 30, b: 30, c: 41 }))).toBeCloseTo(100, 10)
  })
  it('ne moyenne une clé que là où elle est présente', () => {
    expect(meanByKey([{ a: 10, b: 4 }, { a: 20 }])).toEqual({ a: 15, b: 4 })
    expect(weightedMeanByKey([{ scores: { a: 10 }, weight: 1 }, { scores: { a: 30 }, weight: 3 }])).toEqual({ a: 25 })
  })
  it('pollWeight applique une demi-vie de 14 jours et un plafond à 2 000 personnes', () => {
    const p0 = pollWeight({ fieldwork: { start: '2026-11-20', end: '2026-11-20' }, sampleSize: 1000 }, '2026-11-20')
    const p14 = pollWeight({ fieldwork: { start: '2026-11-06', end: '2026-11-06' }, sampleSize: 1000 }, '2026-11-20')
    expect(POLL_HALF_LIFE_DAYS).toBe(14)
    expect(p0).toBeCloseTo(1, 10)
    expect(p14).toBeCloseTo(0.5, 10)
    const pCap = pollWeight({ fieldwork: { start: '2026-11-20', end: '2026-11-20' }, sampleSize: SAMPLE_SIZE_CAP }, '2026-11-20')
    const pHuge = pollWeight({ fieldwork: { start: '2026-11-20', end: '2026-11-20' }, sampleSize: 12005 }, '2026-11-20')
    expect(pHuge).toBeCloseTo(pCap, 10)
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

describe('averagePolls (données figées au 18/10/2026)', () => {
  const res = averagePolls(simulationData.polls, set('philippe-seul'))
  const status = (id: string) => res.usage.find((u) => u.poll.id === id)!

  it('retient le dernier sondage de 6 instituts avec poids totalisant 100 %', () => {
    expect(res.institutesUsed).toBe(6)
    expect(status('ifop-20260929').status).toBe('superseded')
    expect(status('cluster17-20260916').status).toBe('out-of-window')
    const used = res.usage.filter((u) => u.status === 'used')
    expect(used.reduce((s, u) => s + u.weightShare, 0)).toBeCloseTo(100, 8)
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
  it('projette Odoxa sur l’hypothèse avec Attal quand offerProjection est actif, et l’exclut sinon', () => {
    const projected = averagePolls(simulationData.polls, set('philippe-attal'), new Set(), {}, { offerProjection: true })
    expect(projected.institutesUsed).toBe(6)
    const odoxaProj = projected.usage.find((u) => u.poll.id === 'odoxa-20261007')!
    expect(odoxaProj.status).toBe('used')
    expect(odoxaProj.projected).toBe(true)
    expect(odoxaProj.projectionSteps).toEqual(['+Attal'])

    const raw = averagePolls(simulationData.polls, set('philippe-attal'), new Set(), {}, { offerProjection: false })
    expect(raw.institutesUsed).toBe(5)
    expect(raw.usage.find((u) => u.poll.id === 'odoxa-20261007')!.status).toBe('no-matching-hypothesis')
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
    expect(status('elabe-20261016').weightShare).toBeCloseTo(100, 8)
    expect(status('ifop-20261014').status).toBe('excluded')
    expect(status('ifop-20260929').status).toBe('superseded')
    expect(status('cluster17-20260916').status).toBe('out-of-window')
    const elabe = all.usage.find((u) => u.poll.id === 'elabe-20261016')!
    expect(sum(res.average)).toBeCloseTo(100, 8)
    for (const [id, v] of Object.entries(normalize(elabe.average!))) expect(res.average[id]).toBeCloseTo(v, 10)
  })
  it('deux sondages cochés ou plus : moyenne pondérée des sondages cochés', () => {
    const kept = ['elabe-20261016', 'ifop-20261014']
    const res = averagePolls(
      simulationData.polls,
      set('philippe-seul'),
      new Set(others.filter((id) => !kept.includes(id))),
    )
    expect(res.institutesUsed).toBe(2)
    const used = res.usage.filter((u) => u.status === 'used')
    expect(used.map((u) => u.poll.id).sort()).toEqual([...kept].sort())
    const expected = normalize(weightedMeanByKey(used.map((u) => ({ scores: u.average!, weight: u.weight }))))
    for (const [id, v] of Object.entries(expected)) expect(res.average[id]).toBeCloseTo(v, 10)
  })
  it('ignore la sélection si aucun sondage coché ne teste l’hypothèse', () => {
    const res = averagePolls(simulationData.polls, set('philippe-seul'), new Set([...others, 'elabe-20261016']))
    expect(res.institutesUsed).toBe(all.institutesUsed)
    expect(res.average).toEqual(all.average)
  })
  it('un sondage décoché ne fait pas revenir l’ancien sondage du même institut', () => {
    const scores = { a: 60, b: 40 }
    const poll = (id: string, institute: string, start: string, end: string, s = scores) => ({
      id,
      institute,
      sampleSize: 1000,
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

describe('imputeShares : un candidat ajouté prend sa part aux donneurs', () => {
  it('prélève selon les poids des donneurs en lice ; le total reste 100', () => {
    const donors = {
      m: [
        { id: 'a', weight: 0.6 },
        { id: 'b', weight: 0.2 },
        { id: 'absent', weight: 0.2 },
      ],
    }
    expect(imputeShares({ a: 30, b: 20, c: 50 }, { m: 4 }, donors)).toEqual({ a: 27, b: 19, c: 50, m: 4 })
  })
  it('sans donneur en lice : prélève sur tous, au prorata de leur score', () => {
    expect(imputeShares({ a: 50, c: 50 }, { m: 4 }, { m: [{ id: 'x', weight: 1 }] })).toEqual({ a: 48, c: 48, m: 4 })
  })
  it('un donneur ne cède pas plus que son score : l’excédent est pris aux autres au prorata', () => {
    const r = imputeShares({ a: 2, b: 38, c: 60 }, { m: 10 }, { m: [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }] })
    expect(r.a).toBe(0)
    expect(r.m).toBe(10)
    expect(r.b).toBeCloseTo(33 * (1 - 3 / 93), 10)
    expect(r.c).toBeCloseTo(60 * (1 - 3 / 93), 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })
})

describe('petits candidats : seuil MIN_MINOR_INSTITUTES et imputation', () => {
  const poll = (id: string, institute: string, hypotheses: { id: string; scores: Record<string, number> }[]) => ({
    id,
    institute,
    sampleSize: 1000,
    fieldwork: { start: '2026-10-10', end: '2026-10-11' },
    hypotheses,
  })
  const pA = poll('p1', 'A', [
    { id: 'H1', scores: { a: 60, b: 40 } },
    { id: 'H2', scores: { a: 50, b: 40, t: 10 } },
  ])
  const pB = poll('p2', 'B', [{ id: 'H1', scores: { a: 50, b: 50 } }])
  const pC = poll('p3', 'C', [{ id: 'H1', scores: { a: 40, b: 45, t: 15 } }])
  const pD = poll('p4', 'D', [{ id: 'H1', scores: { a: 45, b: 43, t: 12 } }])
  const keep = new Set(['a', 'b', 't', 'u'])
  const donors = { t: [{ id: 'a', weight: 1 }], u: [{ id: 'a', weight: 1 }] }

  it('écarte un petit candidat testé par moins de 3 instituts par défaut', () => {
    const r = averageHypothesisPolls([pA, pB, pC], '2026-10-18', 21, { require: ['a', 'b'], exclude: [] }, keep, undefined, [], donors)
    expect(r.excludedMinors).toContain('t')
    expect(r.average).not.toHaveProperty('t')
  })

  it('inclut et impute un petit candidat testé par au moins 3 instituts', () => {
    const r = averageHypothesisPolls([pA, pB, pC, pD], '2026-10-18', 21, { require: ['a', 'b'], exclude: [] }, keep, undefined, [], donors)
    expect(r.eligibleMinors).toEqual(['t'])
    expect(r.excludedMinors).toEqual(['u'])
    expect(r.average.t).toBeCloseTo((10 + 15 + 12) / 3, 8)
    expect(sum(r.average)).toBeCloseTo(100, 8)
  })
})

describe('observedDonors : règle stricte ceteris paribus (mono-candidat uniquement)', () => {
  const poll = (id: string, institute: string, hypotheses: { id: string; scores: Record<string, number> }[]) => ({
    id,
    institute,
    sampleSize: 1000,
    fieldwork: { start: '2026-10-10', end: '2026-10-11' },
    hypotheses,
  })
  const p1 = poll('p1', 'A', [
    { id: 'H1', scores: { a: 50, b: 30, c: 20 } },
    { id: 'H2', scores: { a: 45, b: 30, c: 15, x: 10 } },
  ])
  const all = () => true

  it('pertes exactes sur paire mono-candidat', () => {
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

  it('rejette une paire multi-candidats (x et y ajoutés ensemble : non ceteris paribus)', () => {
    const group = poll('p1', 'A', [
      { id: 'H1', scores: { a: 60, b: 40 } },
      { id: 'H2', scores: { a: 48, b: 37, x: 10, y: 5 } },
    ])
    expect(observedDonors([group], ['x', 'y'], all)).toEqual({})
  })

  it('rejette une paire où un autre candidat est retiré', () => {
    const swap = poll('p1', 'A', [
      { id: 'H1', scores: { a: 50, b: 30, y: 20 } },
      { id: 'H2', scores: { a: 45, b: 30, c: 15, x: 10 } },
    ])
    expect(observedDonors([swap], ['x'], all)).toEqual({})
  })
})
