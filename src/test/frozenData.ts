// Instantané des sondages au 18/10/2026 : les tests qui vérifient des chiffres précis s'appuient
// dessus, pour ne pas casser à chaque synchronisation des données vivantes.
import { parseData } from '../data/schema'
import frozenPolls from '../data/__fixtures__/polls-2027-20261018.json'
import reference2022 from '../data/reference-2022.json'
import transfers from '../data/transfers-legislatives-2024.json'

export const frozenData = parseData({ polls: frozenPolls, reference2022, transfers })
