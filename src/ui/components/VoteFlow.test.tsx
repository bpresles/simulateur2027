// @vitest-environment jsdom
// Reports vers le second tour : bascule entre le diagramme de Sankey (par défaut) et le tableau.
import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { defaultSettings, simulate } from '../../domain/simulate'
import { cand } from '../candidates'
import { pct, shownScore } from '../format'
import { VoteFlow } from './VoteFlow'

afterEach(cleanup)

const result = simulate(simulationData, defaultSettings())

function renderFlow(res = result) {
  return render(
    <Tooltip.Provider>
      <VoteFlow result={res} />
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
    // Les finalistes affichent leur score en % des exprimés (pas leur total en % des inscrits).
    const sr = result.secondRound
    const compositions = within(
      screen.getByRole('list', { name: 'Composition des voix des finalistes' }),
    ).getAllByRole('listitem')
    expect(compositions).toHaveLength(2)
    for (const [row, id, score, inscrits] of [
      [compositions[0]!, sr.a, sr.pct.a, sr.totals.a],
      [compositions[1]!, sr.b, sr.pct.b, sr.totals.b],
    ] as const) {
      expect(row.textContent).toContain(cand(id).shortName)
      expect(row.textContent).toContain(pct(score))
      expect(row.textContent).not.toContain(pct(inscrits))
    }

    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Graphique' })))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('vérifie le score des finalistes même quand leur total en % des inscrits coïncide avec un score du 1er tour', () => {
    const firstRoundA = shownScore(
      result,
      result.entrants.find((e) => e.id === result.secondRound.a)!,
    )
    const colliding = {
      ...result,
      secondRound: {
        ...result.secondRound,
        totals: { ...result.secondRound.totals, b: firstRoundA },
      },
    }
    renderFlow(colliding)
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    const compositions = within(
      screen.getByRole('list', { name: 'Composition des voix des finalistes' }),
    ).getAllByRole('listitem')
    expect(compositions[1]!.textContent).toContain(pct(colliding.secondRound.pct.b))
    expect(compositions[1]!.textContent).not.toContain(pct(firstRoundA))
    expect(screen.getByRole('table').textContent).toContain(pct(firstRoundA))
  })

  it('le tableau ajoute l’abstention et les blancs et nuls du 1er tour (hypothèse S1 unifiée, non mesurés séparément)', () => {
    renderFlow()
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const abstention = rows.find((r) => r.textContent?.startsWith('Abstention au 1er tour'))!
    const blankNull = rows.find((r) => r.textContent?.startsWith('Blancs et nuls au 1er tour'))!
    expect(abstention).toBeTruthy()
    expect(blankNull.textContent).toContain('non mesuré séparément')
    for (const row of [abstention, blankNull]) {
      const shares = within(row)
        .getAllByRole('cell')
        .slice(2)
        .map((c) => Number.parseFloat((c.textContent ?? '').replace(',', '.')))
      expect(shares).toHaveLength(3)
      expect(shares.reduce((t, v) => t + v, 0)).toBeCloseTo(100, 0)
    }
    expect(within(table).getByRole('columnheader', { name: 'Ne s’expriment pas' })).toBeTruthy()
    expect(document.querySelectorAll('div.bg-ink-3\\/60, span.bg-ink-3\\/60').length).toBeGreaterThanOrEqual(2)
  })

  it('le graphique a les nœuds « Abstention au 1er tour », « Blancs et nuls au 1er tour » et 3 sorties unifiées', () => {
    renderFlow()
    for (const name of ['Abstention au 1er tour', 'Blancs et nuls au 1er tour', 'Ne s’expriment pas']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByRole('button', { name: /^Non mesuré/ })).toBeNull()
    const chart = screen.getByRole('img')
    expect(chart.getAttribute('aria-label')).toContain('% des inscrits')
    const bnButton = screen.getByRole('button', { name: /^Blancs et nuls au 1er tour/ })
    act(() => fireEvent.click(bnButton))
    expect(document.querySelector('p[aria-live]')?.textContent).toMatch(
      /^Blancs et nuls au 1er tour : .* Aucune source publique ne mesure séparément le vote au 2nd tour/,
    )
  })

  it('nomme les finalistes et les électorats, et épingle le détail d’un électorat au clic', () => {
    renderFlow()
    const sr = result.secondRound
    for (const name of [cand(sr.a).shortName, cand(sr.b).shortName, 'Ne s’expriment pas']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
    for (const f of sr.flows.filter((f) => f.share > 0)) {
      expect(
        screen.getAllByRole('button', { name: new RegExp(`^${cand(f.candidateId).shortName}`) }).length,
      ).toBeGreaterThan(0)
    }
    const biggest = [...sr.flows].filter((f) => !f.isFinalistVoter).sort((x, y) => y.share - x.share)[0]!
    const label = screen.getByRole('button', { name: new RegExp(`^${cand(biggest.candidateId).shortName}`) })
    act(() => fireEvent.click(label))
    expect(label.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(new RegExp(`^Électeurs de ${cand(biggest.candidateId).shortName} :`))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\d\s?(millions?|voix)\b/)
  })
})
