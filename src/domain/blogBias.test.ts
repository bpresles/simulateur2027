import { frozenData as simulationData } from '../test/frozenData'
import { computeCalibration } from './calibration'
import { BLOG_BIAS_BLOCS, computeBlogBias, totalBias } from './blogBias'
import type { BlogBias, BlocBias } from './blogBias'
import { applyCorrections, defaultCorrection } from './corrections'
import { normalize } from './pollAverage'
import { defaultSettings, simulate } from './simulate'
import type { Candidate } from './types'

const calibrationAt = (asOf: string) => computeCalibration(simulationData, { ...simulationData.polls, asOf })
const calibration = computeCalibration(simulationData, simulationData.polls)
const geo = (a: number, b: number) => Math.sqrt(a * b)

describe('computeBlogBias', () => {
  const bias = calibration.blogBias

  it('ne corrige que la gauche et l’extrême droite', () => {
    expect(Object.keys(bias).sort()).toEqual(['extreme_droite', 'gauche'])
  })

  it('somme, pour chaque scrutin, les candidats du bloc (2017 : y compris ceux des primaires)', () => {
    for (const [year, stats] of [
      [2022, calibration.y2022],
      [2017, calibration.y2017],
    ] as const) {
      const ids = BLOG_BIAS_BLOCS[year].gauche!
      const sum = (scores: Record<string, number>) => ids.reduce((s, id) => s + (scores[id] ?? 0), 0)
      const y = bias.gauche!.years[year]!
      expect(y.early).toBeCloseTo(sum(stats.progression.earlyAverage), 10)
      expect(y.final).toBeCloseTo(sum(stats.reference.pollAverage), 10)
      expect(y.result).toBeCloseTo(sum(stats.reference.result), 10)
    }
    // En octobre 2016, Hollande était encore testé : il compte dans la gauche de 2017.
    expect(calibration.y2017.progression.earlyAverage.hollande).toBeGreaterThan(0)
  })

  it('combine 2022 et 2017 à parts égales (moyenne géométrique)', () => {
    for (const b of Object.values(bias)) {
      const { 2022: y22, 2017: y17 } = b!.years
      expect(b!.progression).toBeCloseTo(geo(y22!.progression!, y17!.progression!), 10)
      expect(b!.correction).toBeCloseTo(geo(y22!.correction, y17!.correction), 10)
      expect(b!.progression2022).toBe(y22!.progression)
      expect(b!.correction2022).toBe(y22!.correction)
    }
  })

  it('progression × correction = écart entre sondages à la même distance et résultat, pour chaque scrutin', () => {
    for (const b of Object.values(bias)) {
      for (const y of Object.values(b!.years)) expect(y.progression! * y.correction).toBeCloseTo(y.result / y.early, 10)
    }
  })

  it('retrouve le sens des biais relevés par le billet : extrême droite surestimée, gauche sous-estimée', () => {
    expect(totalBias(bias.extreme_droite!)).toBeLessThan(1)
    expect(totalBias(bias.gauche!)).toBeGreaterThan(1)
    // Base du 18/10/2026 : sondages du 10/10/2021 et du 23/10/2016.
    expect(calibration.y2022.progression.asOf).toBe('2021-10-10')
    expect(calibration.y2017.progression.asOf).toBe('2016-10-23')
    const ed = bias.extreme_droite!.years
    expect(ed[2022]!.early - ed[2022]!.result).toBeCloseTo(3.1, 1)
    expect(ed[2017]!.early - ed[2017]!.result).toBeCloseTo(3.6, 1)
  })

  it('suit la distance au scrutin : la progression s’efface à l’approche du vote, la correction reste', () => {
    const later = calibrationAt('2026-12-15')
    expect(later.y2022.progression.asOf).toBe('2021-12-07')
    expect(later.y2017.progression.asOf).toBe('2016-12-20')
    expect(later.blogBias.gauche!.progression).not.toBeCloseTo(bias.gauche!.progression, 3)
    expect(later.blogBias.gauche!.correction).toBeCloseTo(bias.gauche!.correction, 10)

    const eve = calibrationAt('2027-04-17').blogBias
    for (const bloc of ['gauche', 'extreme_droite'] as const) {
      expect(eve[bloc]!.progression).toBeCloseTo(1, 2)
      expect(totalBias(eve[bloc]!)).toBeCloseTo(bias[bloc]!.correction, 2)
    }
  })

  it('sans sondage à cette distance du scrutin, seule la correction s’applique', () => {
    const early = calibrationAt('2026-08-01').blogBias
    expect(early.gauche!.years[2022]!.progression).toBeNull()
    expect(early.gauche!.years[2017]!.progression).toBeNull()
    expect(early.gauche!.progression).toBe(1)
    expect(early.gauche!.correction).toBeCloseTo(bias.gauche!.correction, 10)
  })

  it('un scrutin sans mesure est ignoré : 2022 seul donne les valeurs de 2022', () => {
    const only2022 = computeBlogBias({ 2022: calibration.y2022 })
    expect(only2022.gauche!.progression).toBe(bias.gauche!.progression2022)
    expect(only2022.gauche!.correction).toBe(bias.gauche!.correction2022)
  })
})

describe('applyCorrections avec les biais du billet', () => {
  const candidates = [
    { id: 'g', ref2022: 'melenchon', bloc: 'gauche' },
    { id: 'n', ref2022: null, bloc: 'gauche' },
    { id: 'e', ref2022: 'lepen', bloc: 'extreme_droite' },
    { id: 'c', ref2022: 'macron', bloc: 'centre' },
    { id: 'z', ref2022: 'zemmour', bloc: 'extreme_droite' },
  ] as Candidate[]
  const base = { g: 20, n: 5, e: 30, c: 40, z: 5 }
  const bloc = (progression: number, progression2022: number, correction: number, correction2022: number): BlocBias => ({
    years: {},
    progression,
    progression2022,
    correction,
    correction2022,
  })
  // Valeurs combinées (2022 et 2017) et valeurs de 2022 seule.
  const blogBias = {
    gauche: bloc(1.1, 1.05, 1.2, 1.3),
    extreme_droite: bloc(0.9, 0.95, 0.95, 0.92),
  } satisfies BlogBias
  const prog = { ratio: { melenchon: 1.5, lepen: 1.3, macron: 0.9, zemmour: 0.7 } }
  const off = {
    progressionEnabled: false,
    progressionIntensity: 1,
    correctionsEnabled: false,
    correctionIntensity: 1,
    correctionOverrides: {},
    blogBiasEnabled: true,
    blogBiasIntensity: 1,
  }
  const run = (settings: Partial<typeof off> & { correctionOverrides?: Record<string, number> }) => {
    const rows = applyCorrections(base, candidates, calibration.correction, { ...off, ...settings }, prog, blogBias)
    return Object.fromEntries(rows.map((r) => [r.candidateId, r]))
  }

  it('seule, applique les deux composantes estimées du bloc (progression et correction)', () => {
    const rows = run({})
    expect(rows.g!.blogBiasFactor).toBeCloseTo(1.1 * 1.2, 10)
    expect(rows.n!.blogBiasFactor).toBeCloseTo(1.1 * 1.2, 10)
    expect(rows.e!.blogBiasFactor).toBeCloseTo(0.9 * 0.95, 10)
    expect(rows.z!.blogBiasFactor).toBeCloseTo(0.9 * 0.95, 10)
    expect(rows.c!.blogBiasFactor).toBeNull()
    const expected = normalize({ g: 20 * 1.32, n: 5 * 1.32, e: 30 * 0.855, c: 40, z: 5 * 0.855 })
    for (const id of ['g', 'n', 'e', 'c', 'z']) expect(rows[id]!.corrected).toBeCloseTo(expected[id]!, 10)
  })

  it('met chaque composante à l’échelle de l’intensité', () => {
    expect(run({ blogBiasIntensity: 0.5 }).g!.blogBiasFactor).toBeCloseTo(1.05 * 1.1, 10)
    expect(run({ blogBiasIntensity: 0 }).g!.blogBiasFactor).toBeCloseTo(1, 10)
  })

  it('désactivée : aucun facteur, scores inchangés', () => {
    const rows = run({ blogBiasEnabled: false })
    for (const r of Object.values(rows)) expect(r.blogBiasFactor).toBeNull()
    expect(rows.g!.corrected).toBeCloseTo(20, 10)
  })

  it('avec « Corriger la moyenne » : l’écart final n’est corrigé qu’une fois', () => {
    const rows = run({ correctionsEnabled: true })
    // Mélenchon et Le Pen ont un équivalent 2017 : l'option dédiée corrige déjà l'écart estimé en entier.
    expect(rows.g!.blogBiasFactor).toBeCloseTo(1.1, 10)
    expect(rows.e!.blogBiasFactor).toBeCloseTo(0.9, 10)
    expect(rows.g!.appliedCorrection).toBeCloseTo(rows.g!.defaultCorrection, 10)
    // Zemmour n'en a pas : l'option ne corrige que l'écart de 2022, le billet ajoute ce qu'y change 2017.
    expect(rows.z!.blogBiasFactor).toBeCloseTo(0.9 * (0.95 / 0.92), 10)
    // Sans référence 2022, rien n'est corrigé par l'option dédiée : le billet applique tout.
    expect(rows.n!.blogBiasFactor).toBeCloseTo(1.32, 10)
    expect(rows.n!.appliedCorrection).toBe(0)
  })

  it('« Corriger la moyenne » utilise l’écart estimé sur 2022 et 2017', () => {
    const rows = run({ correctionsEnabled: true })
    const { ratio, ratio2022, ratio2017 } = calibration.correction
    expect(rows.g!.correctionRatio).toBeCloseTo(geo(ratio2022.melenchon!, ratio2017.melenchon!), 10)
    expect(rows.z!.correctionRatio).toBe(ratio2022.zemmour)
    expect(rows.c!.correctionRatio).toBe(ratio.macron)
  })

  it('avec la progression : seule la part de 2022 est déjà corrigée, le billet ajoute celle de 2017', () => {
    const rows = run({ progressionEnabled: true })
    expect(rows.g!.blogBiasFactor).toBeCloseTo((1.1 / 1.05) * 1.2, 10)
    expect(rows.g!.progressionFactor).toBeCloseTo(1.5, 10)
    expect(rows.n!.blogBiasFactor).toBeCloseTo(1.32, 10)
  })

  it('avec les deux options : il ne reste que la part de 2017 de la progression', () => {
    const rows = run({ progressionEnabled: true, correctionsEnabled: true })
    expect(rows.g!.blogBiasFactor).toBeCloseTo(1.1 / 1.05, 10)
    expect(rows.e!.blogBiasFactor).toBeCloseTo(0.9 / 0.95, 10)
    expect(rows.z!.blogBiasFactor).toBeCloseTo((0.9 / 0.95) * (0.95 / 0.92), 10)
    expect(rows.n!.blogBiasFactor).toBeCloseTo(1.32, 10)
  })

  it('sans écarts de 2017 fournis, « Corriger la moyenne » ne couvre que 2022', () => {
    const rows = applyCorrections(
      base,
      candidates,
      { ratio: calibration.correction.ratio2022 },
      { ...off, correctionsEnabled: true },
      prog,
      blogBias,
    )
    expect(rows.find((r) => r.candidateId === 'g')!.blogBiasFactor).toBeCloseTo(1.1 * (1.2 / 1.3), 10)
  })

  it('biais commun : l’option dédiée s’applique à la plus forte des deux intensités', () => {
    const stronger = run({ correctionsEnabled: true, correctionIntensity: 0.7, blogBiasIntensity: 1 })
    expect(stronger.g!.correctionIntensity).toBe(1)
    expect(stronger.g!.appliedCorrection).toBeCloseTo(stronger.g!.defaultCorrection, 10)
    // Le centre n'est pas un bloc du billet : son intensité reste celle de l'option.
    expect(stronger.c!.correctionIntensity).toBe(0.7)
    expect(stronger.c!.appliedCorrection).toBeCloseTo(stronger.c!.defaultCorrection * 0.7, 10)

    const weaker = run({ correctionsEnabled: true, correctionIntensity: 0.7, blogBiasIntensity: 0.5 })
    expect(weaker.g!.correctionIntensity).toBe(0.7)
    expect(weaker.g!.appliedCorrection).toBeCloseTo(defaultCorrection(20, weaker.g!.correctionRatio) * 0.7, 10)

    const progression = run({ progressionEnabled: true, progressionIntensity: 0.4, blogBiasIntensity: 0.8 })
    expect(progression.g!.progressionFactor).toBeCloseTo(1 + 0.5 * 0.8, 10)
    expect(progression.c!.progressionFactor).toBeCloseTo(1 - 0.1 * 0.4, 10)
  })

  it('un écart saisi à la main remplace aussi la correction du billet', () => {
    const rows = run({ correctionsEnabled: true, correctionOverrides: { n: 2, z: -1 } })
    expect(rows.n!.appliedCorrection).toBe(2)
    expect(rows.n!.blogBiasFactor).toBeCloseTo(1.1, 10)
    expect(rows.z!.blogBiasFactor).toBeCloseTo(0.9, 10)
  })
})

describe('simulate avec les biais du billet', () => {
  const { blogBias } = calibration
  const at = (settings: Partial<ReturnType<typeof defaultSettings>>) =>
    simulate(simulationData, { ...defaultSettings(), ...settings }, calibration)
  const row = (res: ReturnType<typeof at>, id: string) => res.firstRound.find((r) => r.candidateId === id)!

  it('seules options activées par défaut avec la participation attendue (par défaut)', () => {
    expect(defaultSettings()).toMatchObject({
      blogBiasEnabled: true,
      blogBiasIntensity: 1,
      turnoutEnabled: true,
      turnoutExpected: null,
      progressionEnabled: false,
      progressionIntensity: 1,
      correctionsEnabled: false,
      correctionIntensity: 1,
    })
  })

  it('seule, applique à Mélenchon l’écart total estimé de la gauche', () => {
    const res = at({})
    expect(row(res, 'melenchon').blogBiasFactor).toBeCloseTo(totalBias(blogBias.gauche!), 10)
    expect(row(res, 'lepen').blogBiasFactor).toBeCloseTo(totalBias(blogBias.extreme_droite!), 10)
    const blocOf = (id: string) => simulationData.polls.candidates.find((c) => c.id === id)!.bloc
    for (const r of res.firstRound) {
      if (blocOf(r.candidateId) === 'centre' || blocOf(r.candidateId) === 'droite') expect(r.blogBiasFactor).toBeNull()
    }
  })

  it('désactivée : aucun facteur', () => {
    for (const r of at({ blogBiasEnabled: false }).firstRound) expect(r.blogBiasFactor).toBeNull()
  })

  it('avec la correction, ne garde que la progression du bloc (et la part 2017 de l’écart sans équivalent)', () => {
    const res = at({ correctionsEnabled: true })
    const ed = blogBias.extreme_droite!
    expect(row(res, 'melenchon').blogBiasFactor).toBeCloseTo(blogBias.gauche!.progression, 10)
    expect(row(res, 'melenchon').correctionIntensity).toBe(1)
    expect(row(res, 'zemmour').blogBiasFactor).toBeCloseTo(ed.progression * (ed.correction / ed.correction2022), 10)
  })
})
