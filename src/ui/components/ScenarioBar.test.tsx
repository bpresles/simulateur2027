// @vitest-environment jsdom
// Paramètres de la simulation : projection d'offre, front républicain 2022↔2024, report gauche hors LFI, candidatures et réinitialisation.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { ScenarioBar } from './ScenarioBar'
import { SettingsSheet } from './SettingsSheet'
import type { SettingsTab } from './SettingsSheet'

function Harness({ onOpenSettings = () => {} }: { onOpenSettings?: (tab?: SettingsTab) => void }) {
  const state = useSettings((s) => s)
  return <ScenarioBar result={simulate(simulationData, selectSettings(state))} onOpenSettings={onOpenSettings} />
}

function SheetHarness({ tab = 'projection' }: { tab?: SettingsTab }) {
  const state = useSettings((s) => s)
  return <SettingsSheet open onOpenChange={() => {}} tab={tab} result={simulate(simulationData, selectSettings(state))} />
}

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

describe('ScenarioBar : projection d’offre, front républicain 2022↔2024 et sources de reports', () => {
  it('active la projection d’offre par défaut et permet de la désactiver', () => {
    render(<Harness />)
    const sw = screen.getByRole('switch', { name: /Projeter les sondages à offre proche/ })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    act(() => fireEvent.click(sw))
    expect(useSettings.getState().offerProjectionEnabled).toBe(false)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('active l’incertitude des candidatures par défaut et permet de la désactiver', () => {
    render(<Harness />)
    const sw = screen.getByRole('switch', { name: /Intégrer l’incertitude des candidatures/ })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    act(() => fireEvent.click(sw))
    expect(useSettings.getState().candidacyUncertaintyEnabled).toBe(false)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('propose les 3 sources de reports (Base historique par défaut) et affiche le curseur en mode mélange', () => {
    render(<Harness />)
    expect(useSettings.getState().transferSource).toBe('legislatives2024')
    expect(screen.queryByRole('slider', { name: 'Poids des déclarations 2027' })).toBeNull()

    act(() => fireEvent.click(screen.getByRole('radio', { name: /Mélange hist\. \/ 2027/ })))
    expect(useSettings.getState().transferSource).toBe('blend')
    expect(screen.getByRole('slider', { name: 'Poids des déclarations 2027' })).toBeTruthy()

    act(() => fireEvent.click(screen.getByRole('radio', { name: /Déclarations 2027/ })))
    expect(useSettings.getState().transferSource).toBe('declared2027')
    expect(screen.queryByRole('slider', { name: 'Poids des déclarations 2027' })).toBeNull()
  })

  it('expose directement le Front républicain 2022↔2024 et le report gauche hors LFI → Mélenchon', () => {
    render(<Harness />)
    expect(screen.getByRole('slider', { name: 'Intensité globale du front républicain' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : Centre / Droite' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : Gauche modérée' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : LFI' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Report gauche hors LFI vers Mélenchon' })).toBeTruthy()

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Présidentielle 2022' })))
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0, moderateLeft: 0, lfi: 0 })

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Mi-chemin' })))
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 })

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Législatives 2024' })))
    expect(useSettings.getState().republicanFront).toEqual({ centerRight: 1, moderateLeft: 1, lfi: 1 })

    act(() => fireEvent.click(screen.getByRole('button', { name: '36 % (décl. 2027)' })))
    expect(useSettings.getState().lfiLeftTransfer).toBe(36)
  })

  it('ouvre la feuille des réglages sur le bon onglet au clic sur les liens dédiés', () => {
    const onOpenSettings = vi.fn()
    render(<Harness onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajuster les reports/ }))
    expect(onOpenSettings).toHaveBeenCalledWith('reports')
    fireEvent.click(screen.getByRole('button', { name: /Régler finement le vote utile par bloc/ }))
    expect(onOpenSettings).toHaveBeenCalledWith('projection')
  })

  it('la section « Alliances testées par les sondeurs » est repliée par défaut et s’ouvre au clic', () => {
    render(<Harness />)
    const summary = screen.getByText('Alliances testées par les sondeurs', { selector: 'summary span' }).closest('summary')!
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
  })

  it('active la projection avril 2027 par défaut dans ScenarioBar et déplace les réglages fins du vote utile par bloc dans les réglages avancés', () => {
    render(<Harness />)
    expect(useSettings.getState().projection.enabled).toBe(true)
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Aujourd’hui' })))
    expect(useSettings.getState().projection.enabled).toBe(false)
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Projection avril 2027' })))
    expect(useSettings.getState().projection.enabled).toBe(true)
    // Les réglages fins par bloc ne sont plus dans ScenarioBar
    expect(screen.queryByRole('slider', { name: 'Intensité du vote utile : Gauche' })).toBeNull()

    cleanup()
    render(<SheetHarness tab="projection" />)
    expect(screen.getByRole('slider', { name: 'Intensité du vote utile : Gauche' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Intensité du vote utile : Centre' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Intensité du vote utile : Droite (LR)' })).toBeTruthy()

    const selectGauche = screen.getByLabelText('Candidat pivot du vote utile : Gauche') as HTMLSelectElement
    act(() => fireEvent.change(selectGauche, { target: { value: 'glucksmann' } }))
    expect(useSettings.getState().projection.usefulVote.gauche.beneficiary).toBe('glucksmann')

    act(() => fireEvent.click(screen.getByRole('switch', { name: /Regrouper centre et droite/ })))
    expect(useSettings.getState().projection.mergeCenterRight).toBe(true)
    expect(screen.getByRole('slider', { name: 'Intensité du vote utile : Centre + Droite' })).toBeTruthy()
  })

  it('« Réinitialiser tous les paramètres » rétablit la projection et la source par défaut', () => {
    act(() => {
      useSettings.getState().setOfferProjectionEnabled(false)
      useSettings.getState().setTransferSource('declared2027')
      useSettings.getState().setLfiLeftTransfer(40)
    })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser tous les paramètres' })))
    expect(useSettings.getState()).toMatchObject({
      offerProjectionEnabled: true,
      transferSource: 'legislatives2024',
      lfiLeftTransfer: 72,
    })
  })
})
