// Types du domaine : aucune dépendance à React ni au navigateur.

export type CandidateId = string
export type Bloc = 'gauche' | 'centre' | 'droite' | 'extreme_droite'
export const BLOCS: readonly Bloc[] = ['gauche', 'centre', 'droite', 'extreme_droite']

export type ProfileId = 'lfi_rn' | 'ecolo_ps_pcf_rn' | 'ensemble_rn' | 'lr_rn'

export interface Candidate {
  id: CandidateId
  name: string
  shortName: string
  party: string
  /** Bloc politique ; null : non classé (candidat ajouté par la synchronisation, à classer à la main). */
  bloc: Bloc | null
  /** Couleur sur fond clair et sur fond sombre (palette validée pour le daltonisme). */
  color: string
  colorDark: string
  /** Profil de reports à utiliser quand ce candidat affronte le RN au 2nd tour. */
  duelProfile: ProfileId | null
  isRN?: boolean
  /**
   * Petit candidat : testé dans une partie des hypothèses seulement, jamais requis par défaut.
   * Il n'entre dans l'offre de base que s'il est testé par au moins `MIN_MINOR_INSTITUTES` instituts distincts.
   */
  minor?: { transfers: MinorTransfer[] }
  /**
   * Ajouté automatiquement par la synchronisation : nom court, parti, bloc (non classé), couleurs et reports
   * (au prorata des électorats principaux) sont des valeurs par défaut, à compléter à la main avant de
   * retirer ce champ.
   */
  auto?: boolean
}

export interface ReferencePart {
  id: string
  weight: number
}

/** Répartition des électeurs d'un petit candidat entre les électorats de candidats principaux. */
export interface MinorTransfer {
  id: string
  label: string
  /** Électorats principaux et leurs poids (ramenés à un total de 1). */
  parts: ReferencePart[]
  /** Justification, affichée dans la méthodologie et les réglages. */
  note: string
  sources?: SourceLink[]
}

export interface OtherCandidate {
  id: CandidateId
  name: string
}

export interface Fieldwork {
  start: string // ISO AAAA-MM-JJ
  end: string
}

export interface SourceLink {
  label: string
  url: string
}

export interface PollSource extends SourceLink {
  kind?: 'synthese' | 'notice'
}

export interface Hypothesis {
  id: string
  label?: string
  scores: Record<CandidateId, number>
  /**
   * Candidat testé à la place d'un autre (même colonne sur Wikipedia, ex. Hollande à la place de
   * Glucksmann) : l'hypothèse ne mesure pas un retrait de ce dernier.
   */
  replacing?: Record<CandidateId, CandidateId>
}

export type PollOrigin = 'manuel' | 'mieuxvoter' | '2027etmoi' | 'wikipedia'

export interface Poll {
  id: string
  origin?: PollOrigin
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  sources: PollSource[]
  verified?: string
  note?: string
  hypotheses: Hypothesis[]
}

export interface HypothesisSet {
  id: string
  label: string
  description: string
  default?: boolean
  require: CandidateId[]
  exclude: CandidateId[]
}

export interface Alliance {
  id: string
  label: string
  description?: string
  members: CandidateId[]
  /** Candidat que rejoignent les autres membres : il doit être testé dans les hypothèses retenues. */
  leader: CandidateId
}

export interface NoIntention {
  share: number
  base: 'inscrits' | 'votants'
  undecided?: number
  calculation?: string
  source: SourceLink
}

export interface SecondRoundPoll {
  origin?: PollOrigin
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  scores: Record<CandidateId, number>
  noIntention?: NoIntention
}

export interface PollsData {
  asOf: string
  electionDate: string
  windowDays: number
  period?: { label: string; start: string }
  collection: { description: string; sources: SourceLink[] }
  candidates: Candidate[]
  otherCandidates: OtherCandidate[]
  hypothesisSets: HypothesisSet[]
  alliances: Alliance[]
  polls: Poll[]
  secondRoundPolls: SecondRoundPoll[]
}

/** Vague de sondage historique agrégée (pour la courbe d'évolution 2025–2027 et la tendance amortie). */
export interface HistoricalPoll {
  id: string
  institute: string
  fieldwork: Fieldwork
  sampleSize: number
  /** Scores moyens normalisés sur les candidats simulés testés dans ce sondage. */
  scores: Record<CandidateId, number>
}

export interface PollHistoryData {
  description: string
  polls: HistoricalPoll[]
}

// ——— Données des scrutins passés (backtest & calibrage de la variance) ———

export interface ReferenceCandidate {
  id: string
  name: string
  votes: number
}

export interface ReferencePoll {
  institute: string
  sponsor?: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  scores: Record<string, number>
}

export interface CampaignPoll {
  institute: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  hypotheses: Hypothesis[]
}

export interface PastElectionReference {
  electionDate: string
  windowDays: number
  description: string
  resultsSource: SourceLink
  pollsSource: SourceLink
  expressed: number
  registered: number
  voters: number
  candidates: ReferenceCandidate[]
  polls: ReferencePoll[]
  campaignPolls: {
    description: string
    windowDays: number
    require: string[]
    exclude: string[]
    otherCandidates: OtherCandidate[]
    source: SourceLink
    polls: CampaignPoll[]
  }
}

export interface SecondRoundOfficial {
  registered: number
  voters: number
  blank: number
  invalid: number
  expressed: number
  source: SourceLink
}

export interface SecondRoundCandidateVotes {
  id: CandidateId
  votes: number
}

export interface Reference2022 extends PastElectionReference {
  secondRound: SecondRoundOfficial & { candidates: SecondRoundCandidateVotes[] }
}

export interface Reference2017 extends PastElectionReference {
  secondRound: SecondRoundOfficial
}

// ——— Reports de voix du 2nd tour ———

export type ProvenanceId =
  | 'franceinfo'
  | 'publicsenat'
  | 'lcp'
  | 'presidentielles2017_2022'
  | 'presidentielles2007_2012'
  | 'declare2027'
  | 'derive'
  | 'transpose'
  | 'camp'
  | 'hypothese'

export interface TransferValues {
  finalist: number
  rn: number
  abstention: number
}

export interface TransferRow extends TransferValues {
  camp?: 'finalist' | 'rn'
  provenance: Record<keyof TransferValues, ProvenanceId>
  note?: string
}

export interface TransferProfile {
  id: ProfileId
  label: string
  sourceDuel: string
  rows: Record<Bloc, TransferRow>
}

export interface ProvenanceSource {
  label: string
  description: string
  url?: string
}

/** Fidélité d'un électorat de finaliste au 2nd tour (total 100 %). */
export interface FidelitySplit {
  loyal: number
  cross: number
  abstention: number
}

export interface FidelityConfig {
  default: FidelitySplit
  byCandidate: Record<CandidateId, FidelitySplit>
  note: string
}

export interface NonRnLeftRightRow {
  left: number
  right: number
  abstention: number
}

export interface TransfersData {
  sources: Record<ProvenanceId, ProvenanceSource>
  completionRule: string
  fidelity: FidelityConfig
  presidentialCenterRn: {
    description: string
    defaultWeight: number
    elections: Record<'2017' | '2022', Record<Bloc, TransferValues>>
    rows: Record<Bloc, TransferRow>
  }
  profiles: TransferProfile[]
  nonRnPresidential: {
    description: string
    leftVsCenterRight: Record<Bloc, NonRnLeftRightRow>
    sameSide: {
      abstention: Record<Bloc, number>
      affinity: Record<Bloc, Record<Bloc, number>>
    }
  }
}

export interface DeclaredTransferRow extends TransferValues {
  camp?: 'finalist' | 'rn'
  note?: string
}

export interface DeclaredTransfersData {
  description: string
  sources: SourceLink[]
  logitCorrection: {
    description: string
    deltaFinalist: number
    deltaRn: number
  }
  profiles: Record<ProfileId, Record<Bloc, DeclaredTransferRow>>
}

// ——— Abandon historique, nouveaux votants & agrégats 2024 ———

export interface PresidentialRound {
  registered: number
  voters: number
  expressed: number
  source: SourceLink
}

export interface PresidentialDuel {
  year: number
  duel: string
  rn: boolean
  firstRound: PresidentialRound
  secondRound: PresidentialRound
}

/** Totaux agrégés d'un type de duel des législatives 2024 (contrôle de cohérence). */
export interface Aggregated2024Profile {
  label: string
  finalistBlocs: Bloc[]
  constituenciesCount: number
  firstRoundExpressed: number
  secondRoundExpressed: number
  secondRoundVotes: { finalist: number; rn: number }
  firstRoundVotesByBloc: Record<Bloc, number>
}

export interface FinalistShare {
  id: CandidateId
  share: number
}

export interface InseeTurnoutPattern {
  year: number
  bothRounds: number
  firstOnly: number
  secondOnly: number
  neither: number
  scope: string
  source: SourceLink
}

export interface NewVotersData {
  description: string
  ifop2022: {
    description: string
    source: SourceLink & { pages: string }
    abstainedFirstRound: FinalistShare[]
    abstainersVote: FinalistShare[]
    allVotersVote: FinalistShare[]
    abstainersWhoVotedShare: number
    roundingMargin: number
  }
  insee: InseeTurnoutPattern[]
  legislatives2024: {
    constituencies: number
    votersFirstRound: number
    votersSecondRound: number
    expressedFirstRound: number
    expressedSecondRound: number
    note: string
    sources: SourceLink[]
  }
  blankNullNote: string
}

export interface SecondRoundDropoutData {
  description: string
  newVoters: NewVotersData
  presidential: { description: string; elections: PresidentialDuel[] }
  legislatives2024: {
    description: string
    method: string
    nuanceBlocs: Record<Bloc, string[]>
    sources: SourceLink[]
    profiles: Record<ProfileId, Aggregated2024Profile>
  }
}

export interface PollBiasPoll {
  institute: string
  end: string
  antiRn: number
  rn: number
  url: string
}

export interface PollBiasElection {
  year: number
  duel: string
  electionDate: string
  secondRoundDate: string
  result: { antiRn: number; rn: number; source: SourceLink }
  listSource: SourceLink
  polls: PollBiasPoll[]
}

export interface SecondRoundPollBiasData {
  description: string
  elections: PollBiasElection[]
}

export interface PollBiasGap {
  year: number
  duel: string
  pollCount: number
  estimate: number
  nearest: { institute: string; end: string; distance: number } | null
  result: number
  gap: number
}

export interface SimulationData {
  polls: PollsData
  pollHistory: PollHistoryData
  reference2022: Reference2022
  reference2017: Reference2017
  transfers: TransfersData
  declaredTransfers: DeclaredTransfersData
  secondRoundDropout: SecondRoundDropoutData
  secondRoundPollBias: SecondRoundPollBiasData
}

// ——— Projection temporelle vers avril/mai 2027 ———

export interface BlocUsefulVote {
  /** Intensité du vote utile dans ce bloc (0 = aucun, 1 = concentration historique 2017–2022). */
  intensity: number
  /** Candidat pivot qui capte le vote utile du bloc, ou `'auto'` (candidat en tête du bloc). */
  beneficiary: CandidateId | 'auto'
}

export interface CampaignProjectionSettings {
  /** Active la projection vers le 1er tour d'avril 2027 (false = photographie actuelle). */
  enabled: boolean
  /** Réglage séparé du vote utile par bloc politique. */
  usefulVote: Record<Bloc, BlocUsefulVote>
  /** Regrouper centre et droite dans un pôle commun de vote utile (scénario type 2022). */
  mergeCenterRight: boolean
  /** Amortissement léger des écarts de blocs précoces vers les fondamentaux (0 à 1, défaut : 0,5). */
  meanReversion: number
  /** Poids de la tendance récente amortie sur 21 jours (0 à 1, défaut : 0,5, plafonnée à ±2,5 pts). */
  dampedTrend: number
}

// ——— Réglages de l'utilisateur ———

export type TransferSource = 'legislatives2024' | 'blend' | 'declared2027'

export type RepublicanFrontFamily = 'centerRight' | 'moderateLeft' | 'lfi'

export const REPUBLICAN_FRONT_FAMILIES: readonly RepublicanFrontFamily[] = ['centerRight', 'moderateLeft', 'lfi']

export type RepublicanFrontPreset = 'pres2022' | 'midpoint' | 'leg2024'

export interface RepublicanFrontSettings {
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les duels Centre / Droite – RN. */
  centerRight: number
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les duels Gauche modérée – RN. */
  moderateLeft: number
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les duels LFI – RN. */
  lfi: number
}

export interface Settings {
  /** Sondages décochés pour la base du 1er tour (identifiants). */
  excludedPolls: string[]
  /** Alliances testées par les sondeurs actives. */
  alliances: Record<string, boolean>
  /** Projeter les sondages ne testant pas exactement l'offre via paires propres intra-institut (défaut : true). */
  offerProjectionEnabled: boolean
  /** Projection temporelle vers le 1er tour d'avril 2027 (vote utile par bloc, amortissement, tendance). */
  projection: CampaignProjectionSettings
  /**
   * Source des reports au 2nd tour pour les duels face au RN :
   * - `legislatives2024` (défaut) : base historique interpolée entre Présidentielle 2022 (0 %) et Législatives 2024 (100 %) ;
   * - `blend` : mélange pondéré entre base historique et déclarations 2027 corrigées en logit ;
   * - `declared2027` : déclarations 2027 corrigées en logit seules.
   */
  transferSource: TransferSource
  /** Poids des déclarations 2027 dans le mode `blend` (0 à 1, défaut : 0,5). */
  declaredWeight: number
  /** Position du front républicain entre Présidentielle 2022 (0) et Législatives 2024 (1) par famille de duel. */
  republicanFront: RepublicanFrontSettings
  /**
   * Report central (%) des électeurs de gauche hors LFI vers Mélenchon en duel LFI – RN (35 à 75 %,
   * défaut : 72 % = repère NFP 2024 ; 36 % = déclarations 2027 corrigées).
   */
  lfiLeftTransfer: number
  /** Plage d'incertitude [min, max] (%) tirée uniformément dans Monte-Carlo pour le report gauche hors LFI → Mélenchon. */
  lfiLeftTransferRange: [number, number]
  /** Intégrer l'incertitude des scénarios de candidatures testés (Attal, Lisnard, Retailleau, Philippe) dans Monte-Carlo. */
  candidacyUncertaintyEnabled: boolean
  /** Surcharges manuelles des lignes de reports. */
  transferOverrides: Partial<Record<ProfileId, Partial<Record<Bloc, TransferValues>>>>
  /** Répartition choisie pour les électeurs de chaque petit candidat. */
  minorTransfers: Record<CandidateId, string>
  /** Fidélité uniforme manuelle (0 à 1), null = fidélité différenciée par finaliste des données. */
  fidelity: number | null
  /** Participation au 1er tour (% des inscrits, défaut : 74). */
  firstRoundTurnout: number
  /** Part des abstentionnistes du 1er tour qui votent valablement au 2nd (0 à 1, défaut : 0,20). */
  abstainerMobilization: number
  /** Part de référence des nouveaux votants allant à l'adversaire du RN (0 à 1, défaut : 0,55 ; 0,50 hors RN). */
  abstainerAntiRnShare: number
  /** Duel affiché parmi les duels plausibles (identifiant `idA|idB`), null = duel du top 2 déterministe. */
  selectedDuel: string | null
}

// ——— Résultats ———

export interface ImputationDonors {
  parts: ReferencePart[]
  pairs: { institute: string; without: string; with: string }[]
}

export type PollStatus = 'used' | 'superseded' | 'excluded' | 'out-of-window' | 'no-matching-hypothesis'

export interface PollUsage<P = Poll> {
  poll: P
  status: PollStatus
  matchedHypotheses: string[]
  /** Poids relatif de ce sondage dans la moyenne pondérée (0 si non utilisé). */
  weight: number
  /** Part en % du poids total (0 à 100). */
  weightShare: number
  /** Vrai si l'hypothèse a été projetée vers l'offre cible via paires propres intra-institut. */
  projected: boolean
  /** Description courte des opérations de projection appliquées (ex. « +Attal, +Lisnard »). */
  projectionSteps: string[]
  /** Moyenne des hypothèses retenues (ou projetées), renormalisée à 100. */
  average: Record<CandidateId, number> | null
}

export interface FirstRoundRow {
  candidateId: CandidateId
  /** Score actif du 1er tour (photographie actuelle ou projection avril 2027), normalisé à 100. */
  score: number
  /** Moyenne pondérée actuelle des sondages (avant éventuelle projection temporelle). */
  currentScore: number
}

export interface PoleConcentration {
  pole: 'gauche' | 'centre' | 'droite' | 'centre_droite' | 'extreme_droite'
  beneficiary: CandidateId | null
  totalBefore: number
  totalAfter: number
  shareBefore: number
  shareAfter: number
  targetShare: number
  saturated: boolean
}

export interface CandidateProjectionDelta {
  candidateId: CandidateId
  current: number
  usefulVoteDelta: number
  reversionDelta: number
  trendDelta: number
  projected: number
}

export interface CampaignProjectionResult {
  enabled: boolean
  daysRemaining: number
  horizonFactor: number
  byCandidate: Record<CandidateId, CandidateProjectionDelta>
  poles: PoleConcentration[]
  projectedScores: Record<CandidateId, number>
}

export interface TrajectoryPoint {
  date: string
  kind: 'history' | 'now' | 'projection'
  scores: Record<CandidateId, number>
  /** Bornes à 80 % (P10 et P90) pour les points présents et futurs. */
  p10?: Record<CandidateId, number>
  p90?: Record<CandidateId, number>
}

export interface CampaignTrajectoryData {
  asOf: string
  electionDate: string
  /** Candidats suivis sur le graphique (classés par score décroissant). */
  trackedIds: CandidateId[]
  historyPollCount: number
  points: TrajectoryPoint[]
}

export interface Entrant {
  id: CandidateId
  score: number
}

export interface ProfileWeight {
  profileId: ProfileId
  weight: number
}

export interface ResolvedDuel {
  kind: 'rn-sourced' | 'non-rn-presidential' | 'non-rn-same-side'
  challengerId: CandidateId | null
  rnId: CandidateId | null
  profileWeights: ProfileWeight[]
}

/** Flux d'un électorat du 1er tour au 2nd tour, en % des inscrits. */
export interface VoteFlow {
  candidateId: CandidateId
  /** Électorat au 1er tour en % des inscrits (= score T1 × E1 / 100). */
  share: number
  /** Score au 1er tour en % des exprimés. */
  firstRoundPct: number
  toA: number
  toB: number
  abstention: number
  bloc: Bloc | null
  isFinalistVoter: boolean
  like?: ReferencePart[]
}

/** Flux d'un groupe du 1er tour qui n'est pas un électorat de candidat, en % des inscrits. */
export interface GroupFlow {
  volume: number
  toA: number
  toB: number
  nonExpressed: number
}

export interface SecondRoundResult {
  a: CandidateId
  b: CandidateId
  duel: ResolvedDuel
  /** Scores en % des suffrages exprimés du 2nd tour (total 100). */
  pct: { a: number; b: number }
  /** Flux bruts unifiés en % des inscrits (A + B + nonExpressed + blankNull1 = 100). */
  participation: number
  abstention1: number
  blankNull1: number
  expressed1: number
  expressed2: number
  scale: number
  newVoters: number
  flows: VoteFlow[]
  abstainers: GroupFlow
  blankNull: { volume: number }
  totals: { a: number; b: number; nonExpressed: number }
  /** Fidélité effectivement appliquée à chaque finaliste. */
  fidelity: { a: FidelitySplit; b: FidelitySplit }
  /** Part effective des nouveaux votants attribuée à l'adversaire du RN (0,50 hors RN). */
  effectiveAbstainerAntiRnShare: number
  /** Position du front républicain (0 = Prés. 2022, 1 = Lég. 2024) appliquée à ce duel, ou null hors duel RN. */
  republicanFrontStrength: number | null
  /** Sensibilité du score RN au report gauche hors LFI → Mélenchon (uniquement pour un duel `lfi_rn`). */
  lfiLeftSensitivity?: {
    lowRate: number
    highRate: number
    rnAtLow: number
    rnAtHigh: number
    currentRate: number
  } | null
  /** Abandon net équivalent (1 − E2 / E1, en %) à titre de comparaison historique. */
  netDropout: number
  directPolls: SecondRoundPoll[]
}

// ——— Monte-Carlo & incertitude ———

export interface CandidateUncertainty {
  candidateId: CandidateId
  median: number
  p10: number
  p90: number
  qualifProb: number
  winProb: number
}

export interface DuelUncertainty {
  id: string
  a: CandidateId
  b: CandidateId
  /** Part des simulations où ce duel survient (0 à 100). */
  frequency: number
  /** Part de ces duels gagnés par A (0 à 100). */
  aWinProb: number
  aScoreMedian: number
  aScoreP10: number
  aScoreP90: number
}

export interface MonteCarloSummary {
  iterations: number
  seed: number
  daysToElection: number
  /** Écart-type logit total au 1er tour à cet horizon. */
  sigmaLogit: number
  candidates: Record<CandidateId, CandidateUncertainty>
  /** Duels triés par fréquence décroissante (au moins 2 % des simulations). */
  topDuels: DuelUncertainty[]
  /** Distribution conditionnelle du duel actuellement affiché (calculée sur toutes les itérations). */
  displayedDuel: {
    a: CandidateId
    b: CandidateId
    aWinProb: number
    aScoreMedian: number
    aScoreP10: number
    aScoreP90: number
  }
}

export interface SimulationResult {
  hypothesisSet: HypothesisSet
  allianceIds: string[]
  pollUsage: PollUsage[]
  minorDonors: Record<CandidateId, ImputationDonors>
  /** Petits candidats inclus dans l'offre de base (≥ MIN_MINOR_INSTITUTES). */
  eligibleMinors: CandidateId[]
  /** Petits candidats écartés de la base faute d'être testés par assez d'instituts. */
  excludedMinors: CandidateId[]
  institutesUsed: number
  projectedInstitutes: number
  firstRound: FirstRoundRow[]
  entrants: Entrant[]
  projection: CampaignProjectionResult
  trajectory: CampaignTrajectoryData
  secondRound: SecondRoundResult
  /** Duels alternatifs sélectionnables (≥ 5 % des simulations ou top 2/3). */
  selectableDuels: { id: string; a: CandidateId; b: CandidateId; frequency: number; result: SecondRoundResult }[]
  secondRoundPollBias: PollBiasGap[]
  monteCarlo: MonteCarloSummary
  warnings: string[]
}
