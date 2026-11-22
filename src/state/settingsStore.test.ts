// @vitest-environment jsdom
// Migration des réglages persistés (v1–v13 → v14) : conserve les choix compatibles et initialise les nouveaux défauts.
import { defaultSettings } from '../domain/simulate'
import { useSettings } from './settingsStore'

const KEY = 'simulateur2027:settings'

async function rehydrate(version: number, state: Record<string, unknown>) {
  localStorage.setItem(KEY, JSON.stringify({ state, version }))
  await useSettings.persist.rehydrate()
  return useSettings.getState()
}

afterEach(() => {
  localStorage.clear()
  useSettings.setState(defaultSettings())
})

describe('migration des réglages (→ v15), front républicain et report gauche hors LFI', () => {
  it('v10 → v15 : conserve les sondages exclus, alliances, surcharges de reports et fidélité, abandonne les anciens champs', async () => {
    const s = await rehydrate(10, {
      excludedPolls: ['elabe-20261016'],
      alliances: { 'attal-philippe': true },
      transferOverrides: { lfi_rn: { centre: { finalist: 40, rn: 20, abstention: 40 } } },
      minorTransfers: { villepin: 'centre' },
      fidelity: 0.9,
      blogBiasEnabled: true,
      turnoutExpected: 82,
      transferCorrectionEnabled: true,
    })
    expect(s).toMatchObject({
      excludedPolls: ['elabe-20261016'],
      alliances: { 'attal-philippe': true },
      transferOverrides: { lfi_rn: { centre: { finalist: 40, rn: 20, abstention: 40 } } },
      minorTransfers: { villepin: 'centre' },
      fidelity: 0.9,
      offerProjectionEnabled: true,
      candidacyUncertaintyEnabled: true,
      transferSource: 'legislatives2024',
      republicanFront: { centerRight: 1, moderateLeft: 1, lfi: 1 },
      lfiLeftTransfer: 72,
      lfiLeftTransferRange: [35, 75],
      firstRoundTurnout: 74,
    })
    expect(s.projection.enabled).toBe(true)
    expect(s).not.toHaveProperty('blogBiasEnabled')
    expect(s).not.toHaveProperty('turnoutExpected')
    expect(s).not.toHaveProperty('transferCorrectionEnabled')
    expect(s).not.toHaveProperty('centerRnPresidentialWeight')
  })

  it('v1 → v15 : abandonne les surcharges de reports v1 (format incompatible) et l’ancienne alliance philippe-glucksmann', async () => {
    const s = await rehydrate(1, {
      alliances: { 'philippe-glucksmann': true, 'attal-philippe': true },
      transferOverrides: { lfi_rn: { centre: { finalist: 50, rn: 20, abstention: 30 } } },
    })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
    expect(s.transferOverrides).toEqual({})
  })

  it('v4 → v15 : migre hypothesisSetId "philippe-seul" vers l’alliance attal-philippe', async () => {
    const s = await rehydrate(4, { hypothesisSetId: 'philippe-seul', alliances: {} })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
  })

  it('v13 → v15 : active la projection et l’incertitude des candidatures, remet meanReversion/dampedTrend à 0 et migre vers 2022↔2024', async () => {
    const s = await rehydrate(13, {
      excludedPolls: ['elabe-20261016'],
      transferSource: 'blend',
      declaredWeight: 0.3,
      firstRoundTurnout: 76,
      republicanFront: { centerRight: 0.55, moderateLeft: 0.5, lfi: 0.35 },
      projection: { ...defaultSettings().projection, enabled: false, meanReversion: 0.4, dampedTrend: 0.5 },
    })
    expect(s).toMatchObject({
      excludedPolls: ['elabe-20261016'],
      transferSource: 'blend',
      declaredWeight: 0.3,
      firstRoundTurnout: 76,
      republicanFront: { centerRight: 1, moderateLeft: 1, lfi: 1 },
      lfiLeftTransfer: 72,
      lfiLeftTransferRange: [35, 75],
      candidacyUncertaintyEnabled: true,
    })
    expect(s.projection.enabled).toBe(true)
    expect(s.projection.meanReversion).toBe(0)
    expect(s.projection.dampedTrend).toBe(0)
  })

  it('v14 → v15 : conserve les réglages v14 et active les nouveaux défauts projection + incertitude des candidatures', async () => {
    const s = await rehydrate(14, {
      excludedPolls: ['elabe-20261016'],
      lfiLeftTransfer: 54,
      lfiLeftTransferRange: [40, 70],
      republicanFront: { centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 },
      candidacyUncertaintyEnabled: false,
      projection: { ...defaultSettings().projection, enabled: false },
    })
    expect(s).toMatchObject({
      excludedPolls: ['elabe-20261016'],
      lfiLeftTransfer: 54,
      lfiLeftTransferRange: [40, 70],
      republicanFront: { centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 },
      candidacyUncertaintyEnabled: true,
    })
    expect(s.projection.enabled).toBe(true)
  })

  it('actions du front républicain, du report gauche hors LFI et de l’incertitude des candidatures', () => {
    const st = useSettings.getState()
    st.applyRepublicanFrontPreset('pres2022')
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0, moderateLeft: 0, lfi: 0 })
    st.applyRepublicanFrontPreset('midpoint')
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 })
    st.setRepublicanFront('lfi', 0.25)
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0.5, moderateLeft: 0.5, lfi: 0.25 })
    st.setRepublicanFrontGlobal(0)
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0, moderateLeft: 0, lfi: 0 })
    st.resetRepublicanFront()
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 1, moderateLeft: 1, lfi: 1 })

    st.setLfiLeftTransfer(50)
    st.setLfiLeftTransferRange([60, 40])
    expect(useSettings.getState().lfiLeftTransfer).toBe(50)
    expect(useSettings.getState().lfiLeftTransferRange).toEqual([40, 60])
    st.resetLfiLeftTransfer()
    expect(useSettings.getState().lfiLeftTransfer).toBe(72)
    expect(useSettings.getState().lfiLeftTransferRange).toEqual([35, 75])

    st.setCandidacyUncertaintyEnabled(false)
    expect(useSettings.getState().candidacyUncertaintyEnabled).toBe(false)
  })

  it('version trop récente (> 15) : réglages par défaut', async () => {
    const s = await rehydrate(99, { firstRoundTurnout: 85 })
    expect(s.firstRoundTurnout).toBe(74)
  })
})
