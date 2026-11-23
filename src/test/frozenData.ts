// Instantané des sondages au 18/10/2026 : les tests qui vérifient des chiffres précis s'appuient
// dessus, pour ne pas casser à chaque synchronisation des données vivantes.
import { parseData } from '../data/schema'
import frozenPolls from '../data/__fixtures__/polls-2027-20261018.json'
import reference2012 from '../data/reference-2012.json'
import reference2017 from '../data/reference-2017.json'
import reference2022 from '../data/reference-2022.json'
import transfers from '../data/transfers-legislatives-2024.json'
import declaredTransfers from '../data/transfers-2027-declared.json'
import secondRoundDropout from '../data/second-round-dropout.json'
import secondRoundPollBias from '../data/second-round-poll-bias.json'

export const frozenData = parseData({
  polls: frozenPolls,
  pollHistory: { description: 'Historique figé pour les tests', polls: [] },
  reference2022,
  reference2017,
  reference2012,
  transfers,
  declaredTransfers,
  secondRoundDropout,
  secondRoundPollBias,
})
