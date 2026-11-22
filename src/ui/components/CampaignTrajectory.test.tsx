// @vitest-environment jsdom
// Graphique de trajectoire : piloté uniquement par l'horizon temporel des paramètres de la simulation.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { date } from '../format'
import { CampaignTrajectory } from './CampaignTrajectory'
import { ScenarioBar } from './ScenarioBar'

function Harness() {
  const state = useSettings((s) => s)
  const result = simulate(simulationData, selectSettings(state))
  return (
    <>
      <ScenarioBar result={result} onOpenSettings={() => {}} />
      <CampaignTrajectory result={result} />
    </>
  )
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

describe('CampaignTrajectory : piloté par l’horizon temporel global de ScenarioBar', () => {
  it('n’affiche pas de sélecteur dupliqué dans la trajectoire et suit le réglage de ScenarioBar', () => {
    const { container } = render(<Harness />)
    const svg = () => screen.getByRole('img', { name: /Trajectoire des intentions de vote/ })

    // Aucun sélecteur d'horizon redondant dans la section trajectoire
    expect(screen.queryByRole('group', { name: 'Horizon de la simulation' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Photographie actuelle' })).toBeNull()

    // Par défaut : projection avril 2027 active -> courbes en pointillés et horizon au jour du scrutin
    expect(svg().getAttribute('aria-label')).toContain(date(simulationData.polls.electionDate))
    expect(container.querySelectorAll('path[stroke-dasharray="5 4"]').length).toBeGreaterThan(0)

    // Bascule vers « Aujourd’hui » dans ScenarioBar -> la trajectoire s'arrête strictement à asOf
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Aujourd’hui' })))
    expect(svg().getAttribute('aria-label')).toContain(date(simulationData.polls.asOf))
    expect(svg().getAttribute('aria-label')).not.toContain(date(simulationData.polls.electionDate))
    expect(container.querySelectorAll('path[stroke-dasharray="5 4"]').length).toBe(0)

    // Retour vers « Projection avril 2027 » -> la trajectoire repart jusqu'au scrutin
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Projection avril 2027' })))
    expect(svg().getAttribute('aria-label')).toContain(date(simulationData.polls.electionDate))
    expect(container.querySelectorAll('path[stroke-dasharray="5 4"]').length).toBeGreaterThan(0)
  })
})
