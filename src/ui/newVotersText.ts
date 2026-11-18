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
 * Infobulle des flux venus de l'abstention du 1er tour : source de la part, contrôle Insee et règle de
 * répartition (comme l'ensemble des votants, mesuré en 2022).
 */
export function abstentionNote(rates: Pick<NewVoterRates, 'insee'>): string {
  const { ifop2022 } = newVoters
  const abstained = ifop2022.abstainedFirstRound
    .map((s) => `${pct(s.share, 0)} des électeurs de ${finalist2022Name(s.id)}`)
    .join(' et ')
  const insee = rates.insee.find((y) => y.year === 2022) ?? rates.insee.at(-1)
  const first = ifop2022.abstainersVote[0]!
  const overall = ifop2022.allVotersVote.find((s) => s.id === first.id)!
  return [
    `Source : sondage Ifop-Fiducial du jour du vote, 2nd tour 2022 (${abstained} s’étaient abstenus au 1er tour).`,
    insee
      ? `Contrôle Insee : en ${insee.year}, ${pct(insee.share, 1)} des inscrits qui n’avaient pas voté au 1er tour ont voté au 2nd (blancs et nuls compris).`
      : '',
    `Répartis comme l’ensemble des votants (mesuré en 2022 : ${pct(first.share, 0)} pour ${finalist2022Name(first.id)} chez eux, contre ${pct(overall.share, 1)} au total).`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Infobulle du nœud « Non mesuré » : `blankNull` en % des inscrits. */
export function unmeasuredNote(blankNull: number): string {
  return `Aucune source publique ne mesure le vote au 2nd tour des votants blancs ou nuls du 1er tour. S’ils votent pour un finaliste, les départs des électeurs du 1er tour sont sous-estimés d’autant (au plus ${points(blankNull, 1, true)}).`
}
