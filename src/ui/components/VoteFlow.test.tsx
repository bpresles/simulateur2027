// @vitest-environment jsdom
// Reports vers le second tour : bascule entre le diagramme de Sankey (par défaut) et le tableau.
import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { defaultSettings, simulate } from '../../domain/simulate'
import { cand } from '../candidates'
import { VoteFlow } from './VoteFlow'

afterEach(cleanup)

const result = simulate(simulationData, defaultSettings())

function renderFlow() {
  return render(
    <Tooltip.Provider>
      <VoteFlow result={result} />
    </Tooltip.Provider>,
  )
}

describe('reports vers le second tour', () => {
  it('affiche le diagramme par défaut, en premier onglet, puis le tableau, puis de nouveau le diagramme', () => {
    renderFlow()
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Graphique', 'Tableau'])
    expect(screen.queryByRole('table')).toBeNull()
    const chart = screen.getByRole('img')
    expect(chart.getAttribute('aria-label')).toContain(cand(result.secondRound.a).shortName)
    expect(chart.getAttribute('aria-describedby')).toBeTruthy()
    expect(chart.querySelectorAll('path.cand-svg').length).toBeGreaterThan(10)

    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()

    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Graphique' })))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('nomme les finalistes et les électorats, et épingle le détail d’un électorat au clic', () => {
    renderFlow()
    const sr = result.secondRound
    for (const name of [cand(sr.a).shortName, cand(sr.b).shortName, 'Blanc, abst.']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
    const biggest = [...sr.flows].filter((f) => !f.isFinalistVoter).sort((x, y) => y.share - x.share)[0]!
    const label = screen.getByRole('button', { name: new RegExp(`^${cand(biggest.candidateId).shortName}`) })
    act(() => fireEvent.click(label))
    expect(label.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByText(new RegExp(`^Électeurs de ${cand(biggest.candidateId).shortName} :`)),
    ).toBeTruthy()
    // Aucun nombre absolu de voix : seulement des points et des pourcentages.
    expect(document.body.textContent).not.toMatch(/\d\s?(millions?|voix)\b/)
  })
})
