import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultSettings } from '../domain/simulate'
import type { Bloc, CandidateId, ProfileId, Settings, TransferValues } from '../domain/types'

interface SettingsActions {
  setPollIncluded: (pollId: string, included: boolean) => void
  includeAllPolls: () => void
  setProgressionEnabled: (enabled: boolean) => void
  setProgressionIntensity: (intensity: number) => void
  setCorrectionsEnabled: (enabled: boolean) => void
  setCorrectionIntensity: (intensity: number) => void
  /** `undefined` retire la surcharge et rétablit la correction calculée. */
  setCorrectionOverride: (id: CandidateId, points: number | undefined) => void
  /** `undefined` rétablit le dosage des données pour cette référence composite. */
  setReferenceBlend: (id: CandidateId, weight: number | undefined) => void
  setBlogBiasEnabled: (enabled: boolean) => void
  setBlogBiasIntensity: (intensity: number) => void
  setTransferCorrectionEnabled: (enabled: boolean) => void
  setTransferCorrectionIntensity: (intensity: number) => void
  setTurnoutEnabled: (enabled: boolean) => void
  /** `null` rétablit la participation attendue par défaut (la hausse des certains reportée sur 2022). */
  setTurnoutExpected: (expected: number | null) => void
  /** Remplace les alliances actives (celles qu'aucun sondage ne permet plus sont retirées). */
  setAlliances: (alliances: Record<string, boolean>) => void
  setUntestedAlliances: (enabled: boolean) => void
  setGroupedAlliances: (enabled: boolean) => void
  /** `undefined` rétablit le taux constaté en 2024 pour cette alliance estimée. */
  setAllianceOverride: (allianceId: string, share: number | undefined) => void
  setTransferOverride: (profile: ProfileId, bloc: Bloc, values: TransferValues | undefined) => void
  /** `undefined` rétablit la répartition par défaut des électeurs de ce petit candidat. */
  setMinorTransfer: (id: CandidateId, transferId: string | undefined) => void
  setFidelity: (fidelity: number | null) => void
  setAbstentionCalibration: (enabled: boolean) => void
  /** `null` rétablit le niveau réel du 2nd tour 2022. */
  setAbstentionTarget: (target: number | null) => void
  setQualificationPick: (pick: 'second' | 'third') => void
  resetCorrections: () => void
  resetTransfers: () => void
  resetAll: () => void
}

export type SettingsStore = Settings & SettingsActions

const STORAGE_KEY = 'simulateur2027:settings'
const STORAGE_VERSION = 10

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setPollIncluded: (pollId, included) =>
        set((s) => {
          const rest = s.excludedPolls.filter((id) => id !== pollId)
          return { excludedPolls: included ? rest : [...rest, pollId] }
        }),
      includeAllPolls: () => set({ excludedPolls: [] }),
      setProgressionEnabled: (progressionEnabled) => set({ progressionEnabled }),
      setProgressionIntensity: (progressionIntensity) => set({ progressionIntensity }),
      setCorrectionsEnabled: (correctionsEnabled) => set({ correctionsEnabled }),
      setCorrectionIntensity: (correctionIntensity) => set({ correctionIntensity }),
      setCorrectionOverride: (id, points) =>
        set((s) => {
          const { [id]: _, ...rest } = s.correctionOverrides
          return { correctionOverrides: points === undefined ? rest : { ...rest, [id]: points } }
        }),
      setReferenceBlend: (id, weight) =>
        set((s) => {
          const { [id]: _, ...rest } = s.referenceBlend
          return { referenceBlend: weight === undefined ? rest : { ...rest, [id]: weight } }
        }),
      setBlogBiasEnabled: (blogBiasEnabled) => set({ blogBiasEnabled }),
      setBlogBiasIntensity: (blogBiasIntensity) => set({ blogBiasIntensity }),
      setTransferCorrectionEnabled: (transferCorrectionEnabled) => set({ transferCorrectionEnabled }),
      setTransferCorrectionIntensity: (transferCorrectionIntensity) => set({ transferCorrectionIntensity }),
      setTurnoutEnabled: (turnoutEnabled) => set({ turnoutEnabled }),
      setTurnoutExpected: (turnoutExpected) => set({ turnoutExpected }),
      setAlliances: (alliances) => set({ alliances }),
      setUntestedAlliances: (untestedAlliances) => set({ untestedAlliances }),
      setGroupedAlliances: (groupedAlliances) => set({ groupedAlliances }),
      setAllianceOverride: (allianceId, share) =>
        set((s) => {
          const { [allianceId]: _, ...rest } = s.allianceOverrides
          return { allianceOverrides: share === undefined ? rest : { ...rest, [allianceId]: share } }
        }),
      setTransferOverride: (profile, bloc, values) =>
        set((s) => {
          const { [bloc]: _, ...rows } = s.transferOverrides[profile] ?? {}
          return {
            transferOverrides: { ...s.transferOverrides, [profile]: values ? { ...rows, [bloc]: values } : rows },
          }
        }),
      setMinorTransfer: (id, transferId) =>
        set((s) => {
          const { [id]: _, ...rest } = s.minorTransfers
          return { minorTransfers: transferId === undefined ? rest : { ...rest, [id]: transferId } }
        }),
      setFidelity: (fidelity) => set({ fidelity }),
      setAbstentionCalibration: (abstentionCalibration) => set({ abstentionCalibration }),
      setAbstentionTarget: (abstentionTarget) => set({ abstentionTarget }),
      setQualificationPick: (qualificationPick) => set({ qualificationPick }),
      resetCorrections: () => {
        const { correctionsEnabled, correctionIntensity, correctionOverrides, referenceBlend } = defaultSettings()
        set({ correctionsEnabled, correctionIntensity, correctionOverrides, referenceBlend })
      },
      resetTransfers: () =>
        set({
          transferOverrides: {},
          minorTransfers: {},
          fidelity: null,
          abstentionCalibration: true,
          abstentionTarget: null,
        }),
      resetAll: () => set(defaultSettings()),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Settings => ({
        excludedPolls: s.excludedPolls,
        progressionEnabled: s.progressionEnabled,
        progressionIntensity: s.progressionIntensity,
        correctionsEnabled: s.correctionsEnabled,
        correctionIntensity: s.correctionIntensity,
        correctionOverrides: s.correctionOverrides,
        referenceBlend: s.referenceBlend,
        blogBiasEnabled: s.blogBiasEnabled,
        blogBiasIntensity: s.blogBiasIntensity,
        turnoutEnabled: s.turnoutEnabled,
        turnoutExpected: s.turnoutExpected,
        alliances: s.alliances,
        untestedAlliances: s.untestedAlliances,
        groupedAlliances: s.groupedAlliances,
        allianceOverrides: s.allianceOverrides,
        transferCorrectionEnabled: s.transferCorrectionEnabled,
        transferCorrectionIntensity: s.transferCorrectionIntensity,
        transferOverrides: s.transferOverrides,
        minorTransfers: s.minorTransfers,
        fidelity: s.fidelity,
        abstentionCalibration: s.abstentionCalibration,
        abstentionTarget: s.abstentionTarget,
        qualificationPick: s.qualificationPick,
      }),
      // v1 → v2 : les lignes de reports ont changé de sens, leurs surcharges sont abandonnées.
      // ≤ v2 : l'alliance « philippe-glucksmann » avait un leader variable, son sens a changé.
      // ≤ v3 : le report d'alliance unique est remplacé par des taux par alliance (2024 par défaut).
      // ≤ v4 : le choix d'hypothèse « Philippe seul » devient l'alliance « Attal rejoint Philippe ».
      // ≤ v5 : les intensités passent de 100 % à 70 % par défaut ; une intensité restée à 100 % suit.
      // ≤ v6 : les alliances passent par les hypothèses des sondages ; leurs taux modifiés ne servent plus
      // qu'aux alliances non testées (option désactivée par défaut).
      // ≤ v7 : les intensités repassent à 100 % par défaut et seules les options du billet (biais et hausse de
      // participation) sont activées ; une intensité restée à 70 % et « Corriger la moyenne » resté activé
      // (anciens défauts) suivent.
      // ≤ v8 : l'intensité de la hausse de participation (7 points du billet) est remplacée par une
      // participation attendue (null = défaut) ; l'ancienne intensité est abandonnée.
      // ≤ v9 : l'option de correction des reports d'après les votes réels de 2024 est ajoutée (activée par
      // défaut, à 100 %) : les anciens réglages la reçoivent par défaut.
      // Le reste du scénario est conservé ; les nouveaux réglages prennent leur valeur par défaut.
      migrate: (persisted, version) => {
        if (version < 1 || version > 9) return defaultSettings()
        const {
          allianceEfficiency: _efficiency,
          hypothesisSetId,
          turnoutIntensity: _turnoutIntensity,
          ...old
        } = persisted as Partial<Settings> & {
          allianceEfficiency?: unknown
          hypothesisSetId?: string | null
          turnoutIntensity?: unknown
        }
        const { 'philippe-glucksmann': _dynamic, ...kept } = old.alliances ?? {}
        const alliances = version <= 2 ? kept : (old.alliances ?? {})
        return {
          ...defaultSettings(),
          ...old,
          alliances: hypothesisSetId === 'philippe-seul' ? { ...alliances, 'attal-philippe': true } : alliances,
          transferOverrides: version === 1 ? {} : (old.transferOverrides ?? {}),
          // Les anciens défauts (≤ v7) ne concernent pas les états de la v8, dont les valeurs sont délibérées.
          ...(version <= 7 && old.progressionIntensity === 0.7 && { progressionIntensity: defaultSettings().progressionIntensity }),
          ...(version <= 7 && old.correctionIntensity === 0.7 && { correctionIntensity: defaultSettings().correctionIntensity }),
          ...(version <= 7 && old.blogBiasIntensity === 0.7 && { blogBiasIntensity: defaultSettings().blogBiasIntensity }),
          ...(version <= 7 && old.correctionsEnabled === true && { correctionsEnabled: defaultSettings().correctionsEnabled }),
        }
      },
    },
  ),
)

export function selectSettings(s: SettingsStore): Settings {
  return {
    excludedPolls: s.excludedPolls,
    progressionEnabled: s.progressionEnabled,
    progressionIntensity: s.progressionIntensity,
    correctionsEnabled: s.correctionsEnabled,
    correctionIntensity: s.correctionIntensity,
    correctionOverrides: s.correctionOverrides,
    referenceBlend: s.referenceBlend,
    blogBiasEnabled: s.blogBiasEnabled,
    blogBiasIntensity: s.blogBiasIntensity,
    turnoutEnabled: s.turnoutEnabled,
    turnoutExpected: s.turnoutExpected,
    alliances: s.alliances,
    untestedAlliances: s.untestedAlliances,
    groupedAlliances: s.groupedAlliances,
    allianceOverrides: s.allianceOverrides,
    transferCorrectionEnabled: s.transferCorrectionEnabled,
    transferCorrectionIntensity: s.transferCorrectionIntensity,
    transferOverrides: s.transferOverrides,
    minorTransfers: s.minorTransfers,
    fidelity: s.fidelity,
    abstentionCalibration: s.abstentionCalibration,
    abstentionTarget: s.abstentionTarget,
    qualificationPick: s.qualificationPick,
  }
}
