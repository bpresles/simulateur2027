// @vitest-environment jsdom
// Graphique de trajectoire : prolongement en pointillés + cône 80 % en projection, arrêt strict à la date actuelle sinon.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { date } from '../format'
import { CampaignTrajectory } from './CampaignTrajectory'

function Harness() {
  const state = useSettings((s) => s)
  return <CampaignTrajectory result={simulate(simulationData, selectSettings(state))} />
}

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

describe('CampaignTrajectory : horizon photographie actuelle vs projection avril 2027', () => {
  it('prolonge jusqu’à la date du scrutin en mode projection et s’arrête à aujourd’hui en photographie actuelle', () => {
    const { container } = render(<Harness />)
    const svg = () => screen.getByRole('img', { name: /Trajectoire des intentions de vote/ })

    // Par défaut : projection avril 2027 active -> courbes en pointillés et horizon au jour du scrutin
    expect(svg().getAttribute('aria-label')).toContain(date(simulationData.polls.electionDate))
    expect(container.querySelectorAll('path[stroke-dasharray="5 4"]').length).toBeGreaterThan(0)

    // Bascule vers « Photographie actuelle » -> aucun pointillé futur, arrêt à asOf
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Photographie actuelle' })))
    expect(svg().getAttribute('aria-label')).toContain(date(simulationData.polls.asOf))
    expect(svg().getAttribute('aria-label')).not.toContain(date(simulationData.polls.electionDate))
    expect(container.querySelectorAll('path[stroke-dasharray="5 4"]').length).toBe(0)
  })
})
