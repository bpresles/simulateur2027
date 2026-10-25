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
  /**
   * Petit candidat : testé dans une partie des hypothèses seulement. Il n'est jamais requis et compte pour
   * 0 % dans une hypothèse qui ne le teste pas. Au 2nd tour, ses électeurs se reportent comme ceux de
   * candidats principaux : première répartition par défaut, les autres au choix dans les réglages.
   */
  minor?: { transfers: MinorTransfer[] }
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

/**
 * Lien d'un sondage : synthèse publiée par l'institut, notice déposée à la Commission des sondages, ou autre
 * lien sans type (publication reprise par Wikipedia, page Wikipedia).
 */
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

/**
 * Provenance d'un sondage : saisie manuelle ou flux synchronisé automatiquement. « wikipedia » est
 * provisoire : la reprise est remplacée dès qu'une compilation des notices officielles publie le sondage.
 */
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
  /**
   * Jamais lue dans les hypothèses des sondages, dont la lecture serait ambiguë (sans Retailleau, ses
   * électeurs ne vont pas tous vers Le Pen) : toujours estimée, avec l'option des alliances non évaluées.
   */
  estimatedOnly?: boolean
}

/**
 * Personnes interrogées qui n'expriment d'intention de vote pour aucun des deux candidats d'un duel
 * (indécis, vote blanc ou nul, abstention), écartées des pourcentages publiés.
 */
export interface NoIntention {
  /** En % de la base. */
  share: number
  /** Ensemble des inscrits interrogés, ou seulement ceux qui comptent voter (les autres ne sont pas interrogés). */
  base: 'inscrits' | 'votants'
  /** Dont indécis (« ne sait pas »), quand l'institut les distingue du vote blanc ou nul. */
  undecided?: number
  /**
   * Part non publiée telle quelle, calculée d'après la notice (effectifs, ou vote blanc ou nul et abstention
   * publiés séparément) : détail du calcul.
   */
  calculation?: string
  source: SourceLink
}

export interface SecondRoundPoll {
  /** « wikipedia » pour une reprise provisoire ; absent : Mieux Voter ou saisie manuelle. */
  origin?: PollOrigin
  institute: string
  sponsor: string
  fieldwork: Fieldwork
  sampleSize: number
  url: string
  scores: Record<CandidateId, number>
  /**
   * Saisie à la main d'après la notice ou le rapport de l'institut (la page Wikipedia ne la donne pas) ;
   * la synchronisation la garde tant que le duel reste sur la page.
   */
  noIntention?: NoIntention
}

export interface PollsData {
  asOf: string
  /** Date prévue du 1er tour, pour situer la base dans le temps (distance au scrutin). */
  electionDate: string
  windowDays: number
  /**
   * Période de la page Wikipedia d'où viennent les sondages : quand elle est indiquée, elle remplace la
   * fenêtre glissante (dernier sondage de chaque institut terminé depuis son premier jour).
   */
  period?: { label: string; start: string }
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

/** Sondage de la campagne 2021-2022, avec toutes ses hypothèses (plusieurs candidats LR testés). */
export interface CampaignPoll {
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
  /**
   * Sondages décochés pour la base du 1er tour (identifiants). Tous les autres sont retenus, y compris
   * ceux publiés plus tard : un seul coché sert tel quel, deux ou plus sont moyennés.
   */
  excludedPolls: string[]
  /** Projette les derniers sondages avant le vote selon la progression observée en 2022. */
  progressionEnabled: boolean
  /** 1 = 100 % de la progression 2022 (reproduite à l'identique). */
  progressionIntensity: number
  correctionsEnabled: boolean
  /** 1 = 100 % de la correction 2022. */
  correctionIntensity: number
  /** Corrections manuelles en points, qui remplacent la correction calculée. */
  correctionOverrides: Record<CandidateId, number>
  /** Référence composite à deux candidats : poids du second (0 à 1), qui remplace celui des données. */
  referenceBlend: Record<CandidateId, number>
  alliances: Record<string, boolean>
  /** Option : permettre des alliances qu'aucun sondage ne teste, estimées par les reports de 2024. */
  untestedAlliances: boolean
  /**
   * Alliance estimée : part des électeurs du candidat rallié qui suit le leader (0 à 1).
   * Absente = taux constaté aux législatives 2024.
   */
  allianceOverrides: Record<string, number>
  transferOverrides: Partial<Record<ProfileId, Partial<Record<Bloc, TransferValues>>>>
  /** Répartition choisie pour les électeurs de chaque petit candidat (identifiant), absente = la première. */
  minorTransfers: Record<CandidateId, string>
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

export type PollStatus = 'used' | 'superseded' | 'excluded' | 'out-of-window' | 'no-matching-hypothesis'

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
  /** Progression de la référence 2022 entre la même distance du scrutin et les derniers sondages. */
  progressionRatio: number | null
  /** Facteur appliqué : 1 + (progression − 1) × intensité (null si la progression est désactivée). */
  progressionFactor: number | null
  /** Derniers sondages projetés (= base si la progression est désactivée), normalisés à 100. */
  projected: number
  ratio2022: number | null
  /** Références 2022 effectivement utilisées, avec leur poids (une seule le plus souvent). */
  references: ReferencePart[]
  defaultCorrection: number
  appliedCorrection: number
  isOverride: boolean
  /** Points de la moyenne brute prélevés pour les petits candidats ajoutés (0 sinon). */
  cededBase: number
  /** Points cédés après correction aux petits candidats ajoutés, déjà déduits de `corrected`. */
  ceded: number
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

/** Taux d'une alliance estimée, pour chaque candidat rallié. */
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
  /** Petit candidat éliminé : électorats principaux dont ses électeurs suivent les reports. */
  like?: ReferencePart[]
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
  /**
   * Hypothèses retenues par groupe de sondages : un seul groupe, sauf avec l'option des alliances non
   * évaluées quand certains sondages ne testent qu'une partie des alliances (les autres y sont estimées).
   */
  hypothesisGroups: {
    set: HypothesisSet
    /** Alliances lues dans les hypothèses de ces sondages. */
    allianceIds: string[]
    /** Alliances estimées pour ces sondages (reports 2024). */
    estimatedAllianceIds: string[]
    pollIds: string[]
  }[]
  /** Alliances lues dans les hypothèses d'au moins un groupe de sondages. */
  allianceIds: string[]
  /** Alliances estimées par les reports des législatives 2024 pour au moins un groupe (option). */
  estimatedAllianceIds: string[]
  /** Taux des alliances estimables (option activée), retenues ou non. */
  allianceRates: AllianceRate[]
  allianceLeaks: AllianceLeak[]
  pollUsage: PollUsage[]
  /** Sondages retenus, un par institut au plus (1 = sondage seul, sans moyenne). */
  institutesUsed: number
  firstRound: FirstRoundRow[]
  entrants: Entrant[]
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
