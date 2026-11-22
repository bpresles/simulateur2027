// @vitest-environment jsdom
// Migration des réglages persistés (v1–v10 → v11) : conserve les choix compatibles et remet les champs supprimés aux défauts.
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

describe('migration des réglages (→ v13) et front républicain', () => {
  it('v10 → v13 : conserve les sondages exclus, alliances, surcharges de reports et fidélité, abandonne les anciens champs', async () => {
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
      transferSource: 'legislatives2024',
      republicanFront: { centerRight: 0.55, moderateLeft: 0.5, lfi: 0.35 },
      firstRoundTurnout: 74,
    })
    expect(s).not.toHaveProperty('blogBiasEnabled')
    expect(s).not.toHaveProperty('turnoutExpected')
    expect(s).not.toHaveProperty('transferCorrectionEnabled')
    expect(s).not.toHaveProperty('centerRnPresidentialWeight')
  })

  it('v1 → v13 : abandonne les surcharges de reports v1 (format incompatible) et l’ancienne alliance philippe-glucksmann', async () => {
    const s = await rehydrate(1, {
      alliances: { 'philippe-glucksmann': true, 'attal-philippe': true },
      transferOverrides: { lfi_rn: { centre: { finalist: 50, rn: 20, abstention: 30 } } },
    })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
    expect(s.transferOverrides).toEqual({})
  })

  it('v4 → v13 : migre hypothesisSetId "philippe-seul" vers l’alliance attal-philippe', async () => {
    const s = await rehydrate(4, { hypothesisSetId: 'philippe-seul', alliances: {} })
    expect(s.alliances).toEqual({ 'attal-philippe': true })
  })

  it('v12 → v13 : conserve les réglages v12 dont la projection, abandonne centerRnPresidentialWeight et initialise le front républicain', async () => {
    const s = await rehydrate(12, {
      excludedPolls: ['elabe-20261016'],
      transferSource: 'blend',
      declaredWeight: 0.3,
      centerRnPresidentialWeight: 0.8,
      firstRoundTurnout: 76,
      projection: { ...defaultSettings().projection, enabled: true },
    })
    expect(s).toMatchObject({
      excludedPolls: ['elabe-20261016'],
      transferSource: 'blend',
      declaredWeight: 0.3,
      firstRoundTurnout: 76,
      republicanFront: { centerRight: 0.55, moderateLeft: 0.5, lfi: 0.35 },
    })
    expect(s.projection.enabled).toBe(true)
    expect(s).not.toHaveProperty('centerRnPresidentialWeight')
  })

  it('actions du front républicain : préréglages, curseur global et réglage séparé par famille', () => {
    const st = useSettings.getState()
    st.applyRepublicanFrontPreset('level2017')
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 1, moderateLeft: 1, lfi: 1 })
    st.setRepublicanFront('lfi', 0.25)
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 1, moderateLeft: 1, lfi: 0.25 })
    st.setRepublicanFrontGlobal(0)
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0, moderateLeft: 0, lfi: 0 })
    st.resetRepublicanFront()
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0.55, moderateLeft: 0.5, lfi: 0.35 })
  })

  it('version trop récente (> 13) : réglages par défaut', async () => {
    const s = await rehydrate(99, { firstRoundTurnout: 85 })
    expect(s.firstRoundTurnout).toBe(74)
  })
})
