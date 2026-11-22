import type { Reference2022, SecondRoundDropoutData } from './types'

/**
 * Statistiques de référence sur les nouveaux votants du 2nd tour (abstentionnistes du 1er tour qui votent
 * au 2nd) et les blancs/nuls du 1er tour, calculées à partir des enquêtes Ifop 2022, Insee 2017–2022 et
 * des résultats officiels de 2022.
 *
 * Ces taux servent à paramétrer et documenter le moteur unifié en flux bruts (`computeSecondRound`).
 */

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
  /** Part des abstentionnistes du 1er tour qui votent pour un finaliste en 2022 (0 à 1). */
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

function abstainerVotes(data: NewVoterData, delta: number): number {
  const { ifop2022 } = data.secondRoundDropout.newVoters
  return ifop2022.abstainedFirstRound.reduce((total, s) => {
    const votes = data.reference2022.secondRound.candidates.find((c) => c.id === s.id)?.votes ?? 0
    return total + (Math.max(0, s.share + delta) * votes) / 100
  }, 0)
}

/**
 * Taux de référence calculés depuis l'Ifop 2022 et les résultats officiels de 2022 :
 * - `rAbs` = (part des abstentionnistes chez chaque finaliste × ses voix T2) ÷ abstentionnistes T1 ;
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
