import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultSettings } from '../domain/simulate'
import type { Bloc, CandidateId, ProfileId, Settings, TransferValues } from '../domain/types'

interface SettingsActions {
  setHypothesisSet: (id: string) => void
  setProgressionEnabled: (enabled: boolean) => void
  setCorrectionsEnabled: (enabled: boolean) => void
  setCorrectionIntensity: (intensity: number) => void
  /** `undefined` retire la surcharge et rétablit la correction calculée. */
  setCorrectionOverride: (id: CandidateId, points: number | undefined) => void
  /** `undefined` rétablit le dosage des données pour cette référence composite. */
  setReferenceBlend: (id: CandidateId, weight: number | undefined) => void
  setAlliance: (id: string, active: boolean) => void
  /** `undefined` rétablit le taux constaté en 2024 pour cette alliance. */
  setAllianceOverride: (allianceId: string, share: number | undefined) => void
  setTransferOverride: (profile: ProfileId, bloc: Bloc, values: TransferValues | undefined) => void
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
const STORAGE_VERSION = 4

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setHypothesisSet: (hypothesisSetId) => set({ hypothesisSetId }),
      setProgressionEnabled: (progressionEnabled) => set({ progressionEnabled }),
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
      setAlliance: (id, active) => set((s) => ({ alliances: { ...s.alliances, [id]: active } })),
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
      setFidelity: (fidelity) => set({ fidelity }),
      setAbstentionCalibration: (abstentionCalibration) => set({ abstentionCalibration }),
      setAbstentionTarget: (abstentionTarget) => set({ abstentionTarget }),
      setQualificationPick: (qualificationPick) => set({ qualificationPick }),
      resetCorrections: () => {
        const { correctionsEnabled, correctionIntensity, correctionOverrides, referenceBlend } = defaultSettings()
        set({ correctionsEnabled, correctionIntensity, correctionOverrides, referenceBlend })
      },
      resetTransfers: () =>
        set({ transferOverrides: {}, fidelity: null, abstentionCalibration: true, abstentionTarget: null }),
      resetAll: () => set(defaultSettings()),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Settings => ({
        hypothesisSetId: s.hypothesisSetId,
        progressionEnabled: s.progressionEnabled,
        correctionsEnabled: s.correctionsEnabled,
        correctionIntensity: s.correctionIntensity,
        correctionOverrides: s.correctionOverrides,
        referenceBlend: s.referenceBlend,
        alliances: s.alliances,
        allianceOverrides: s.allianceOverrides,
        transferOverrides: s.transferOverrides,
        fidelity: s.fidelity,
        abstentionCalibration: s.abstentionCalibration,
        abstentionTarget: s.abstentionTarget,
        qualificationPick: s.qualificationPick,
      }),
      // v1 → v2 : les lignes de reports ont changé de sens, leurs surcharges sont abandonnées.
      // ≤ v2 : l'alliance « philippe-glucksmann » avait un leader variable, son sens a changé.
      // ≤ v3 : le report d'alliance unique est remplacé par des taux par alliance (2024 par défaut).
      // Le reste du scénario est conservé ; les nouveaux réglages prennent leur valeur par défaut.
      migrate: (persisted, version) => {
        if (version < 1 || version > 3) return defaultSettings()
        const { allianceEfficiency: _efficiency, ...old } = persisted as Partial<Settings> & {
          allianceEfficiency?: unknown
        }
        const { 'philippe-glucksmann': _dynamic, ...kept } = old.alliances ?? {}
        return {
          ...defaultSettings(),
          ...old,
          alliances: version <= 2 ? kept : (old.alliances ?? {}),
          transferOverrides: version === 1 ? {} : (old.transferOverrides ?? {}),
          allianceOverrides: old.allianceOverrides ?? {},
        }
      },
    },
  ),
)

export function selectSettings(s: SettingsStore): Settings {
  return {
    hypothesisSetId: s.hypothesisSetId,
    progressionEnabled: s.progressionEnabled,
    correctionsEnabled: s.correctionsEnabled,
    correctionIntensity: s.correctionIntensity,
    correctionOverrides: s.correctionOverrides,
    referenceBlend: s.referenceBlend,
    alliances: s.alliances,
    allianceOverrides: s.allianceOverrides,
    transferOverrides: s.transferOverrides,
    fidelity: s.fidelity,
    abstentionCalibration: s.abstentionCalibration,
    abstentionTarget: s.abstentionTarget,
    qualificationPick: s.qualificationPick,
  }
}
