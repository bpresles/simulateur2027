// @vitest-environment jsdom
// Reports vers le second tour : bascule entre le diagramme de Sankey (par défaut) et le tableau.
import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { defaultSettings, simulate } from '../../domain/simulate'
import { cand } from '../candidates'
import { pct } from '../format'
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
    // Les finalistes ont le même résultat qu'au graphique : en % des exprimés, pas en points des électeurs.
    const sr = result.secondRound
    for (const [score, votes] of [
      [sr.pct.a, sr.votes.a],
      [sr.pct.b, sr.votes.b],
    ] as const) {
      expect(document.body.textContent).toContain(pct(score))
      expect(document.body.textContent).not.toContain(pct(votes))
    }

    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Graphique' })))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('le tableau ajoute l’abstention et les blancs et nuls du 1er tour, dont le vote n’est pas mesuré', () => {
    renderFlow()
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const abstention = rows.find((r) => r.textContent?.startsWith('Abstention au 1er tour'))!
    const blankNull = rows.find((r) => r.textContent?.startsWith('Blancs et nuls au 1er tour'))!
    expect(abstention).toBeTruthy()
    expect(blankNull.textContent).toContain('non mesuré')
    // Les parts vers A, vers B et vers « Ne s'expriment pas » totalisent 100 % de l'abstention.
    const shares = within(abstention)
      .getAllByRole('cell')
      .slice(2)
      .map((c) => Number.parseFloat((c.textContent ?? '').replace(',', '.')))
    expect(shares).toHaveLength(3)
    expect(shares.reduce((t, v) => t + v, 0)).toBeCloseTo(100, 0)
    expect(within(table).getByRole('columnheader', { name: 'Ne s’expriment pas' })).toBeTruthy()
    // La composition des voix de chaque finaliste compte un segment « Abstentionnistes du 1er tour ».
    expect(document.querySelectorAll('div.bg-ink-3\\/60, span.bg-ink-3\\/60').length).toBeGreaterThanOrEqual(2)
  })

  it('le graphique a des nœuds « Abstention au 1er tour » et « Non mesuré », ce dernier hachuré', () => {
    renderFlow()
    for (const name of ['Abstention au 1er tour', 'Blancs et nuls au 1er tour', 'Non mesuré', 'Ne s’expriment pas']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
    const chart = screen.getByRole('img')
    expect(chart.querySelector('pattern')).toBeTruthy()
    expect(chart.querySelector('rect[fill^="url(#hatch-"]')).toBeTruthy()
    expect(chart.getAttribute('aria-label')).toContain('% des inscrits')
    const unmeasured = screen.getByRole('button', { name: /^Non mesuré/ })
    act(() => fireEvent.click(unmeasured))
    expect(document.querySelector('p[aria-live]')?.textContent).toMatch(
      /^Non mesuré : .* Aucune source publique ne mesure le vote au 2nd tour des votants blancs ou nuls/,
    )
  })

  it('nomme les finalistes et les électorats, et épingle le détail d’un électorat au clic', () => {
    renderFlow()
    const sr = result.secondRound
    for (const name of [cand(sr.a).shortName, cand(sr.b).shortName, 'Ne s’expriment pas']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
    // Chaque électorat a son étiquette, même minuscule : le graphique s'allonge au lieu d'en masquer.
    for (const f of sr.flows.filter((f) => f.share > 0)) {
      expect(
        screen.getAllByRole('button', { name: new RegExp(`^${cand(f.candidateId).shortName}`) }).length,
      ).toBeGreaterThan(0)
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
