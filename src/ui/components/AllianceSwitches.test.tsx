// @vitest-environment jsdom
// Alliances testées par les sondeurs : activation, combinaisons et exclusivité.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { availableAlliances, testedOptions } from '../../domain/alliances'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { AllianceSwitches } from './AllianceSwitches'

function Harness() {
  const state = useSettings((s) => s)
  const result = simulate(simulationData, selectSettings(state))
  return <AllianceSwitches idPrefix="t" result={result} />
}

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

describe('AllianceSwitches (alliances testées uniquement)', () => {
  const proposed = availableAlliances(simulationData.polls)
  const multiOptions = testedOptions(simulationData.polls).filter((o) => o.alliances.length > 1)

  it('propose toutes les alliances testées et permet d’activer et désactiver une alliance simple', () => {
    render(<Harness />)
    expect(proposed.length).toBeGreaterThan(0)
    const first = proposed.find((a) => a.id === 'attal-philippe') ?? proposed[0]!
    const toggle = screen.getByRole('switch', { name: (_, el) => el.id === `t-${first.id}` })
    expect(toggle.hasAttribute('disabled')).toBe(false)
    act(() => fireEvent.click(toggle))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(useSettings.getState().alliances[first.id]).toBe(true)
    act(() => fireEvent.click(toggle))
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(useSettings.getState().alliances[first.id]).toBeUndefined()
  })

  it('propose les combinaisons multi-alliances testées par les sondeurs', () => {
    if (multiOptions.length === 0) return
    render(<Harness />)
    const opt = multiOptions[0]!
    const toggle = screen.getByRole('switch', { name: (_, el) => el.id === `t-${opt.id}` })
    act(() => fireEvent.click(toggle))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(Object.keys(useSettings.getState().alliances).sort()).toEqual(opt.alliances.map((a) => a.id).sort())
    act(() => fireEvent.click(toggle))
    expect(Object.keys(useSettings.getState().alliances)).toEqual([])
  })
})
