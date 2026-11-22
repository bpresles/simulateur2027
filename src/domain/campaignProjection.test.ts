import { simulationData } from '../data/schema'
import {
  buildTrajectory,
  computeDampedTrend,
  defaultProjectionSettings,
  MAX_TREND_PTS,
  projectCampaign,
} from './campaignProjection'
import { defaultSettings, simulate } from './simulate'
import type { HistoricalPoll } from './types'

describe('campaignProjection : vote utile séparé, amortissement, tendance amortie et trajectoire', () => {
  const candidates = simulationData.polls.candidates
  const baseSim = simulate(simulationData, defaultSettings())
  const baseScores = Object.fromEntries(baseSim.firstRound.map((r) => [r.candidateId, r.currentScore]))

  it('à J−0 (jour du scrutin), la projection converge exactement vers les scores courants (zéro double comptage)', () => {
    const res = projectCampaign(
      baseScores,
      candidates,
      { ...defaultProjectionSettings(), enabled: true },
      simulationData.pollHistory.polls,
      simulationData.polls.electionDate,
      simulationData.polls.electionDate,
    )
    expect(res.horizonFactor).toBe(0)
    for (const [id, v] of Object.entries(baseScores)) {
      expect(res.projectedScores[id]).toBeCloseTo(v, 8)
    }
  })

  it('le vote utile de gauche concentre les voix vers Mélenchon par défaut, ou vers Glucksmann si choisi comme pivot', () => {
    const onlyLeft = (beneficiary: 'auto' | 'glucksmann') =>
      projectCampaign(
        baseScores,
        candidates,
        {
          ...defaultProjectionSettings(),
          enabled: true,
          meanReversion: 0,
          dampedTrend: 0,
          usefulVote: {
            gauche: { intensity: 1, beneficiary },
            centre: { intensity: 0, beneficiary: 'auto' },
            droite: { intensity: 0, beneficiary: 'auto' },
            extreme_droite: { intensity: 0, beneficiary: 'auto' },
          },
        },
        [],
        simulationData.polls.asOf,
        simulationData.polls.electionDate,
      )

    const auto = onlyLeft('auto')
    expect(auto.projectedScores.melenchon!).toBeGreaterThan(baseScores.melenchon! + 3)
    expect(auto.projectedScores.glucksmann!).toBeLessThan(baseScores.glucksmann!)
    // Plancher protégé : Arthaud ne tombe jamais à 0
    expect(auto.projectedScores.arthaud!).toBeGreaterThanOrEqual(0.45)

    const gluck = onlyLeft('glucksmann')
    expect(gluck.projectedScores.glucksmann!).toBeGreaterThan(baseScores.glucksmann! + 5)
    expect(gluck.projectedScores.melenchon!).toBeLessThan(baseScores.melenchon!)
    expect(Object.values(gluck.projectedScores).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8)
  })

  it('les réglages par bloc sont indépendants et l’extrême droite déjà à 86 % reste saturée sans sur-concentration', () => {
    const onlyEd = projectCampaign(
      baseScores,
      candidates,
      {
        ...defaultProjectionSettings(),
        enabled: true,
        meanReversion: 0,
        dampedTrend: 0,
        usefulVote: {
          gauche: { intensity: 0, beneficiary: 'auto' },
          centre: { intensity: 0, beneficiary: 'auto' },
          droite: { intensity: 0, beneficiary: 'auto' },
          extreme_droite: { intensity: 1, beneficiary: 'auto' },
        },
      },
      [],
      simulationData.polls.asOf,
      simulationData.polls.electionDate,
    )
    const edPole = onlyEd.poles.find((p) => p.pole === 'extreme_droite')!
    expect(edPole.saturated).toBe(true)
    expect(onlyEd.projectedScores.lepen!).toBeCloseTo(baseScores.lepen!, 8)
  })

  it('l’option mergeCenterRight regroupe centre et droite vers un seul pivot (Philippe ou Lisnard)', () => {
    const merged = projectCampaign(
      baseScores,
      candidates,
      {
        ...defaultProjectionSettings(),
        enabled: true,
        mergeCenterRight: true,
        meanReversion: 0,
        dampedTrend: 0,
        usefulVote: {
          gauche: { intensity: 0, beneficiary: 'auto' },
          centre: { intensity: 1, beneficiary: 'lisnard' },
          droite: { intensity: 1, beneficiary: 'lisnard' },
          extreme_droite: { intensity: 0, beneficiary: 'auto' },
        },
      },
      [],
      simulationData.polls.asOf,
      simulationData.polls.electionDate,
    )
    expect(merged.poles.some((p) => p.pole === 'centre_droite')).toBe(true)
    expect(merged.projectedScores.lisnard!).toBeGreaterThan(baseScores.lisnard! + 6)
    expect(merged.projectedScores.philippe!).toBeLessThan(baseScores.philippe!)
  })

  it('la tendance récente amortie reste bornée à ±MAX_TREND_PTS et centrée à somme nulle', () => {
    const hist: HistoricalPoll[] = [
      { id: '1', institute: 'A', fieldwork: { start: '2026-10-01', end: '2026-10-02' }, sampleSize: 1000, scores: { a: 10, b: 90 } },
      { id: '2', institute: 'B', fieldwork: { start: '2026-10-05', end: '2026-10-06' }, sampleSize: 1000, scores: { a: 10, b: 90 } },
      { id: '3', institute: 'A', fieldwork: { start: '2026-11-10', end: '2026-11-11' }, sampleSize: 1000, scores: { a: 40, b: 60 } },
      { id: '4', institute: 'B', fieldwork: { start: '2026-11-15', end: '2026-11-16' }, sampleSize: 1000, scores: { a: 40, b: 60 } },
    ]
    const trend = computeDampedTrend(hist, ['a', 'b'], '2026-11-20', 150, 1)
    expect(trend.a!).toBeGreaterThan(0)
    expect(trend.a!).toBeLessThanOrEqual(MAX_TREND_PTS + 1e-9)
    expect(trend.a! + trend.b!).toBeCloseTo(0, 10)
  })

  it('buildTrajectory couvre passé, présent et futur en projection, mais s’arrête à asOf en photographie actuelle', () => {
    const projSim = simulate(simulationData, {
      ...defaultSettings(),
      projection: { ...defaultProjectionSettings(), enabled: true },
    })
    const traj = buildTrajectory(
      simulationData.pollHistory.polls,
      baseScores,
      candidates,
      { ...defaultProjectionSettings(), enabled: true },
      simulationData.polls.asOf,
      simulationData.polls.electionDate,
      projSim.monteCarlo.candidates,
    )
    expect(traj.historyPollCount).toBeGreaterThan(20)
    expect(traj.points.some((p) => p.kind === 'history')).toBe(true)
    expect(traj.points.some((p) => p.kind === 'now')).toBe(true)
    const last = traj.points.at(-1)!
    expect(last.kind).toBe('projection')
    expect(last.date).toBe(simulationData.polls.electionDate)
    for (const id of traj.trackedIds) {
      expect(last.p10![id]!).toBeLessThanOrEqual(last.scores[id]! + 1e-6)
      expect(last.p90![id]!).toBeGreaterThanOrEqual(last.scores[id]! - 1e-6)
    }

    // Photographie actuelle (`enabled: false`) : aucun point projeté après `asOf`
    const nowTraj = buildTrajectory(
      simulationData.pollHistory.polls,
      baseScores,
      candidates,
      { ...defaultProjectionSettings(), enabled: false },
      simulationData.polls.asOf,
      simulationData.polls.electionDate,
      projSim.monteCarlo.candidates,
    )
    expect(nowTraj.points.some((p) => p.kind === 'projection')).toBe(false)
    expect(nowTraj.points.at(-1)!.kind).toBe('now')
    expect(nowTraj.points.at(-1)!.date).toBe(simulationData.polls.asOf)
  })
})
