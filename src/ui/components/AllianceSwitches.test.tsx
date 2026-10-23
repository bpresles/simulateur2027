// @vitest-environment jsdom
// Petits candidats que les hypothèses retenues ne testent pas : leur ralliement reste activable (estimé).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { AllianceSwitches } from './AllianceSwitches'

function Harness() {
  const state = useSettings((s) => s)
  return <AllianceSwitches idPrefix="t" result={simulate(simulationData, selectSettings(state))} />
}

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

const minorAlliances = simulationData.polls.alliances.filter((a) =>
  a.members.some((id) => simulationData.polls.candidates.find((c) => c.id === id)?.minor),
)

describe('alliances non évaluées : petits candidats', () => {
  it('activables même quand Attal rejoint Philippe, puis estimées', () => {
    act(() => {
      useSettings.getState().setUntestedAlliances(true)
      useSettings.getState().setAlliances({ 'attal-philippe': true })
    })
    render(<Harness />)
    for (const a of minorAlliances.filter((x) => !x.members.includes('attal') && !x.members.includes('philippe'))) {
      const toggle = screen.getByRole('switch', { name: new RegExp(a.label) })
      expect(toggle.hasAttribute('disabled')).toBe(false)
      act(() => fireEvent.click(toggle))
      expect(toggle.getAttribute('aria-checked'), a.label).toBe('true')
      act(() => fireEvent.click(toggle))
    }
  })
})
