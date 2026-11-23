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

  it('propose les 3 sources de reports au-dessus du front républicain et désactive le front républicain en mode Déclarations 2027', () => {
    render(<Harness />)
    expect(useSettings.getState().transferSource).toBe('legislatives2024')
    expect(screen.queryByRole('slider', { name: 'Poids des déclarations 2027' })).toBeNull()

    // La source des reports précède directement les préréglages du front républicain dans le DOM
    const sourceRadio = screen.getByRole('radio', { name: /Base historique/ })
    const presetBtn = screen.getByRole('button', { name: 'Présidentielle 2022' })
    expect(sourceRadio.compareDocumentPosition(presetBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    act(() => fireEvent.click(screen.getByRole('radio', { name: /Mélange hist\. \/ 2027/ })))
    expect(useSettings.getState().transferSource).toBe('blend')
    expect(screen.getByRole('slider', { name: 'Poids des déclarations 2027' })).toBeTruthy()

    act(() => fireEvent.click(screen.getByRole('radio', { name: /Déclarations 2027/ })))
    expect(useSettings.getState().transferSource).toBe('declared2027')
    expect(screen.queryByRole('slider', { name: 'Poids des déclarations 2027' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Présidentielle 2022' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /Base historique/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('expose directement le Front républicain par électorat (gauche hors LFI sur LFI–RN, centre, droite) sans 4e curseur redondant', () => {
    act(() => useSettings.getState().setSelectedDuel('lepen|melenchon'))
    render(<Harness />)
    expect(screen.getByRole('slider', { name: 'Intensité globale du front républicain' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : Électeurs de gauche (hors LFI)' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : Électeurs du centre' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Front républicain : Électeurs de droite' })).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'Report gauche hors LFI vers Mélenchon' })).toBeNull()

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Présidentielle 2022' })))
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0, centre: 0, droite: 0 })

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Mi-chemin' })))
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 0.5, centre: 0.5, droite: 0.5 })

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Législatives 2024' })))
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 1, centre: 1, droite: 1 })

    // En passant à Le Pen – Philippe, le libellé redevient « Électeurs de gauche »
    act(() => useSettings.getState().setSelectedDuel('lepen|philippe'))
    expect(screen.getByRole('slider', { name: 'Front républicain : Électeurs de gauche' })).toBeTruthy()

    // En sélectionnant un duel hors RN (ex. Mélenchon – Philippe), source des reports et front républicain sont désactivés
    act(() => useSettings.getState().setSelectedDuel('melenchon|philippe'))
    expect(screen.getByText(/Inactif sur ce duel hors RN \(Mélenchon – Philippe\)/)).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Déclarations 2027/ }) as HTMLButtonElement).disabled).toBe(true)
    const presBtn = screen.getByRole('button', { name: 'Présidentielle 2022' }) as HTMLButtonElement
    expect(presBtn.disabled).toBe(true)
    act(() => fireEvent.click(presBtn))
    expect(useSettings.getState().republicanFront).toEqual({ gauche: 1, centre: 1, droite: 1 })
    for (const label of [
      'Intensité globale du front républicain',
      'Front républicain : Électeurs de gauche',
      'Front républicain : Électeurs du centre',
      'Front républicain : Électeurs de droite',
    ]) {
      const slider = screen.getByRole('slider', { name: label })
      expect(slider.closest('[data-disabled]')).toBeTruthy()
    }
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
      useSettings.getState().setRepublicanFront('gauche', 0)
    })
    render(<Harness />)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser tous les paramètres' })))
    expect(useSettings.getState()).toMatchObject({
      offerProjectionEnabled: true,
      transferSource: 'legislatives2024',
      republicanFront: { gauche: 1, centre: 1, droite: 1 },
    })
  })
})
