import { simulationData } from '../data/schema'
import { campDropout, noRnDropout, profileDropout } from '../domain/secondRound'
import type { ProfileId, ResolvedDuel } from '../domain/types'

/** Type de duel de 2024 en toutes lettres courtes, pour les libellés de l'abandon. */
export const DUEL_KIND: Record<ProfileId, string> = {
  lfi_rn: 'duels RN – LFI',
  ecolo_ps_pcf_rn: 'duels RN – gauche non LFI',
  ensemble_rn: 'duels RN – centre',
  lr_rn: 'duels RN – droite',
}

const dropoutData = simulationData.secondRoundDropout
const noRnYears = dropoutData.presidential.elections.filter((e) => !e.rn).map((e) => e.year)

/** Origine de l'estimation d'abandon d'un duel : « législatives 2024, duels RN – LFI ». */
export function dropoutBasis(duel: ResolvedDuel): string {
  const kinds = duel.kind === 'sourced' ? duel.profileWeights.map((w) => DUEL_KIND[w.profileId]) : []
  return kinds.length > 0
    ? `législatives 2024, ${kinds.join(' et ')}`
    : `seconds tours présidentiels sans RN de ${noRnYears.join(' et ')}`
}

/** Abandon de chaque type de duel de 2024 (total, camps des finalistes, autres blocs), puis du repli sans RN. */
export const DROPOUT_ROWS = [
  ...(Object.keys(DUEL_KIND) as ProfileId[]).map((id) => {
    const profile = dropoutData.legislatives2024.profiles[id]
    return {
      label: DUEL_KIND[id],
      count: profile.constituencies.length as number | null,
      dropout: profileDropout(profile),
      camps: campDropout(profile) as ReturnType<typeof campDropout> | null,
    }
  }),
  {
    label: `duel sans RN (présidentielles ${noRnYears.join(' et ')})`,
    count: null,
    dropout: noRnDropout(dropoutData),
    camps: null,
  },
]
