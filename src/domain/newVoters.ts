import type { Reference2022, SecondRoundDropoutData, SecondRoundResult, TurnoutBalance, VoteFlow } from './types'

/**
 * Nouveaux votants du 2nd tour : les électeurs qui n'ont pas voté au 1er tour (abstention, blanc ou nul)
 * et votent au 2nd. Le calcul du 2nd tour (`computeSecondRound`) les compte déjà, en déduction, dans un
 * abandon net ; ce module n'en tire que des flux bruts, en % des inscrits, pour l'affichage. Il ne change
 * ni le score des finalistes ni le total des exprimés du 2nd tour.
 */

/** Données utiles au calcul des taux : le bloc des nouveaux votants et les résultats officiels de 2022. */
export interface NewVoterData {
  secondRoundDropout: Pick<SecondRoundDropoutData, 'newVoters'>
  reference2022: Pick<Reference2022, 'registered' | 'voters' | 'expressed' | 'secondRound'>
}

/** Part des abstentionnistes du 1er tour qui votent au 2nd, selon l'Insee, pour une année. */
export interface InseeShare {
  year: number
  /** Part des inscrits qui votent au 2nd tour seulement (%). */
  secondOnly: number
  /** Inscrits qui n'ont pas voté au 1er tour : 100 − (deux tours + 1er tour seulement) (%). */
  abstainers: number
  /** Part de ces abstentionnistes qui votent au 2nd tour, blancs et nuls compris (%). */
  share: number
}

export interface NewVoterRates {
  /** Part des abstentionnistes du 1er tour qui votent pour un finaliste (0 à 1). */
  rAbs: number
  /** Fourchette de `rAbs` quand chaque part de l'Ifop varie de sa demi-marge d'arrondi. */
  rAbsRange: { min: number; max: number }
  /** Part des blancs et nuls parmi les votants du 1er tour 2022 (0 à 1). */
  bnShare: number
  /** Participation officielle au 1er tour 2022, en % des inscrits. */
  turnout2022: number
  /** Abstentionnistes du 1er tour 2022 : inscrits − votants. */
  abstainers2022: number
  /** Voix des finalistes issues des abstentionnistes du 1er tour : Σ part Ifop × voix du 2nd tour. */
  finalistVotesFromAbstainers: number
  /** Contrôle : part des abstentionnistes du 1er tour qui votent au 2nd, mesurée par l'Insee. */
  insee: InseeShare[]
}

/** Parts de l'Ifop appliquées aux voix du 2nd tour, avec un écart (en points) sur chaque part. */
function abstainerVotes(data: NewVoterData, delta: number): number {
  const { ifop2022 } = data.secondRoundDropout.newVoters
  return ifop2022.abstainedFirstRound.reduce((total, s) => {
    const votes = data.reference2022.secondRound.candidates.find((c) => c.id === s.id)?.votes ?? 0
    return total + (Math.max(0, s.share + delta) * votes) / 100
  }, 0)
}

/**
 * Taux des nouveaux votants, calculés à partir des chiffres de l'Ifop et des résultats officiels de 2022
 * (jamais saisis) :
 * - `rAbs` = (part des abstentionnistes chez les électeurs de chaque finaliste × ses voix du 2nd tour) ÷
 *   abstentionnistes du 1er tour ;
 * - `bnShare` = (votants − exprimés) ÷ votants au 1er tour.
 */
export function newVoterRates(data: NewVoterData): NewVoterRates {
  const { reference2022: ref } = data
  const { ifop2022, insee } = data.secondRoundDropout.newVoters
  const abstainers2022 = ref.registered - ref.voters
  const finalistVotesFromAbstainers = abstainerVotes(data, 0)
  return {
    rAbs: finalistVotesFromAbstainers / abstainers2022,
    rAbsRange: {
      min: abstainerVotes(data, -ifop2022.roundingMargin) / abstainers2022,
      max: abstainerVotes(data, ifop2022.roundingMargin) / abstainers2022,
    },
    bnShare: (ref.voters - ref.expressed) / ref.voters,
    turnout2022: (100 * ref.voters) / ref.registered,
    abstainers2022,
    finalistVotesFromAbstainers,
    insee: insee.map((y) => {
      const abstainers = 100 - y.bothRounds - y.firstOnly
      return { year: y.year, secondOnly: y.secondOnly, abstainers, share: (100 * y.secondOnly) / abstainers }
    }),
  }
}

/**
 * Participation au 1er tour (% des inscrits) : celle du bilan de participation s'il y en a un, à défaut la
 * participation officielle de 2022.
 */
export function firstRoundParticipation(
  balance: Pick<TurnoutBalance, 'expected'> | null,
  rates: Pick<NewVoterRates, 'turnout2022'>,
): number {
  return balance?.expected ?? rates.turnout2022
}

/** Flux d'un groupe du 1er tour qui n'est pas un électorat de candidat, en % des inscrits. */
export interface GroupFlow {
  /** Taille du groupe. */
  volume: number
  toA: number
  toB: number
  /** Ne s'expriment pas au 2nd tour (abstention, blanc, nul). */
  nonExpressed: number
}

export interface GrossFlows {
  /** Participation au 1er tour, en % des inscrits. */
  participation: number
  /** Abstentionnistes du 1er tour, en % des inscrits. */
  abstention1: number
  /** Votants blancs ou nuls du 1er tour, en % des inscrits. */
  blankNull1: number
  /** Exprimés du 1er tour, en % des inscrits. */
  expressed1: number
  /** Points des exprimés du 1er tour → % des inscrits (E1 ÷ 100). */
  scale: number
  /** Exprimés du 2nd tour, en % des inscrits. */
  expressed2: number
  /** Nouveaux votants venus de l'abstention, en % des inscrits, qui votent pour un finaliste. */
  newVoters: number
  /** Taux de départ ajouté à chaque électorat : nouveaux votants ÷ exprimés du 2nd tour. */
  addedDeparture: number
  /**
   * Électorats des candidats, en % des inscrits : `share`, `toA`, `toB` et `abstention` (ne s'expriment
   * pas) sont ceux de `sr.flows` convertis, les départs vers les nouveaux votants étant déjà déduits.
   */
  flows: VoteFlow[]
  /** Abstentionnistes du 1er tour : une part vote pour un finaliste (nouveaux votants), le reste non. */
  abstainers: GroupFlow
  /** Votants blancs ou nuls du 1er tour : leur vote au 2nd tour n'est pas mesuré. */
  blankNull: { volume: number }
  /** Voix de chaque finaliste et ensemble des non-exprimés (sans les blancs et nuls du 1er tour), en % des inscrits. */
  totals: { a: number; b: number; nonExpressed: number }
}

/**
 * Flux bruts du 2nd tour, en % des inscrits, à partir du résultat `sr` (flux en points des exprimés du
 * 1er tour) et de la participation `participation` du 1er tour (% des inscrits).
 *
 * Abstention au 1er tour : 100 − P ; blancs et nuls : P × bnShare ; exprimés : E1 = P − blancs et nuls ;
 * k = E1 ÷ 100 convertit les points en % des inscrits. Les nouveaux votants sont N = rAbs × abstention ;
 * comme `sr` est un solde net, ils sont déjà déduits des départs : on ajoute à chaque électorat un taux de
 * départ uniforme u = N ÷ X (X : exprimés du 2nd tour), de sorte que les voix de chaque finaliste, N réparti
 * comme l'ensemble des votants compris, restent `sr.votes × k`. Le score en % des exprimés ne change pas.
 */
export function grossFlows(sr: SecondRoundResult, participation: number, rates: NewVoterRates): GrossFlows {
  const abstention1 = 100 - participation
  const blankNull1 = participation * rates.bnShare
  const expressed1 = participation - blankNull1
  const k = expressed1 / 100
  const voters = sr.votes.a + sr.votes.b
  const expressed2 = voters * k
  const newVoters = rates.rAbs * abstention1
  const u = expressed2 > 0 ? newVoters / expressed2 : 0

  const flows = sr.flows.map((f) => ({
    ...f,
    share: f.share * k,
    toA: f.toA * k * (1 - u),
    toB: f.toB * k * (1 - u),
    abstention: f.abstention * k + (f.toA + f.toB) * k * u,
  }))
  const toA = voters > 0 ? (newVoters * sr.votes.a) / voters : newVoters / 2
  const toB = newVoters - toA
  const abstainers = { volume: abstention1, toA, toB, nonExpressed: abstention1 - newVoters }
  const sum = (key: 'toA' | 'toB' | 'abstention') => flows.reduce((t, f) => t + f[key], 0)

  return {
    participation,
    abstention1,
    blankNull1,
    expressed1,
    scale: k,
    expressed2,
    newVoters,
    addedDeparture: u,
    flows,
    abstainers,
    blankNull: { volume: blankNull1 },
    totals: { a: sum('toA') + toA, b: sum('toB') + toB, nonExpressed: sum('abstention') + abstainers.nonExpressed },
  }
}
