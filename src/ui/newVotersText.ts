import { simulationData } from '../data/schema'
import type { NewVoterRates } from '../domain/newVoters'
import { pct, points } from './format'

const newVoters = simulationData.secondRoundDropout.newVoters
const finalistNames = new Map(simulationData.reference2022.candidates.map((c) => [c.id, surname(c.name)]))

/** « Emmanuel Macron » → « Macron », « Marine Le Pen » → « Le Pen ». */
function surname(fullName: string): string {
  return fullName.split(' ').slice(1).join(' ')
}

/** Nom court d'un finaliste de 2022 (identifiant du fichier de référence). */
export const finalist2022Name = (id: string) => finalistNames.get(id) ?? id

/**
 * Infobulle des flux venus de l'abstention du 1er tour : paramètres du moteur unifié en flux bruts
 * et repères empiriques (Ifop 2022 et Insee 2017–2022).
 */
export function abstentionNote(
  rates: Pick<NewVoterRates, 'insee' | 'rAbs'>,
  mobilization?: number,
  antiRnShare?: number,
): string {
  const { ifop2022 } = newVoters
  const insee = rates.insee.find((y) => y.year === 2022) ?? rates.insee.at(-1)
  const first = ifop2022.abstainersVote[0]!
  return [
    mobilization !== undefined
      ? `Paramètre de mobilisation : ${pct(mobilization * 100, 0)} des abstentionnistes du 1er tour votent valablement au 2nd` +
        (antiRnShare !== undefined ? ` (${pct(antiRnShare * 100, 0)} pour l’adversaire du RN).` : '.')
      : '',
    `Repère Ifop-Fiducial 2022 : environ ${pct(rates.rAbs * 100, 1)} des abstentionnistes du 1er tour se sont exprimés au 2nd (${pct(first.share, 0)} pour ${finalist2022Name(first.id)}).`,
    insee
      ? `Contrôle Insee (${insee.year}) : ${pct(insee.share, 1)} des absents du 1er tour ont voté au 2nd (blancs et nuls compris).`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Infobulle du nœud « Non mesuré » : `blankNull` en % des inscrits. */
export function unmeasuredNote(blankNull: number): string {
  return `Aucune source publique ne mesure le vote au 2nd tour des votants blancs ou nuls du 1er tour (${points(blankNull, 1, true)} des inscrits). Ils sont isolés comme flux non mesuré.`
}
