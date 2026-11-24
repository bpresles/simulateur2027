// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { defaultSettings, simulate } from '../../domain/simulate'
import type { CandidateId, SimulationResult } from '../../domain/types'
import { frozenData } from '../../test/frozenData'
import { SecondRoundDuel } from './SecondRoundDuel'

afterEach(cleanup)

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
  it('affiche le tableau entre-deux-tours (2017 et 2022) et masque le tableau législatif sans paire stricte', () => {
    render(<SecondRoundDuel result={withDuel('lepen', 'melenchon')} />)
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours (pour mémoire, non utilisé dans le calcul)' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '2022 (Macron – Le Pen)' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '2017 (Macron – Le Pen)' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeNull()
  })

  it('n’affiche pas le tableau législatif pour une paire voisine (Horizons – RN ≠ Renaissance – RN)', () => {
    render(<SecondRoundDuel result={withDuel('philippe', 'lepen')} />)
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours (pour mémoire, non utilisé dans le calcul)' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeNull()
  })

  it('affiche le tableau législatif 2024 pour le duel exact Renaissance – RN (Attal – Le Pen)', () => {
    render(<SecondRoundDuel result={withDuel('attal', 'lepen')} />)
    expect(screen.getByRole('heading', { name: 'Entre-deux-tours (pour mémoire, non utilisé dans le calcul)' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Législatives 2024, même duel de partis' })).toBeTruthy()
    expect(screen.getByText('6e circonscription du Calvados')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Élisabeth Borne (Renaissance)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Nicolas Calbrix (RN)' })).toBeTruthy()
  })
})
