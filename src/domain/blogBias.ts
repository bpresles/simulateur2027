import type { ReferenceStats } from './corrections'
import { combineRatios, PAST_YEARS } from './pastElections'
import type { PastYear } from './pastElections'
import type { ProgressionStats } from './progression'
import type { Bloc } from './types'

/**
 * Billet qui relève les biais corrigés par l'option « Corriger les biais révélés dans le billet de blog
 * d’Eliot Thibault ».
 */
export const BLOG_BIAS_URL =
  'https://blogs.mediapart.fr/eliot-thibault/blog/011126/pourquoi-melenchon-va-faire-25-et-sera-au-2nd-tour'

/**
 * Blocs dont le billet chiffre le biais, avec leurs candidats de chaque scrutin passé : l'extrême droite
 * surestimée et la gauche sous-estimée loin du scrutin. Les candidats passés n'ont pas de bloc dans les
 * données ; ces listes reprennent le classement des candidats de 2027. En 2017, elles comptent aussi les
 * candidats testés avant les primaires (Hollande, Valls, Montebourg…), pour que la part du bloc reste celle
 * des hypothèses. Le centre et la droite ne sont pas corrigés (ils absorbent l'écart quand les scores sont
 * ramenés à 100).
 */
export const BLOG_BIAS_BLOCS: Record<PastYear, Partial<Record<Bloc, string[]>>> = {
  2022: {
    gauche: ['arthaud', 'poutou', 'roussel', 'melenchon', 'hidalgo', 'jadot'],
    extreme_droite: ['dupont-aignan', 'lepen', 'zemmour'],
  },
  2017: {
    gauche: [
      'arthaud',
      'poutou',
      'melenchon',
      'hamon',
      'hollande',
      'valls',
      'montebourg',
      'peillon',
      'pinel',
      'jadot',
      'duflot',
    ],
    extreme_droite: ['dupont-aignan', 'lepen'],
  },
}

/** Mesures d'un bloc pour un scrutin passé. */
export interface YearBlocBias {
  /** Part du bloc dans les sondages à la même distance du scrutin que la base 2027 (0 sans sondage). */
  early: number
  /** Part du bloc dans les derniers sondages avant le vote. */
  final: number
  /** Part du bloc au résultat officiel (% des suffrages exprimés). */
  result: number
  /** Évolution des sondages : derniers sondages ÷ sondages à la même distance (null sans sondage). */
  progression: number | null
  /** Écart entre derniers sondages et résultat : résultat ÷ derniers sondages. */
  correction: number
}

export interface BlocBias {
  years: Partial<Record<PastYear, YearBlocBias>>
  /** Progression estimée : scrutins disponibles combinés (1 si aucun n'est mesurable). */
  progression: number
  /** Correction estimée : scrutins disponibles combinés. */
  correction: number
  /** Progression de 2022 seule (1 si elle n'est pas mesurable) : celle de « Progression comme en 2022 ». */
  progression2022: number
  /** Correction de 2022 seule. */
  correction2022: number
}

export type BlogBias = Partial<Record<Bloc, BlocBias>>

/** Statistiques d'un scrutin passé : derniers sondages et résultat, sondages à la même distance. */
export interface YearStats {
  reference: ReferenceStats
  progression: ProgressionStats
}

const sum = (scores: Record<string, number>, ids: string[]) => ids.reduce((s, id) => s + (scores[id] ?? 0), 0)

function yearBlocBias(stats: YearStats, ids: string[]): YearBlocBias | null {
  const early = sum(stats.progression.earlyAverage, ids)
  const final = sum(stats.reference.pollAverage, ids)
  const result = sum(stats.reference.result, ids)
  if (final <= 0) return null
  // Sans sondage à cette distance du scrutin, la progression de ce scrutin n'est pas mesurable.
  return { early, final, result, progression: early > 0 ? final / early : null, correction: result / final }
}

/**
 * Biais par bloc, scindé en deux composantes : la progression des sondages (celle de l'option « Progression
 * comme en 2022 ») et l'écart entre derniers sondages et résultat (celle de « Corriger la moyenne »).
 * Chacune est mesurée en 2022 et en 2017, puis combinée comme les écarts de « Corriger la moyenne »
 * (moyenne géométrique pondérée, un scrutin non mesurable étant ignoré).
 */
export function computeBlogBias(stats: Partial<Record<PastYear, YearStats>>): BlogBias {
  const blocs = [...new Set(PAST_YEARS.flatMap((y) => Object.keys(BLOG_BIAS_BLOCS[y])))] as Bloc[]
  return Object.fromEntries(
    blocs.flatMap((bloc) => {
      const years = Object.fromEntries(
        PAST_YEARS.flatMap((y) => {
          const s = stats[y]
          const ids = BLOG_BIAS_BLOCS[y][bloc]
          const b = s && ids ? yearBlocBias(s, ids) : null
          return b ? [[y, b]] : []
        }),
      ) as Partial<Record<PastYear, YearBlocBias>>
      const y2022 = years[2022]
      if (!y2022) return []
      const of = (k: 'progression' | 'correction') =>
        Object.fromEntries(PAST_YEARS.map((y) => [y, years[y]?.[k] ?? null])) as Record<PastYear, number | null>
      const bias: BlocBias = {
        years,
        progression: combineRatios(of('progression')) ?? 1,
        correction: combineRatios(of('correction')) ?? y2022.correction,
        progression2022: y2022.progression ?? 1,
        correction2022: y2022.correction,
      }
      return [[bloc, bias]]
    }),
  )
}

/** Écart total estimé du bloc, des sondages à la même distance du scrutin au résultat (à 100 %). */
export const totalBias = (bias: BlocBias) => bias.progression * bias.correction

/** Composante mise à l'échelle comme la progression et la correction : 1 + (ratio − 1) × intensité. */
const scaled = (ratio: number, intensity: number) => Math.max(0, 1 + (ratio - 1) * intensity)

/**
 * Part d'une composante déjà corrigée par l'option dédiée :
 * - `none` : rien, le billet l'applique en entier ;
 * - `2022` : la part de 2022 (progression, ou écart d'un candidat sans équivalent en 2017) ; le billet
 *   n'ajoute que ce que 2017 change à l'estimation ;
 * - `all` : tout (écart estimé sur 2022 et 2017, ou saisi à la main).
 */
export type Coverage = 'none' | '2022' | 'all'

const residual = (combined: number, of2022: number, coverage: Coverage) =>
  coverage === 'all' ? 1 : coverage === '2022' ? (of2022 > 0 ? combined / of2022 : 1) : combined

/**
 * Facteur appliqué à un candidat du bloc. La part d'une composante déjà corrigée pour lui par l'option dédiée
 * n'est pas reprise : l'option dédiée la corrige seule, à la plus forte des deux intensités, pour ne jamais
 * compter deux fois le même biais.
 */
export function blogBiasFactor(
  bias: BlocBias,
  covered: { progression: Coverage; correction: Coverage },
  intensity: number,
): number {
  return (
    scaled(residual(bias.progression, bias.progression2022, covered.progression), intensity) *
    scaled(residual(bias.correction, bias.correction2022, covered.correction), intensity)
  )
}
