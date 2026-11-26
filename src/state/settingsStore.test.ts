// @vitest-environment jsdom
// Migration des réglages persistés (v1–v15 → v17) : front républicain par électorat qui se reporte.
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

describe('migration des réglages (→ v17), front républicain par électorat et report gauche hors LFI', () => {
  it('v10 → v17 : conserve les sondages exclus, alliances, surcharges de reports et fidélité, abandonne les anciens champs', async () => {
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
      republicanFront: { gauche: 1, centre: 1, droite: 1 },
      lfiLeftTransferRange: [35, 75],
      firstRoundTurnout: 74,
    })
    expect(s.projection.enabled).toBe(true)
    expect(s).not.toHaveProperty('blogBiasEnabled')
    expect(s).not.toHaveProperty('turnoutExpected')
    expect(s).not.toHaveProperty('transferCorrectionEnabled')
    expect(s).not.toHaveProperty('centerRnPresidentialWeight')
  })

  it('v1 → v17 : abandonne les surcharges de reports v1 (format incompatible) et l’ancienne alliance philippe-glucksmann', async () => {
    const s = await rehydrate(1, {
      alliances: { 'philippe-glucksmann': true, 'attal-philippe': true },
      transferOverrides: { lfi_rn: { centre: { finalist: 50, rn: 20, abstention: 30 } } },
    })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
    expect(s.transferOverrides).toEqual({})
  })

  it('v4 → v17 : migre hypothesisSetId "philippe-seul" vers l’alliance attal-philippe', async () => {
    const s = await rehydrate(4, { hypothesisSetId: 'philippe-seul', alliances: {} })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
  })

  it('v13 → v17 : active la projection et l’incertitude des candidatures, remet meanReversion/dampedTrend à 0 et migre vers { gauche, centre, droite }', async () => {
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
      republicanFront: { gauche: 1, centre: 1, droite: 1 },
      lfiLeftTransferRange: [35, 75],
      candidacyUncertaintyEnabled: true,
    })
    expect(s.projection.enabled).toBe(true)
    expect(s.projection.meanReversion).toBe(0)
    expect(s.projection.dampedTrend).toBe(0)
  })

  it('v15 → v17 : conserve les réglages v15, retire l’ancien lfiLeftTransfer et migre republicanFront vers { gauche, centre, droite }', async () => {
    const s = await rehydrate(15, {
      excludedPolls: ['elabe-20261016'],
      lfiLeftTransfer: 54,
      lfiLeftTransferRange: [40, 70],
      republicanFront: { centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 },
      candidacyUncertaintyEnabled: false,
      projection: { ...defaultSettings().projection, enabled: false },
    })
    expect(s).toMatchObject({
      excludedPolls: ['elabe-20261016'],
      lfiLeftTransferRange: [40, 70],
      republicanFront: { gauche: 1, centre: 1, droite: 1 },
      candidacyUncertaintyEnabled: false,
    })
    expect(s).not.toHaveProperty('lfiLeftTransfer')
    expect(s.projection.enabled).toBe(false)
  })

  it('v16 → v17 : conserve le choix de projection de l’utilisateur et les autres réglages', async () => {
    const s = await rehydrate(16, {
      excludedPolls: ['elabe-20261016'],
      republicanFront: { gauche: 0.5, centre: 0.5, droite: 0.5 },
      projection: { ...defaultSettings().projection, enabled: false },
    })
    expect(s.projection.enabled).toBe(false)
    const on = await rehydrate(16, { projection: { ...defaultSettings().projection, enabled: true } })
    expect(on.projection.enabled).toBe(true)
    expect(s.excludedPolls).toEqual(['elabe-20261016'])
    expect(s.republicanFront).toMatchObject({ gauche: 0.5, centre: 0.5, droite: 0.5 })
  })

  it('préréglage « incertain » : activé par le préréglage, retiré dès qu’un curseur est réglé', () => {
    const st = useSettings.getState()
    st.applyRepublicanFrontPreset('uncertain')
    expect(useSettings.getState().republicanFront.uncertain).toBe(true)
    st.setRepublicanFront('centre', 0.25)
    expect(useSettings.getState().republicanFront.uncertain).toBeFalsy()
  })

  it('actions du front républicain par électorat, de la plage MC gauche hors LFI et de l’incertitude des candidatures', () => {
    const st = useSettings.getState()
    st.applyRepublicanFrontPreset('pres2022')
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0, centre: 0, droite: 0 })
    st.applyRepublicanFrontPreset('midpoint')
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0.5, centre: 0.5, droite: 0.5 })
    st.setRepublicanFront('centre', 0.25)
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0.5, centre: 0.25, droite: 0.5 })
    st.setRepublicanFrontGlobal(0)
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0, centre: 0, droite: 0 })
    st.resetRepublicanFront()
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 1, centre: 1, droite: 1 })

    st.setLfiLeftTransferRange([60, 40])
    expect(useSettings.getState().lfiLeftTransferRange).toEqual([40, 60])
    st.resetLfiLeftTransferRange()
    expect(useSettings.getState().lfiLeftTransferRange).toEqual([35, 75])

    st.setCandidacyUncertaintyEnabled(false)
    expect(useSettings.getState().candidacyUncertaintyEnabled).toBe(false)
  })

  it('v17 → v18 : migre les anciens défauts (a = 0,20 → 0,225 ; q = 0,55 → null) et conserve les choix explicites', async () => {
    const defMigrated = await rehydrate(17, {
      abstainerMobilization: 0.2,
      abstainerAntiRnShare: 0.55,
      republicanFront: { gauche: 0.5, centre: 0.5, droite: 0.5 },
    })
    expect(defMigrated.abstainerMobilization).toBeCloseTo(0.225, 9)
    expect(defMigrated.abstainerAntiRnShare).toBeNull()
    expect(defMigrated.republicanFront).toMatchObject({ gauche: 0.5, centre: 0.5, droite: 0.5 })

    const customKept = await rehydrate(17, {
      abstainerMobilization: 0.15,
      abstainerAntiRnShare: 0.62,
    })
    expect(customKept.abstainerMobilization).toBeCloseTo(0.15, 9)
    expect(customKept.abstainerAntiRnShare).toBeCloseTo(0.62, 9)
  })

  it('v18 → v19 : conserve tous les réglages v18 et initialise betweenRoundsBias à "none"', async () => {
    const s = await rehydrate(18, {
      excludedPolls: ['elabe-20261016'],
      abstainerMobilization: 0.18,
      abstainerAntiRnShare: 0.6,
      republicanFront: { gauche: 0.5, centre: 0.5, droite: 0.5 },
    })
    expect(s.excludedPolls).toEqual(['elabe-20261016'])
    expect(s.abstainerMobilization).toBeCloseTo(0.18, 9)
    expect(s.abstainerAntiRnShare).toBeCloseTo(0.6, 9)
    expect(s.betweenRoundsBias).toBe('none')
  })

  it('action setBetweenRoundsBias et réinitialisations (resetTransfers / resetAll)', () => {
    const st = useSettings.getState()
    expect(st.betweenRoundsBias).toBe('none')
    st.setBetweenRoundsBias('2022')
    expect(useSettings.getState().betweenRoundsBias).toBe('2022')
    st.setBetweenRoundsBias('2017')
    expect(useSettings.getState().betweenRoundsBias).toBe('2017')
    st.resetTransfers()
    expect(useSettings.getState().betweenRoundsBias).toBe('none')
    st.setBetweenRoundsBias('2022')
    st.resetAll()
    expect(useSettings.getState().betweenRoundsBias).toBe('none')
  })

  it('version trop récente (> 19) : réglages par défaut', async () => {
    const s = await rehydrate(99, { firstRoundTurnout: 85, betweenRoundsBias: '2017' })
    expect(s.firstRoundTurnout).toBe(74)
    expect(s.abstainerMobilization).toBeCloseTo(0.225, 9)
    expect(s.abstainerAntiRnShare).toBeNull()
    expect(s.betweenRoundsBias).toBe('none')
  })
})
