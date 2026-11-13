// @vitest-environment jsdom
// Petits candidats que les hypothèses retenues ne testent pas : leur ralliement reste activable (estimé).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { testedShare } from '../../domain/alliances'
import { simulate } from '../../domain/simulate'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { AllianceSwitches } from './AllianceSwitches'

function Harness() {
  const state = useSettings((s) => s)
  const result = simulate(simulationData, selectSettings(state))
  return (
    <>
      <AllianceSwitches idPrefix="t" result={result} />
      <AllianceSwitches idPrefix="g" result={result} grouped />
    </>
  )
}

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

const minorAlliances = simulationData.polls.alliances.filter((a) =>
  !a.grouped && a.members.some((id) => simulationData.polls.candidates.find((c) => c.id === id)?.minor),
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
      // Petit candidat qu'aucun sondage de la période ne teste (Bouamrane quand le seul sondage qui le
      // testait en sort) : pas de score à reprendre, l'alliance reste désactivée.
      if (a.members.some((id) => testedShare(simulationData.polls, id) <= 0)) {
        expect(toggle.hasAttribute('disabled'), a.label).toBe(true)
        continue
      }
      expect(toggle.hasAttribute('disabled'), a.label).toBe(false)
      act(() => fireEvent.click(toggle))
      expect(toggle.getAttribute('aria-checked'), a.label).toBe('true')
      act(() => fireEvent.click(toggle))
    }
  })
})

describe('alliances groupées', () => {
  const grouped = simulationData.polls.alliances.filter((a) => a.grouped)

  it('proposées seulement avec leur option, retirées quand elle est désactivée', () => {
    render(<Harness />)
    expect(screen.queryByRole('switch', { name: new RegExp(grouped[0]!.label) })).toBeNull()
    act(() => useSettings.getState().setGroupedAlliances(true))
    for (const a of grouped) expect(screen.getByRole('switch', { name: new RegExp(a.label) })).toBeTruthy()
  })

  it('activables, puis appliquées au 1er tour derrière leur leader', () => {
    act(() => useSettings.getState().setGroupedAlliances(true))
    render(<Harness />)
    const a = grouped.find((x) => x.id === 'groupe-gauche-sans-lfi')!
    const toggle = screen.getByRole('switch', { name: new RegExp(a.label) })
    expect(toggle.hasAttribute('disabled')).toBe(false)
    act(() => fireEvent.click(toggle))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    const result = simulate(simulationData, selectSettings(useSettings.getState()))
    expect(result.estimatedAllianceIds).toEqual([a.id])
    expect(result.entrants.find((e) => e.id === a.leader)?.members).toHaveLength(a.members.length)
  })
})
