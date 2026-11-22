import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultProjectionSettings } from '../domain/campaignProjection'
import { defaultSettings } from '../domain/simulate'
import {
  DEFAULT_LFI_LEFT_TRANSFER,
  DEFAULT_LFI_LEFT_TRANSFER_RANGE,
  defaultRepublicanFront,
  REPUBLICAN_FRONT_PRESETS,
} from '../domain/transfers'
import { REPUBLICAN_FRONT_FAMILIES } from '../domain/types'
import type {
  Bloc,
  BlocUsefulVote,
  CandidateId,
  ProfileId,
  RepublicanFrontFamily,
  RepublicanFrontPreset,
  Settings,
  TransferSource,
  TransferValues,
} from '../domain/types'

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const clamp01 = (v: number) => clamp(v, 0, 1)
const roundPct = (v: number) => Math.round(clamp01(v) * 100) / 100

interface SettingsActions {
  setPollIncluded: (pollId: string, included: boolean) => void
  includeAllPolls: () => void
  /** Remplace les alliances actives (seules les combinaisons testées sont appliquées). */
  setAlliances: (alliances: Record<string, boolean>) => void
  setOfferProjectionEnabled: (enabled: boolean) => void
  setCandidacyUncertaintyEnabled: (enabled: boolean) => void
  setProjectionEnabled: (enabled: boolean) => void
  setBlocUsefulVote: (bloc: Bloc, patch: Partial<BlocUsefulVote>) => void
  setMergeCenterRight: (merged: boolean) => void
  setMeanReversion: (reversion: number) => void
  setDampedTrend: (trend: number) => void
  resetProjection: () => void
  setTransferSource: (source: TransferSource) => void
  setDeclaredWeight: (weight: number) => void
  setRepublicanFront: (family: RepublicanFrontFamily, value: number) => void
  setRepublicanFrontGlobal: (value: number) => void
  applyRepublicanFrontPreset: (preset: RepublicanFrontPreset) => void
  resetRepublicanFront: () => void
  setLfiLeftTransfer: (rate: number) => void
  setLfiLeftTransferRange: (range: [number, number]) => void
  resetLfiLeftTransfer: () => void
  setTransferOverride: (profile: ProfileId, bloc: Bloc, values: TransferValues | undefined) => void
  /** `undefined` rétablit la répartition par défaut des électeurs de ce petit candidat. */
  setMinorTransfer: (id: CandidateId, transferId: string | undefined) => void
  setFidelity: (fidelity: number | null) => void
  setFirstRoundTurnout: (turnout: number) => void
  setAbstainerMobilization: (mob: number) => void
  setAbstainerAntiRnShare: (share: number) => void
  setSelectedDuel: (duelId: string | null) => void
  resetTransfers: () => void
  resetAll: () => void
}

export type SettingsStore = Settings & SettingsActions

const STORAGE_KEY = 'simulateur2027:settings'
const STORAGE_VERSION = 15

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
      setAlliances: (alliances) => set({ alliances }),
      setOfferProjectionEnabled: (offerProjectionEnabled) => set({ offerProjectionEnabled }),
      setCandidacyUncertaintyEnabled: (candidacyUncertaintyEnabled) => set({ candidacyUncertaintyEnabled }),
      setProjectionEnabled: (enabled) => set((s) => ({ projection: { ...s.projection, enabled } })),
      setBlocUsefulVote: (bloc, patch) =>
        set((s) => ({
          projection: {
            ...s.projection,
            usefulVote: {
              ...s.projection.usefulVote,
              [bloc]: { ...s.projection.usefulVote[bloc], ...patch },
            },
          },
        })),
      setMergeCenterRight: (mergeCenterRight) =>
        set((s) => ({ projection: { ...s.projection, mergeCenterRight } })),
      setMeanReversion: (meanReversion) =>
        set((s) => ({ projection: { ...s.projection, meanReversion } })),
      setDampedTrend: (dampedTrend) =>
        set((s) => ({ projection: { ...s.projection, dampedTrend } })),
      resetProjection: () =>
        set((s) => ({
          projection: { ...defaultProjectionSettings(), enabled: s.projection.enabled },
        })),
      setTransferSource: (transferSource) => set({ transferSource }),
      setDeclaredWeight: (declaredWeight) => set({ declaredWeight }),
      setRepublicanFront: (family, value) =>
        set((s) => ({
          republicanFront: { ...s.republicanFront, [family]: roundPct(value) },
        })),
      setRepublicanFrontGlobal: (value) =>
        set((s) => {
          const target = clamp01(value)
          if (target <= 0) return { republicanFront: { centerRight: 0, moderateLeft: 0, lfi: 0 } }
          if (target >= 1) return { republicanFront: { centerRight: 1, moderateLeft: 1, lfi: 1 } }
          const avg =
            REPUBLICAN_FRONT_FAMILIES.reduce((sum, k) => sum + s.republicanFront[k], 0) /
            REPUBLICAN_FRONT_FAMILIES.length
          const delta = target - avg
          return {
            republicanFront: {
              centerRight: roundPct(s.republicanFront.centerRight + delta),
              moderateLeft: roundPct(s.republicanFront.moderateLeft + delta),
              lfi: roundPct(s.republicanFront.lfi + delta),
            },
          }
        }),
      applyRepublicanFrontPreset: (preset) =>
        set({ republicanFront: { ...REPUBLICAN_FRONT_PRESETS[preset] } }),
      resetRepublicanFront: () => set({ republicanFront: defaultRepublicanFront() }),
      setLfiLeftTransfer: (rate) => set({ lfiLeftTransfer: Math.round(clamp(rate, 5, 95)) }),
      setLfiLeftTransferRange: (range) => {
        const lo = Math.round(clamp(Math.min(range[0], range[1]), 5, 95))
        const hi = Math.round(clamp(Math.max(range[0], range[1]), 5, 95))
        set({ lfiLeftTransferRange: [lo, hi] })
      },
      resetLfiLeftTransfer: () =>
        set({
          lfiLeftTransfer: DEFAULT_LFI_LEFT_TRANSFER,
          lfiLeftTransferRange: [...DEFAULT_LFI_LEFT_TRANSFER_RANGE],
        }),
      setTransferOverride: (profile, bloc, values) =>
        set((s) => {
          const { [bloc]: _, ...rows } = s.transferOverrides[profile] ?? {}
          const nextProfile = values ? { ...rows, [bloc]: values } : rows
          if (Object.keys(nextProfile).length === 0) {
            const { [profile]: _p, ...rest } = s.transferOverrides
            return { transferOverrides: rest }
          }
          return { transferOverrides: { ...s.transferOverrides, [profile]: nextProfile } }
        }),
      setMinorTransfer: (id, transferId) =>
        set((s) => {
          const { [id]: _, ...rest } = s.minorTransfers
          return { minorTransfers: transferId === undefined ? rest : { ...rest, [id]: transferId } }
        }),
      setFidelity: (fidelity) => set({ fidelity }),
      setFirstRoundTurnout: (firstRoundTurnout) => set({ firstRoundTurnout }),
      setAbstainerMobilization: (abstainerMobilization) => set({ abstainerMobilization }),
      setAbstainerAntiRnShare: (abstainerAntiRnShare) => set({ abstainerAntiRnShare }),
      setSelectedDuel: (selectedDuel) => set({ selectedDuel }),
      resetTransfers: () => {
        const d = defaultSettings()
        set({
          transferSource: d.transferSource,
          declaredWeight: d.declaredWeight,
          republicanFront: d.republicanFront,
          lfiLeftTransfer: d.lfiLeftTransfer,
          lfiLeftTransferRange: d.lfiLeftTransferRange,
          transferOverrides: d.transferOverrides,
          minorTransfers: d.minorTransfers,
          fidelity: d.fidelity,
          firstRoundTurnout: d.firstRoundTurnout,
          abstainerMobilization: d.abstainerMobilization,
          abstainerAntiRnShare: d.abstainerAntiRnShare,
        })
      },
      resetAll: () => set(defaultSettings()),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Settings => ({
        excludedPolls: s.excludedPolls,
        alliances: s.alliances,
        offerProjectionEnabled: s.offerProjectionEnabled,
        candidacyUncertaintyEnabled: s.candidacyUncertaintyEnabled,
        projection: s.projection,
        transferSource: s.transferSource,
        declaredWeight: s.declaredWeight,
        republicanFront: s.republicanFront,
        lfiLeftTransfer: s.lfiLeftTransfer,
        lfiLeftTransferRange: s.lfiLeftTransferRange,
        transferOverrides: s.transferOverrides,
        minorTransfers: s.minorTransfers,
        fidelity: s.fidelity,
        firstRoundTurnout: s.firstRoundTurnout,
        abstainerMobilization: s.abstainerMobilization,
        abstainerAntiRnShare: s.abstainerAntiRnShare,
        selectedDuel: s.selectedDuel,
      }),
      migrate: (persisted, version) => {
        if (version < 1 || version > 14 || !persisted || typeof persisted !== 'object') return defaultSettings()
        const old = persisted as Partial<Settings> & {
          hypothesisSetId?: string | null
          centerRnPresidentialWeight?: number
        }
        if (version === 14) {
          const defProj = defaultProjectionSettings()
          return {
            ...defaultSettings(),
            ...old,
            projection: old.projection ? { ...defProj, ...old.projection, enabled: true } : defProj,
            candidacyUncertaintyEnabled: true,
          }
        }
        if (version >= 11 && version <= 13) {
          const { centerRnPresidentialWeight: _legacy, ...rest } = old
          const defProj = defaultProjectionSettings()
          const keptProj =
            version >= 12 && old.projection
              ? {
                  ...defProj,
                  enabled: true,
                  usefulVote: old.projection.usefulVote,
                  mergeCenterRight: old.projection.mergeCenterRight,
                }
              : defProj
          return {
            ...defaultSettings(),
            ...rest,
            projection: keptProj,
            republicanFront: defaultRepublicanFront(),
            lfiLeftTransfer: DEFAULT_LFI_LEFT_TRANSFER,
            lfiLeftTransferRange: [...DEFAULT_LFI_LEFT_TRANSFER_RANGE],
            candidacyUncertaintyEnabled: true,
          }
        }
        const { 'philippe-glucksmann': _dynamic, ...keptAlliances } = old.alliances ?? {}
        const baseAlliances = version <= 2 ? keptAlliances : (old.alliances ?? {})
        const alliances =
          old.hypothesisSetId === 'philippe-seul' ? { ...baseAlliances, 'attal-philippe': true } : baseAlliances
        return {
          ...defaultSettings(),
          excludedPolls: Array.isArray(old.excludedPolls) ? old.excludedPolls : [],
          alliances,
          transferOverrides: version === 1 ? {} : (old.transferOverrides ?? {}),
          minorTransfers: old.minorTransfers ?? {},
          fidelity: typeof old.fidelity === 'number' ? old.fidelity : null,
        }
      },
    },
  ),
)

export function selectSettings(s: SettingsStore): Settings {
  return {
    excludedPolls: s.excludedPolls,
    alliances: s.alliances,
    offerProjectionEnabled: s.offerProjectionEnabled,
    candidacyUncertaintyEnabled: s.candidacyUncertaintyEnabled,
    projection: s.projection,
    transferSource: s.transferSource,
    declaredWeight: s.declaredWeight,
    republicanFront: s.republicanFront,
    lfiLeftTransfer: s.lfiLeftTransfer,
    lfiLeftTransferRange: s.lfiLeftTransferRange,
    transferOverrides: s.transferOverrides,
    minorTransfers: s.minorTransfers,
    fidelity: s.fidelity,
    firstRoundTurnout: s.firstRoundTurnout,
    abstainerMobilization: s.abstainerMobilization,
    abstainerAntiRnShare: s.abstainerAntiRnShare,
    selectedDuel: s.selectedDuel,
  }
}
