import type { ReferenceStats } from './corrections'

/** Scrutins passés servant d'étalon, du plus récent au plus ancien. */
export const PAST_YEARS = [2022, 2017] as const
export type PastYear = (typeof PAST_YEARS)[number]

/**
 * Poids de chaque scrutin dans l'estimation des écarts. Hypothèse : les deux présidentielles comptent
 * autant (rien ne permet de dire laquelle annonce le mieux 2027). Les poids sont ramenés à 1 sur les
 * scrutins disponibles : un scrutin sans donnée est ignoré.
 */
export const ELECTION_WEIGHTS: Record<PastYear, number> = { 2022: 0.5, 2017: 0.5 }

/**
 * Candidat de 2017 dont l'écart entre derniers sondages et résultat sert d'équivalent à celui d'un
 * candidat de 2022 : le même candidat, ou celui du même parti. Hidalgo → Hamon (PS) ; Jadot → Hamon,
 * candidat commun PS-EELV après le retrait de Jadot en février 2017 ; Pécresse → Fillon (LR). Roussel (le
 * PCF soutenait Mélenchon en 2017) et Zemmour (absent en 2017) n'en ont pas : seul 2022 compte pour eux.
 */
export const EQUIVALENTS_2017: Record<string, string> = {
  arthaud: 'arthaud',
  poutou: 'poutou',
  melenchon: 'melenchon',
  hidalgo: 'hamon',
  jadot: 'hamon',
  macron: 'macron',
  lassalle: 'lassalle',
  pecresse: 'fillon',
  'dupont-aignan': 'dupont-aignan',
  lepen: 'lepen',
}

/**
 * Combinaison des ratios de plusieurs scrutins : moyenne géométrique pondérée (un écart de +20 % et un
 * de −20 % ne s'annulent pas en moyenne arithmétique, ils s'annulent presque en géométrique). Les scrutins
 * sans valeur sont ignorés ; null si aucun n'en a.
 */
export function combineRatios(ratios: Partial<Record<PastYear, number | null>>): number | null {
  let weights = 0
  let logs = 0
  for (const year of PAST_YEARS) {
    const r = ratios[year]
    if (r === undefined || r === null || r <= 0) continue
    weights += ELECTION_WEIGHTS[year]
    logs += ELECTION_WEIGHTS[year] * Math.log(r)
  }
  return weights > 0 ? Math.exp(logs / weights) : null
}

export interface CorrectionReference {
  /** Ratio estimé (résultat ÷ derniers sondages) par candidat de 2022 : 2022 et 2017 combinés. */
  ratio: Record<string, number>
  /** Ratio de 2022 seul. */
  ratio2022: Record<string, number>
  /** Ratio de l'équivalent 2017, par candidat de 2022 (absent faute d'équivalent). */
  ratio2017: Record<string, number>
}

/** Écart estimé entre derniers sondages et résultat pour chaque candidat de 2022, d'après 2022 et 2017. */
export function computeCorrectionReference(ref2022: ReferenceStats, ref2017: ReferenceStats): CorrectionReference {
  const ratio2017 = Object.fromEntries(
    Object.entries(EQUIVALENTS_2017).flatMap(([id, eq]) => {
      const r = ref2017.ratio[eq]
      return r !== undefined && ref2022.ratio[id] !== undefined ? [[id, r]] : []
    }),
  )
  const ratio = Object.fromEntries(
    Object.entries(ref2022.ratio).map(([id, r]) => [id, combineRatios({ 2022: r, 2017: ratio2017[id] }) ?? r]),
  )
  return { ratio, ratio2022: ref2022.ratio, ratio2017 }
}
