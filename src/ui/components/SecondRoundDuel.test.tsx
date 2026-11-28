// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { defaultSettings, simulate } from '../../domain/simulate'
import type { CandidateId, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { frozenData } from '../../test/frozenData'
import { SecondRoundDuel } from './SecondRoundDuel'

afterEach(() => {
  cleanup()
  act(() => useSettings.getState().resetAll())
})

const baseResult = simulate(frozenData, defaultSettings())

function withDuel(a: CandidateId, b: CandidateId): SimulationResult {
  const entrants = baseResult.entrants.slice()
  for (const id of [a, b]) {
    if (!entrants.some((e) => e.id === id)) entrants.push({ id, score: 15 })
  }
  return {
    ...baseResult,
    entrants,
    secondRound: { ...baseResult.secondRound, a, b },
  }
}

describe('SecondRoundDuel — tableaux P4 (entre-deux-tours et législatives 2024)', () => {
  it('affiche le tableau entre-deux-tours (2017 et 2022) par défaut avec la moyenne 2017–2022 appliquée et masque le tableau législatif sans paire stricte', () => {
    render(<SecondRoundDuel result={withDuel('lepen', 'melenchon')} />)
    expect(screen.getByRole('heading', { name: /Entre-deux-tours \(moyenne 2017–2022 appliquée au calcul/ })).toBeTruthy()
    expect(screen.getAllByText('(dans la moy.)')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '2022 (Macron – Le Pen)' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '2017 (Macron – Le Pen)' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeNull()
  })

  it('n’affiche pas le tableau législatif pour une paire voisine (Horizons – RN ≠ Renaissance – RN)', () => {
    render(<SecondRoundDuel result={withDuel('philippe', 'lepen')} />)
    expect(screen.queryByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeNull()
  })

  it('affiche le tableau législatif 2024 pour le duel exact Renaissance – RN (Attal – Le Pen)', () => {
    render(<SecondRoundDuel result={withDuel('attal', 'lepen')} />)
    expect(screen.getByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeTruthy()
    expect(screen.getByText('6e circonscription du Calvados')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Élisabeth Borne (Renaissance)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Nicolas Calbrix (RN)' })).toBeTruthy()
  })

  it('affiche « pour mémoire, non utilisé dans le calcul » lorsque l’option entre-deux-tours est désactivée, et supprime la mention lorsqu’elle est activée', () => {
    act(() => useSettings.getState().setBetweenRoundsBias('none'))
    const resNone = simulate(
      frozenData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: 'none' },
      { monteCarloIterations: 1 },
    )
    const { rerender } = render(<SecondRoundDuel result={resNone} />)
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours (pour mémoire, non utilisé dans le calcul)' })).toBeTruthy()

    act(() => useSettings.getState().setBetweenRoundsBias('2022'))
    const res2022 = simulate(
      frozenData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: '2022' },
      { monteCarloIterations: 1 },
    )
    rerender(<SecondRoundDuel result={res2022} />)
    expect(screen.queryByText(/non utilisé dans le calcul/i)).toBeNull()
    expect(screen.getByRole('heading', { name: /Entre-deux-tours \(écart 2022 appliqué au calcul/ })).toBeTruthy()
    expect(screen.getByText('(appliqué)')).toBeTruthy()

    act(() => useSettings.getState().setBetweenRoundsBias('2017'))
    const res2017 = simulate(
      frozenData,
      { ...defaultSettings(), selectedDuel: 'lepen|philippe', betweenRoundsBias: '2017' },
      { monteCarloIterations: 1 },
    )
    rerender(<SecondRoundDuel result={res2017} />)
    expect(screen.queryByText(/non utilisé dans le calcul/i)).toBeNull()
    expect(screen.getByRole('heading', { name: /Entre-deux-tours \(écart 2017 appliqué au calcul/ })).toBeTruthy()

    // Duel hors RN avec option activée : pas de mention « non utilisé dans le calcul », mais mention « sans effet hors duel RN »
    const resNonRn = simulate(
      frozenData,
      { ...defaultSettings(), selectedDuel: 'melenchon|philippe', betweenRoundsBias: '2017' },
      { monteCarloIterations: 1 },
    )
    rerender(<SecondRoundDuel result={resNonRn} />)
    expect(screen.queryByText(/non utilisé dans le calcul/i)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours (option 2017 activée, sans effet hors duel RN)' })).toBeTruthy()
  })
})
