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
  /** Vrai dès que ≥ 3 instituts publient dans la section « liste officielle » des candidats. */
  officialList?: boolean
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
  secondRound: SecondRoundOfficial & { candidates: SecondRoundCandidateVotes[] }
}

/** 2012 : 2nd tour Hollande–Sarkozy (sans RN), blancs et nuls publiés en un seul total. */
export interface Reference2012 extends PastElectionReference {
  secondRound: {
    registered: number
    voters: number
    blankOrInvalid: number
    expressed: number
    candidates: SecondRoundCandidateVotes[]
    source: SourceLink
  }
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
  /** Date ISO (AAAA-MM-JJ) de la dernière mise à jour manuelle des matrices déclarées. */
  updatedAt?: string
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

export type PollBiasPhase = 'avantPremierTour' | 'entreDeuxTours'

export interface PollBiasPoll {
  institute: string
  end: string
  phase: PollBiasPhase
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

export interface BetweenRoundsElectionSummary {
  year: number
  duel: string
  electionDate: string
  secondRoundDate: string
  result: { antiRn: number; rn: number; source: SourceLink }
  listSource: SourceLink
  polls: PollBiasPoll[]
  pollCount: number
  /** Moyenne de l'opposant au RN sur l'ensemble des sondages d'entre-deux-tours (%). */
  meanAntiRn: number
  /** Écart résultat − moyenne (points) pour l'opposant au RN. */
  meanGap: number
  /** Dernière date de fin de terrain avant l'interdiction légale (ISO). */
  lastDayDate: string
  lastDayCount: number
  /** Moyenne de l'opposant au RN sur les sondages du dernier jour avant interdiction (%). */
  lastDayMeanAntiRn: number
  /** Écart résultat − moyenne du dernier jour (points) pour l'opposant au RN. */
  lastDayGap: number
}

// ——— Sondages de circonscription des législatives 2024 (P4, affichage seulement) ———

export interface LegislativeDuelCandidate2024 {
  name: string
  /** Appartenance partisane stricte, sourcée candidat par candidat (jamais la seule nuance officielle). */
  party: string
  officialNuance: string
  partySource: SourceLink
  pollScore: number
  officialScore: number
}

export interface LegislativeDuelPoll2024 {
  id: string
  constituencyCode: string
  constituencyLabel: string
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  sampleNote?: string
  url: string
  officialResultSource: SourceLink
  /** Duel uniquement (exactement 2 candidats ; triangulaires exclues). */
  candidates: [LegislativeDuelCandidate2024, LegislativeDuelCandidate2024]
}

export interface LegislativeDuelPolls2024Data {
  description: string
  inventoryNote: string
  electionDates: { firstRound: string; secondRound: string }
  /** Correspondance explicite candidat 2027 → parti canonique (null si sans parti unique). Jamais déduite. */
  candidateParties: Record<CandidateId, string | null>
  polls: LegislativeDuelPoll2024[]
}

export interface LegislativeDuelMatch {
  poll: LegislativeDuelPoll2024
  /** Candidat législatif 2024 appartenant strictement au parti du candidat A du duel affiché. */
  candidateA: LegislativeDuelCandidate2024
  /** Candidat législatif 2024 appartenant strictement au parti du candidat B du duel affiché. */
  candidateB: LegislativeDuelCandidate2024
  /** Écart résultat − sondage (en points) pour le parti du candidat A. */
  gapA: number
}

// ——— Matrices brutes de reports de référence 2017 et 2022 (P1) ———

export type ReferenceMatrixYear = '2017' | '2022'

export type SurveyTiming = 'before' | 'electionDay' | 'after'

export interface ReferenceMatrixSurvey {
  id: string
  year: 2017 | 2022
  institute: 'Ipsos Sopra Steria' | 'Ifop-Fiducial'
  fieldwork: Fieldwork
  /** Réalisation avant le scrutin, le jour du scrutin ou après le scrutin. */
  timing: SurveyTiming
  sampleSize: number
  mode: string
  /** Description du redressement, ou null s'il n'est pas documenté. */
  weighting: string | null
  note?: string
  url: string
  noticeUrl?: string
  pdfPage: number
  printedPage: number | null
  participationPdfPage?: number
  participationPrintedPage?: number | null
}

/** Triplet brut de report d'un électorat du 1er tour (% des électeurs du candidat). */
export interface ReferenceTransferTriplet {
  antiRn: number
  rn: number
  nonExpressed: number
}

export interface ReferenceMatrixRow {
  candidateId: CandidateId
  /** Valeurs brutes publiées par identifiant d'enquête (null si la ligne n'est pas publiée). */
  bySurvey: Record<string, ReferenceTransferTriplet | null>
}

export interface ReferenceParticipationTable {
  surveyId: string
  pdfPage: number
  printedPage: number | null
  /** Taux d'abstention au 2nd tour (% des électeurs du candidat au 1er tour) tel que publié par l'Ifop. */
  abstentionPctByCandidate: Record<CandidateId, number>
}

export interface ReferenceAbstainersPartialRow {
  surveyId: string
  turnoutPdfPage: number
  turnoutPrintedPage: number | null
  expressedPdfPage: number
  expressedPrintedPage: number | null
  /** Part des abstentionnistes du 1er tour déclarant voter au 2nd (%). */
  votersSharePct: number
  /** Répartition exprimée au 2nd tour parmi les abstentionnistes du 1er tour qui votent (%). */
  expressedSplit: { antiRn: number; rn: number }
}

export interface SecondRoundReferenceMatricesData {
  description: string
  surveys: ReferenceMatrixSurvey[]
  rows: Record<ReferenceMatrixYear, ReferenceMatrixRow[]>
  participation: Record<ReferenceMatrixYear, ReferenceParticipationTable>
  abstainers: {
    '2022': ReferenceAbstainersPartialRow
  }
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
  reference2012: Reference2012
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

export type RepublicanFrontBloc = 'gauche' | 'centre' | 'droite'

export const REPUBLICAN_FRONT_BLOCS: readonly RepublicanFrontBloc[] = ['gauche', 'centre', 'droite']

export type RepublicanFrontPreset = 'pres2022' | 'midpoint' | 'leg2024' | 'uncertain'

export interface RepublicanFrontSettings {
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les électeurs de gauche éliminés (y compris gauche hors LFI en duel LFI – RN). */
  gauche: number
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les électeurs du centre éliminés. */
  centre: number
  /** Position entre Présidentielle 2022 (0) et Législatives 2024 (1) pour les électeurs de droite éliminés. */
  droite: number
  /**
   * Préréglage « incertain » (v2.2) : à chaque itération Monte-Carlo, un tirage uniforme commun U[0 ; 1] fixe la
   * position du front pour les 3 électorats à la fois ; l'affichage déterministe utilise 0,5. Absent ou `false` :
   * comportement inchangé.
   */
  uncertain?: boolean
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
  /** Position du front républicain entre Présidentielle 2022 (0) et Législatives 2024 (1) par électorat qui se reporte. */
  republicanFront: RepublicanFrontSettings
  /** Plage d'incertitude [min, max] (%) tirée dans Monte-Carlo autour du taux actif pour le report gauche hors LFI → Mélenchon. */
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
  /** Tirages bruts du score de 1er tour par candidat (uniquement si `returnSamples` est demandé ; non triés). */
  firstRoundSamples?: Record<CandidateId, Float64Array>
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
  /** Duels alternatifs sélectionnables (> 30 % des simulations, plus le top 2 déterministe). */
  selectableDuels: { id: string; a: CandidateId; b: CandidateId; frequency: number; result: SecondRoundResult }[]
  secondRoundPollBias: PollBiasGap[]
  monteCarlo: MonteCarloSummary
  warnings: string[]
}
