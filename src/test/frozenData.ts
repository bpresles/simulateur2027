// Instantané des sondages au 18/10/2026 et des mesures de participation au 15/11/2026 : les tests qui vérifient des chiffres précis s'appuient
// dessus, pour ne pas casser à chaque synchronisation des données vivantes.
import { parseData } from '../data/schema'
import frozenPolls from '../data/__fixtures__/polls-2027-20261018.json'
import reference2017 from '../data/reference-2017.json'
import reference2022 from '../data/reference-2022.json'
import transfers from '../data/transfers-legislatives-2024.json'
import turnoutCertainty from '../data/__fixtures__/turnout-certainty-20261115.json'
import secondRoundDropout from '../data/second-round-dropout.json'
import secondRoundPollBias from '../data/second-round-poll-bias.json'

export const frozenData = parseData({ polls: frozenPolls, reference2022, reference2017, transfers, turnoutCertainty, secondRoundDropout, secondRoundPollBias })
