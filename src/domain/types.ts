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
  bloc: Bloc
  /** Couleur sur fond clair et sur fond sombre (palette validée pour le daltonisme). */
  color: string
  colorDark: string
  /** Profil de reports à utiliser quand ce candidat affronte le RN au 2nd tour. */
  duelProfile: ProfileId | null
  /**
   * Référence 2022 pour la correction et la progression : un candidat de reference-2022.json, ou un
   * mélange pondéré de plusieurs (ratio = moyenne des ratios pondérée par les poids).
   */
  ref2022: string | ReferencePart[] | null
  /** Justification de la correspondance 2027 ↔ 2022, affichée dans la méthodologie. */
  ref2022Note?: string
  isRN?: boolean
}

export interface ReferencePart {
  id: string
  weight: number
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

export interface Hypothesis {
  id: string
  label?: string
  scores: Record<CandidateId, number>
}

export interface Poll {
  id: string
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  sources: SourceLink[]
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
  /** Leader fixe ; absent = le membre le mieux placé au 1er tour mène l'alliance. */
  leader?: CandidateId
}

export interface SecondRoundPoll {
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  scores: Record<CandidateId, number>
}

export interface PollsData {
  asOf: string
  /** Date prévue du 1er tour, pour situer la base dans le temps (distance au scrutin). */
  electionDate: string
  windowDays: number
  collection: { description: string; sources: SourceLink[] }
  candidates: Candidate[]
  otherCandidates: OtherCandidate[]
  hypothesisSets: HypothesisSet[]
  alliances: Alliance[]
  polls: Poll[]
  secondRoundPolls: SecondRoundPoll[]
}

export interface Reference2022Candidate {
  id: string
  name: string
  votes: number
}

export interface Reference2022Poll {
  institute: string
  sponsor?: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  scores: Record<string, number>
}

/** Sondage de l'automne 2021, avec toutes ses hypothèses (plusieurs candidats LR testés). */
export interface AutumnPoll {
  institute: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  hypotheses: Hypothesis[]
}

export interface Reference2022 {
  electionDate: string
  windowDays: number
  description: string
  resultsSource: SourceLink
  pollsSource: SourceLink
  /** Suffrages exprimés au 1er tour (base des pourcentages). */
  expressed: number
  /** Chiffres officiels du 2nd tour, base du calage de l'abstention. */
  secondRound: {
    registered: number
    voters: number
    blank: number
    invalid: number
    expressed: number
    source: SourceLink
  }
  candidates: Reference2022Candidate[]
  polls: Reference2022Poll[]
  /** Sondages réalisés à la même distance du scrutin que la base 2027, pour mesurer la progression. */
  autumnPolls: {
    description: string
    windowDays: number
    require: string[]
    exclude: string[]
    otherCandidates: OtherCandidate[]
    source: SourceLink
    polls: AutumnPoll[]
  }
}

export type ProvenanceId = 'franceinfo' | 'publicsenat' | 'lcp' | 'derive' | 'transpose' | 'camp' | 'hypothese'

export interface TransferValues {
  finalist: number
  rn: number
  abstention: number
}

export interface TransferRow extends TransferValues {
  /** Électorat rattaché au camp d'un finaliste : il suit le taux de fidélité au lieu des valeurs. */
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

export interface TransfersData {
  sources: Record<ProvenanceId, ProvenanceSource>
  completionRule: string
  defaultFidelity: number
  profiles: TransferProfile[]
  fallback: {
    description: string
    affinity: Record<Bloc, Record<Bloc, number>>
    abstention: Record<Bloc, number>
  }
}

export interface SimulationData {
  polls: PollsData
  reference2022: Reference2022
  transfers: TransfersData
}

/** Réglages de l'utilisateur. Seules les surcharges sont stockées, les défauts restent calculés. */
export interface Settings {
  hypothesisSetId: string | null
  /** Projette les derniers sondages avant le vote selon la progression observée en 2022. */
  progressionEnabled: boolean
  correctionsEnabled: boolean
  /** 1 = 100 % de la correction 2022. */
  correctionIntensity: number
  /** Corrections manuelles en points, qui remplacent la correction calculée. */
  correctionOverrides: Record<CandidateId, number>
  /** Référence composite à deux candidats : poids du second (0 à 1), qui remplace celui des données. */
  referenceBlend: Record<CandidateId, number>
  alliances: Record<string, boolean>
  /**
   * Part des électeurs du candidat rallié qui suit le leader (0 à 1), par alliance.
   * Absente = taux constaté aux législatives 2024.
   */
  allianceOverrides: Record<string, number>
  transferOverrides: Partial<Record<ProfileId, Partial<Record<Bloc, TransferValues>>>>
  /** Part des électeurs d'un finaliste qui revotent pour lui (0 à 1), null = valeur par défaut. */
  fidelity: number | null
  /** Cale le total des blancs, nuls et abstentions du 2nd tour sur une cible. */
  abstentionCalibration: boolean
  /** Cible en % des exprimés du 1er tour ; null = niveau réel du 2nd tour 2022. */
  abstentionTarget: number | null
  /** Qualification serrée : second tour affiché, avec le 2e (défaut) ou avec le 3e du 1er tour. */
  qualificationPick: 'second' | 'third'
}

// ——— Résultats ———

export type PollStatus = 'used' | 'superseded' | 'out-of-window' | 'no-matching-hypothesis'

export interface PollUsage<P = Poll> {
  poll: P
  status: PollStatus
  matchedHypotheses: string[]
  /** Moyenne des hypothèses retenues, renormalisée sur les candidats simulés. */
  average: Record<CandidateId, number> | null
}

export interface FirstRoundRow {
  candidateId: CandidateId
  /** Moyenne brute des sondages (normalisée à 100). */
  base: number
  /** Progression de la référence 2022 entre l'automne 2021 et les derniers sondages. */
  progressionRatio: number | null
  /** Derniers sondages projetés (= base si la progression est désactivée), normalisés à 100. */
  projected: number
  ratio2022: number | null
  /** Références 2022 effectivement utilisées, avec leur poids (une seule le plus souvent). */
  references: ReferencePart[]
  defaultCorrection: number
  appliedCorrection: number
  isOverride: boolean
  /** Score après corrections, normalisé à 100. */
  corrected: number
}

export interface EntrantMember {
  candidateId: CandidateId
  /** Contribution de ce membre au score de l'entrant (en points). */
  contribution: number
  weight: number
  /** Part des électeurs de ce membre qui suivent le leader (1 pour le leader lui-même). */
  rate: number
  /** Part des électeurs de ce membre qui votent pour le candidat RN (0 pour le leader). */
  rnRate: number
}

/** Taux d'alliance appliqué (ou applicable) à chaque candidat rallié d'une alliance. */
export interface AllianceRate {
  allianceId: string
  leaderId: CandidateId
  joining: {
    candidateId: CandidateId
    /** Parts (0 à 1) qui suivent le leader et qui votent RN ; le reste s'abstient. */
    leader: number
    rn: number
    /** Taux constaté en 2024, avant une éventuelle modification dans les réglages. */
    default2024: { leader: number; rn: number }
    /** Ligne de la grille 2024 utilisée, null si le leader n'a pas de profil de reports. */
    source: { profileId: ProfileId; bloc: Bloc } | null
    isOverride: boolean
  }[]
}

/** Électeurs d'un candidat rallié qui votent pour le candidat RN au lieu de suivre le leader. */
export interface AllianceLeak {
  from: CandidateId
  to: CandidateId
  points: number
}

/** Candidat présent au 1er tour après application des alliances. */
export interface Entrant {
  id: CandidateId
  /** Alliances appliquées à cet entrant (plusieurs si elles partagent le même leader). */
  allianceIds: string[]
  members: EntrantMember[]
  score: number
}

export interface ProfileWeight {
  profileId: ProfileId
  weight: number
}

export interface ResolvedDuel {
  kind: 'sourced' | 'fallback'
  /** Finaliste non RN dont le profil est utilisé (cas « sourced »). */
  challengerId: CandidateId | null
  rnId: CandidateId | null
  profileWeights: ProfileWeight[]
}

export interface VoteFlow {
  candidateId: CandidateId
  /** Électorat de ce candidat au 1er tour simulé, avant alliances (points). */
  share: number
  toA: number
  toB: number
  abstention: number
  bloc: Bloc
  isFinalistVoter: boolean
}

export interface SecondRoundResult {
  a: CandidateId
  b: CandidateId
  duel: ResolvedDuel
  votes: { a: number; b: number; abstention: number }
  pct: { a: number; b: number }
  flows: VoteFlow[]
  fidelity: number
  abstention: {
    /** Total avant calage, en points des électeurs du 1er tour (taux de report bruts). */
    uncalibrated: number
    /** Cible du calage, null si le calage est désactivé. */
    target: number | null
    /** Coefficient appliqué au taux d'abstention de chaque électorat. */
    factor: number
  }
  directPolls: SecondRoundPoll[]
}

export interface SimulationResult {
  hypothesisSet: HypothesisSet
  pollUsage: PollUsage[]
  institutesUsed: number
  firstRound: FirstRoundRow[]
  entrants: Entrant[]
  allianceRates: AllianceRate[]
  allianceLeaks: AllianceLeak[]
  qualification: {
    /** Écart entre le 2e et le 3e du 1er tour, en points (null s'il n'y a pas de 3e). */
    gap: number | null
    /** Écart inférieur au seuil : les deux seconds tours possibles sont simulés. */
    tight: boolean
    /** Second tour affiché quand la qualification est serrée. */
    picked: 'second' | 'third'
    /** 1er contre 2e. */
    withSecond: SecondRoundResult
    /** 1er contre 3e, calculé seulement si la qualification est serrée. */
    withThird: SecondRoundResult | null
  }
  /** Second tour affiché : 1er contre 2e, ou 1er contre 3e si la qualification est serrée et ce choix fait. */
  secondRound: SecondRoundResult
  warnings: string[]
}
