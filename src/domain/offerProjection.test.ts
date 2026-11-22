import { simulationData as liveData } from '../data/schema'
import { measurePairTransfers, projectHypothesis } from './offerProjection'
import type { Hypothesis, Poll } from './types'

const poll = (id: string, institute: string, end: string, hypotheses: Hypothesis[]): Poll => ({
  id,
  institute,
  sponsor: 'x',
  fieldwork: { start: end, end },
  sampleSize: 1500,
  sources: [{ label: 'x', url: 'https://example.org' }],
  hypotheses,
})

describe('offerProjection : paires propres et projection d’offre', () => {
  const candidates = liveData.polls.candidates
  const base = {
    arthaud: 1,
    melenchon: 18,
    roussel: 2,
    tondelier: 3,
    glucksmann: 11,
    philippe: 15,
    retailleau: 8,
    'dupont-aignan': 2,
    lepen: 36,
    zemmour: 4,
  }
  // Ajout pur de Gabriel Attal (5 pts : 3 pris à Philippe, 1 à Glucksmann, 1 à Retailleau)
  const withAttal = {
    ...base,
    philippe: 12,
    glucksmann: 10,
    retailleau: 7,
    attal: 5,
  }

  it('mesure exactement les parts de transfert sur une paire propre mono-candidat', () => {
    const p = poll('p1', 'Ifop', '2026-11-15', [
      { id: 'H1', scores: base },
      { id: 'H2', scores: withAttal },
    ])
    const model = measurePairTransfers([p], candidates, '2026-11-20')
    expect(model.byCandidate.attal).toBeDefined()
    expect(model.byCandidate.attal!.pairs).toEqual([{ institute: 'Ifop', without: 'H1', with: 'H2' }])
    expect(model.byCandidate.attal!.shares.philippe).toBeCloseTo(0.6, 8)
    expect(model.byCandidate.attal!.shares.glucksmann).toBeCloseTo(0.2, 8)
    expect(model.byCandidate.attal!.shares.retailleau).toBeCloseTo(0.2, 8)
    expect(model.byCandidate.attal!.shares.lepen).toBeUndefined()
  })

  it('ignore les paires à plusieurs candidats d’écart (ex. Attal + 2 petits candidats ajoutés en bloc)', () => {
    const dirty = poll('p1', 'Cluster17', '2026-11-15', [
      { id: 'H1', scores: base },
      { id: 'H4', scores: { ...withAttal, lepen: 30, ruffin: 3, polony: 3 } },
    ])
    const model = measurePairTransfers([dirty], candidates, '2026-11-20')
    expect(model.byCandidate.attal?.pairs ?? []).toEqual([])
    expect(model.byCandidate.ruffin?.pairs ?? []).toEqual([])
  })

  it('projette un sondage sans Attal (ex. Odoxa) vers une offre avec Attal en préservant les autres candidats', () => {
    const ifop = poll('p1', 'Ifop', '2026-11-15', [
      { id: 'H1', scores: base },
      { id: 'H2', scores: withAttal },
    ])
    const odoxa = poll('p2', 'Odoxa', '2026-11-14', [{ id: 'H1', scores: base }])
    const model = measurePairTransfers([ifop, odoxa], candidates, '2026-11-20')
    const filter = { require: Object.keys(withAttal), exclude: [] as string[] }
    const proj = projectHypothesis(odoxa, filter, new Set(Object.keys(withAttal)), model, candidates)
    expect(proj).not.toBeNull()
    expect(proj!.steps).toEqual(['+Attal'])
    expect(proj!.scores.attal).toBeCloseTo(5, 6)
    expect(proj!.scores.philippe).toBeCloseTo(12, 6)
    expect(proj!.scores.lepen).toBeCloseTo(36, 6)
    expect(Object.values(proj!.scores).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8)
  })

  it('ne projette jamais une hypothèse où un candidat requis est remplacé (ex. Hollande à la place de Glucksmann)', () => {
    const ifop = poll('p1', 'Ifop', '2026-11-15', [
      { id: 'H1', scores: base },
      { id: 'H2', scores: withAttal },
    ])
    const { glucksmann: _g, ...withoutGluck } = base
    const swapped = poll('p2', 'Elabe', '2026-11-14', [
      { id: 'H1', scores: { ...withoutGluck, hollande: 11 }, replacing: { hollande: 'glucksmann' } },
    ])
    const model = measurePairTransfers([ifop, swapped], candidates, '2026-11-20')
    const filter = { require: Object.keys(withAttal), exclude: [] as string[] }
    expect(projectHypothesis(swapped, filter, new Set(Object.keys(withAttal)), model, candidates)).toBeNull()
  })

  it('retire un candidat en redistribuant 100 % de son score sur les poids mesurés (sans fuite arbitraire)', () => {
    const ifop = poll('p1', 'Ifop', '2026-11-15', [
      { id: 'H1', scores: base },
      { id: 'H2', scores: withAttal },
    ])
    const onlyWithAttal = poll('p2', 'Elabe', '2026-11-14', [{ id: 'H1', scores: withAttal }])
    const model = measurePairTransfers([ifop, onlyWithAttal], candidates, '2026-11-20')
    const filter = { require: Object.keys(base), exclude: ['attal'] }
    const proj = projectHypothesis(onlyWithAttal, filter, new Set(Object.keys(base)), model, candidates)
    expect(proj).not.toBeNull()
    expect(proj!.steps).toEqual(['−Attal'])
    // 100 % des 5 pts d'Attal reviennent aux donneurs mesurés (3 Philippe, 1 Glucksmann, 1 Retailleau) ; Le Pen reste à 36.
    expect(proj!.scores.philippe).toBeCloseTo(15, 6)
    expect(proj!.scores.glucksmann).toBeCloseTo(11, 6)
    expect(proj!.scores.retailleau).toBeCloseTo(8, 6)
    expect(proj!.scores.lepen).toBeCloseTo(36, 6)
  })

  it('intègre Odoxa et Cluster17 proprement sur les données vivantes 2027', () => {
    const model = measurePairTransfers(liveData.polls.polls, candidates, liveData.polls.asOf)
    expect(model.byCandidate.attal!.pairs.length).toBeGreaterThanOrEqual(3)
    expect(model.byCandidate.philippe!.pairs.length).toBeGreaterThanOrEqual(3)
  })
})
