// @vitest-environment jsdom
// Migration des réglages persistés : les anciens états gardent leurs choix et reçoivent les nouvelles options.
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

describe('migration des réglages', () => {
  it('v9 → v10 : la correction des reports est activée à 100 % par défaut, le reste est conservé', async () => {
    const { turnoutExpected: _kept, ...v9 } = { ...defaultSettings(), turnoutExpected: 80, blogBiasIntensity: 0.7 }
    const s = await rehydrate(9, v9)
    expect(s).toMatchObject({
      transferCorrectionEnabled: true,
      transferCorrectionIntensity: 1,
      blogBiasIntensity: 0.7,
    })
  })
  it('v8 → v10 : turnoutIntensity est retiré et les intensités délibérées ne sont pas écrasées', async () => {
    const s = await rehydrate(8, { ...defaultSettings(), turnoutIntensity: 0.5, progressionIntensity: 0.7 })
    expect(s).not.toHaveProperty('turnoutIntensity')
    expect(s.progressionIntensity).toBe(0.7)
    expect(s.transferCorrectionEnabled).toBe(true)
  })
  it('v7 → v10 : l’ancien défaut de 70 % redevient 100 %', async () => {
    const s = await rehydrate(7, { ...defaultSettings(), progressionIntensity: 0.7 })
    expect(s.progressionIntensity).toBe(1)
  })
  it('version trop récente : réglages par défaut', async () => {
    const s = await rehydrate(11, { ...defaultSettings(), progressionIntensity: 0.3 })
    expect(s.progressionIntensity).toBe(1)
  })
})
