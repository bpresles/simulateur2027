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
  endogenous = false,
): string {
  const { ifop2022 } = newVoters
  const insee = rates.insee.find((y) => y.year === 2022) ?? rates.insee.at(-1)
  const first = ifop2022.abstainersVote[0]!
  return [
    mobilization !== undefined
      ? `Paramètre de mobilisation (S1) : ${pct(mobilization * 100, 1)} des non-exprimés du 1er tour votent valablement au 2nd` +
        (antiRnShare !== undefined
          ? ` (${pct(antiRnShare * 100, 1)} pour l’adversaire du RN${endogenous ? ', miroir neutre des exprimés T1' : ''}).`
          : '.')
      : '',
    `Repère Ifop-Fiducial 2022 : environ ${pct(rates.rAbs * 100, 1)} des abstentionnistes du 1er tour se sont exprimés au 2nd (${pct(first.share, 0)} pour ${finalist2022Name(first.id)}, identique à l’ensemble des votants T2 à 58,5 %).`,
    insee
      ? `Contrôle Insee (${insee.year}) : ${pct(insee.share, 1)} des absents du 1er tour ont voté au 2nd (blancs et nuls compris ; ~22,5 % exprimés en moyenne 2017–2022).`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Infobulle des blancs et nuls du 1er tour (S1 : hypothèse unifiée avec l'abstention T1). */
export function unmeasuredNote(blankNull: number): string {
  return `Aucune source publique ne mesure séparément le vote au 2nd tour des votants blancs ou nuls du 1er tour (${points(blankNull, 1, true)} des inscrits). Par hypothèse unifiée (S1), ils suivent le même taux de mobilisation et la même orientation que les abstentionnistes du 1er tour.`
}
