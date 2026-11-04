import { blogBiasFactor } from './blogBias'
import type { BlogBias, Coverage } from './blogBias'
import type { CorrectionReference } from './pastElections'
import { addDays, latestPerInstitute, meanByKey, normalize } from './pollAverage'
import { blendedRatio, referenceParts } from './references'
import { BLOG_TURNOUT_RISE, turnoutFactors } from './turnout'
import type { TurnoutModel } from './turnout'
import type { Candidate, CandidateId, FirstRoundRow, PastElectionReference, Reference2022Poll, Settings } from './types'

export interface ReferenceStats {
  pollsUsed: Reference2022Poll[]
  /** Moyenne des derniers sondages par institut, normalisée à 100. */
  pollAverage: Record<string, number>
  /** Résultat officiel en % des suffrages exprimés. */
  result: Record<string, number>
  /** résultat / moyenne des sondages. */
  ratio: Record<string, number>
}

/** Écart entre les derniers sondages et le résultat d'un scrutin passé (2022 ou 2017). */
export function computeReference(ref: PastElectionReference): ReferenceStats {
  // La fenêtre se termine la veille du scrutin : aucun sondage n'est publié le jour du vote.
  const asOf = addDays(ref.electionDate, -1)
  const { latest } = latestPerInstitute(ref.polls, asOf, ref.windowDays)
  const pollAverage = normalize(meanByKey(latest.map((p) => normalize(p.scores))))
  const result = Object.fromEntries(ref.candidates.map((c) => [c.id, (c.votes * 100) / ref.expressed]))
  const ratio = Object.fromEntries(
    ref.candidates.flatMap((c) => {
      const avg = pollAverage[c.id]
      const res = result[c.id]
      return avg && res !== undefined ? [[c.id, res / avg]] : []
    }),
  )
  return { pollsUsed: latest, pollAverage, result, ratio }
}

/**
 * Correction par défaut d'un candidat, en points : base × (ratio estimé − 1).
 * Exemple : un candidat sous-estimé de 28 % et sondé à 15 % reçoit +4,2 pts.
 */
export function defaultCorrection(base: number, ratio: number | null): number {
  return ratio === null ? 0 : base * (ratio - 1)
}

/**
 * Ajustements du 1er tour, dans l'ordre :
 * 1. progression (optionnelle) : moyenne × (1 + (progression 2022 de la référence − 1) × intensité),
 *    ramenée à 100 — estimation des derniers sondages avant le vote ;
 * 2. correction : écart relatif estimé entre derniers sondages et résultat (2022 et 2017 combinés, ou
 *    2022 seul faute d'équivalent en 2017), appliqué au résultat de l'étape 1 (les deux se cumulent),
 *    puis ramené à 100 ;
 * 3. biais du billet (optionnel) : écart par bloc (gauche, extrême droite) estimé sur 2022 et 2017, limité
 *    aux parts que les étapes 1 et 2 ne corrigent pas déjà pour ce candidat ; pour celles qu'elles
 *    corrigent, leur intensité est portée à celle du billet si elle est plus forte ;
 * 4. hausse de participation (optionnelle) : les électeurs supplémentaires annoncés par le billet, supposés
 *    absents des sondages, votent comme les abstentionnistes de 2017 venus voter en 2022.
 */
export function applyCorrections(
  base: Record<CandidateId, number>,
  candidates: Candidate[],
  correction: Pick<CorrectionReference, 'ratio'> & Partial<Pick<CorrectionReference, 'ratio2017'>>,
  settings: Pick<
    Settings,
    'correctionsEnabled' | 'correctionIntensity' | 'correctionOverrides' | 'progressionEnabled'
  > & {
    referenceBlend?: Settings['referenceBlend']
    progressionIntensity?: Settings['progressionIntensity']
    blogBiasEnabled?: Settings['blogBiasEnabled']
    blogBiasIntensity?: Settings['blogBiasIntensity']
    turnoutEnabled?: Settings['turnoutEnabled']
    turnoutIntensity?: Settings['turnoutIntensity']
  },
  progression: { ratio: Record<string, number> } | null = null,
  blogBias: BlogBias | null = null,
  turnout: TurnoutModel | null = null,
): FirstRoundRow[] {
  const present = candidates.filter((c) => base[c.id] !== undefined)
  const partsOf = (c: Candidate) => referenceParts(c, settings.referenceBlend?.[c.id])
  const progressionOf = (c: Candidate) => (progression ? blendedRatio(partsOf(c), progression.ratio) : null)
  const intensity = settings.progressionIntensity ?? 1
  const blogIntensity = settings.blogBiasIntensity ?? 1
  const blocBiasOf = (c: Candidate) => (settings.blogBiasEnabled && c.bloc ? blogBias?.[c.bloc] : undefined)
  // Biais commun à une option dédiée et au billet : corrigé une seule fois, à la plus forte des deux intensités.
  const strongest = (c: Candidate, k: number) => (blocBiasOf(c) ? Math.max(k, blogIntensity) : k)
  // L'écart de « Corriger la moyenne » tient compte de 2017 si chaque référence du candidat y a un équivalent.
  const has2017 = (c: Candidate) =>
    partsOf(c)
      .filter((p) => p.weight > 0 && correction.ratio[p.id] !== undefined)
      .every((p) => correction.ratio2017?.[p.id] !== undefined)
  const factorOf = (c: Candidate) => {
    const p = settings.progressionEnabled ? progressionOf(c) : null
    return p === null ? null : Math.max(0, 1 + (p - 1) * strongest(c, intensity))
  }
  const projected = normalize(
    Object.fromEntries(present.map((c) => [c.id, (base[c.id] ?? 0) * (factorOf(c) ?? 1)])),
  )
  const draft = present.map((c) => {
    const score = projected[c.id] ?? 0
    const ratio = blendedRatio(partsOf(c), correction.ratio)
    const def = defaultCorrection(score, ratio)
    const override = settings.correctionOverrides[c.id]
    const isOverride = settings.correctionsEnabled && override !== undefined
    const correctionIntensity = strongest(c, settings.correctionIntensity)
    const applied = !settings.correctionsEnabled ? 0 : isOverride ? override : def * correctionIntensity
    const bloc = blocBiasOf(c)
    // Une correction saisie à la main remplace aussi la part « sondages → résultat » du billet.
    const correctionCoverage: Coverage =
      !settings.correctionsEnabled || (!isOverride && ratio === null)
        ? 'none'
        : isOverride || has2017(c)
          ? 'all'
          : '2022'
    const blog = bloc
      ? blogBiasFactor(
          bloc,
          { progression: factorOf(c) !== null ? '2022' : 'none', correction: correctionCoverage },
          blogIntensity,
        )
      : null
    const raw = Math.max(0, score + applied) * (blog ?? 1)
    return { c, score, ratio, def, correctionIntensity, applied, isOverride, blog, raw }
  })
  const raw = Object.fromEntries(draft.map((d) => [d.c.id, d.raw]))
  const blocs = new Map(present.map((c) => [c.id, c.bloc]))
  const turnoutOf =
    settings.turnoutEnabled && turnout
      ? turnoutFactors(raw, (id) => blocs.get(id), turnout, BLOG_TURNOUT_RISE * (settings.turnoutIntensity ?? 1))
      : null
  const corrected = normalize(
    Object.fromEntries(draft.map((d) => [d.c.id, d.raw * (turnoutOf?.[d.c.id] ?? 1)])),
  )
  return draft.map((d) => ({
    candidateId: d.c.id,
    base: base[d.c.id] ?? 0,
    progressionRatio: progressionOf(d.c),
    progressionFactor: factorOf(d.c),
    projected: d.score,
    correctionRatio: d.ratio,
    references: partsOf(d.c),
    defaultCorrection: d.def,
    correctionIntensity: d.correctionIntensity,
    appliedCorrection: d.applied,
    isOverride: d.isOverride,
    blogBiasFactor: d.blog,
    turnoutFactor: turnoutOf?.[d.c.id] ?? null,
    cededBase: 0,
    ceded: 0,
    corrected: corrected[d.c.id] ?? 0,
  }))
}
