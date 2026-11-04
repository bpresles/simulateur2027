// @vitest-environment jsdom
// Options du bloc « Paramètres de la simulation » : description selon les écarts saisis, lien vers les
// réglages, biais du billet, participation attendue et réinitialisation.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { BLOG_BIAS_URL } from '../../domain/blogBias'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { ScenarioBar } from './ScenarioBar'

const DEFAULT_DESCRIPTION =
  'Selon une estimation basée sur les écarts réels entre les derniers sondages et résultats de 2017 et 2022'
const OVERRIDE_DESCRIPTION = 'Selon les écarts saisis dans les réglages'

function Harness({ onOpenSettings = () => {} }: { onOpenSettings?: () => void }) {
  const state = useSettings((s) => s)
  return <ScenarioBar result={simulate(simulationData, selectSettings(state))} onOpenSettings={onOpenSettings} />
}

// Les curseurs Radix mesurent leur taille ; jsdom ne fournit pas ResizeObserver.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterAll(() => vi.unstubAllGlobals())

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

describe('ScenarioBar : corrections', () => {
  it('décrit la correction calculée tant qu’aucun écart n’est saisi', () => {
    render(<Harness />)
    expect(screen.getByText(DEFAULT_DESCRIPTION)).toBeTruthy()
    expect(screen.queryByText(OVERRIDE_DESCRIPTION)).toBeNull()
  })

  it('renvoie aux écarts saisis dès qu’un écart est surchargé', () => {
    act(() => useSettings.getState().setCorrectionOverride('melenchon', -3))
    render(<Harness />)
    expect(screen.getByText(OVERRIDE_DESCRIPTION)).toBeTruthy()
    expect(screen.queryByText(DEFAULT_DESCRIPTION)).toBeNull()
  })

  it('ouvre les réglages depuis le lien, avec ou sans écart saisi', () => {
    const onOpenSettings = vi.fn()
    const { unmount } = render(<Harness onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier les écarts' }))
    unmount()
    act(() => useSettings.getState().setCorrectionOverride('melenchon', -3))
    render(<Harness onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier les écarts' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(2)
  })

  it('« Réinitialiser tous les paramètres » efface aussi les écarts saisis', () => {
    act(() => {
      useSettings.getState().setCorrectionOverride('melenchon', -3)
      useSettings.getState().setCorrectionOverride('lepen', 2)
    })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser tous les paramètres' })))
    expect(useSettings.getState().correctionOverrides).toEqual({})
    expect(screen.getByText(DEFAULT_DESCRIPTION)).toBeTruthy()
  })
})

describe('ScenarioBar : biais du billet de blog', () => {
  const name = /Corriger les biais révélés dans le billet de blog d’Eliot Thibault/
  const slider = () => screen.getByRole('slider', { name: 'Intensité de la correction des biais du billet' })

  it('propose l’option, activée par défaut, avec un lien vers le billet dans un nouvel onglet', () => {
    render(<Harness />)
    expect(screen.getByRole('switch', { name }).getAttribute('aria-checked')).toBe('true')
    const link = screen.getByRole('link', { name: /Lire le billet de blog d’Eliot Thibault/ })
    expect(link.getAttribute('href')).toBe(BLOG_BIAS_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(
      screen.getByText(/En 2017 et 2022, des sondages à .* du scrutin au résultat : extrême droite ×.*, gauche ×/),
    ).toBeTruthy()
  })

  it('le curseur d’intensité (100 % par défaut) suit l’option', () => {
    render(<Harness />)
    expect(slider().getAttribute('aria-valuenow')).toBe('100')
    expect(slider().hasAttribute('data-disabled')).toBe(false)
    act(() => fireEvent.click(screen.getByRole('switch', { name })))
    expect(useSettings.getState().blogBiasEnabled).toBe(false)
    expect(slider().hasAttribute('data-disabled')).toBe(true)
  })

  it('signale les biais déjà corrigés par les autres options', () => {
    render(<Harness />)
    // Seule l'option du billet est activée par défaut : rien à signaler.
    expect(screen.queryByText(/corrigé qu’une fois/)).toBeNull()
    act(() => useSettings.getState().setCorrectionsEnabled(true))
    expect(screen.getByText(/il n’est corrigé qu’une fois, à la plus forte des deux intensités/)).toBeTruthy()
    act(() => useSettings.getState().setCorrectionsEnabled(false))
    expect(screen.queryByText(/corrigé qu’une fois/)).toBeNull()
  })

  it('« Réinitialiser tous les paramètres » réactive l’option et rétablit son intensité', () => {
    act(() => {
      useSettings.getState().setBlogBiasEnabled(false)
      useSettings.getState().setBlogBiasIntensity(1.2)
    })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser tous les paramètres' })))
    expect(useSettings.getState()).toMatchObject({ blogBiasEnabled: true, blogBiasIntensity: 1 })
  })
})

describe('ScenarioBar : participation attendue', () => {
  const name = /Participation attendue au 1er tour/
  const slider = () => screen.getByRole('slider', { name: 'Participation attendue' })
  const defaultExpected = () => simulate(simulationData, selectSettings(useSettings.getState())).turnoutBalance!.defaultExpected

  it('propose l’option, activée par défaut, curseur sur la participation par défaut, bilan en trois lignes', () => {
    render(<Harness />)
    expect(screen.getByRole('switch', { name }).getAttribute('aria-checked')).toBe('true')
    expect(Number(slider().getAttribute('aria-valuenow'))).toBeCloseTo(defaultExpected(), 6)
    expect(slider().hasAttribute('data-disabled')).toBe(false)
    expect(screen.getByText(/Certains d’aller voter aujourd’hui \(Ifop, \d{2}\/\d{2}\/\d{4}\)/)).toBeTruthy()
    expect(screen.getByText(/Mobilisation de 2022 déjà corrigée/)).toBeTruthy()
    expect(screen.getByText(/Supplément appliqué : ±0,0/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Revenir au défaut/ })).toBeNull()
  })

  it('désactivée, elle retire le bilan et l’ajustement du 1er tour', () => {
    const before = simulate(simulationData, { ...selectSettings(useSettings.getState()), turnoutExpected: 85 })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('switch', { name })))
    expect(useSettings.getState().turnoutEnabled).toBe(false)
    expect(slider().hasAttribute('data-disabled')).toBe(true)
    expect(screen.queryByText(/Supplément appliqué/)).toBeNull()
    const after = simulate(simulationData, selectSettings(useSettings.getState()))
    const score = (r: typeof before, id: string) => r.firstRound.find((x) => x.candidateId === id)!.corrected
    expect(score(after, 'melenchon')).toBeLessThan(score(before, 'melenchon'))
  })

  it('une participation réglée propose de revenir au défaut', () => {
    act(() => useSettings.getState().setTurnoutExpected(85))
    render(<Harness />)
    expect(Number(slider().getAttribute('aria-valuenow'))).toBe(85)
    act(() => fireEvent.click(screen.getByRole('button', { name: /Revenir au défaut/ })))
    expect(useSettings.getState().turnoutExpected).toBeNull()
  })

  it('« Réinitialiser tous les paramètres » la réactive et rétablit la participation par défaut', () => {
    act(() => {
      useSettings.getState().setTurnoutEnabled(false)
      useSettings.getState().setTurnoutExpected(85)
    })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser tous les paramètres' })))
    expect(useSettings.getState()).toMatchObject({ turnoutEnabled: true, turnoutExpected: null })
  })
})

describe('ScenarioBar : correction des reports', () => {
  const name = /Reports de voix tirés des votes réels de 2024, et non d’un sondage/
  const slider = () => screen.getByRole('slider', { name: 'Intensité de la correction des reports' })

  it('activée par défaut, à 100 %', () => {
    render(<Harness />)
    expect(screen.getByRole('switch', { name }).getAttribute('aria-checked')).toBe('true')
    expect(slider().getAttribute('aria-valuenow')).toBe('100')
  })
  it('désactivée, elle grise le curseur et abaisse Mélenchon au 2nd tour', () => {
    const before = simulate(simulationData, selectSettings(useSettings.getState()))
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('switch', { name })))
    expect(useSettings.getState().transferCorrectionEnabled).toBe(false)
    expect(slider().hasAttribute('data-disabled')).toBe(true)
    const after = simulate(simulationData, selectSettings(useSettings.getState()))
    expect(after.secondRound.pct.b).toBeLessThan(before.secondRound.pct.b)
  })
})
