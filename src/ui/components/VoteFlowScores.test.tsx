// @vitest-environment jsdom
// Score des candidats dans les reports : le même que dans « Premier tour simulé » (% des exprimés).
import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { simulationData } from '../../data/schema'
import { newVoterRates } from '../../domain/newVoters'
import { defaultSettings, simulate } from '../../domain/simulate'
import { cand } from '../candidates'
import { pct, shownScore } from '../format'
import { VoteFlow } from './VoteFlow'

afterEach(cleanup)

const result = simulate(simulationData, defaultSettings())
/** Candidats seuls dans leur entrant : leur score du « Premier tour simulé » est affiché tel quel. */
const solos = result.entrants.filter((e) => e.members.length === 1 && e.score > 0.5)

function renderFlow() {
  return render(
    <Tooltip.Provider>
      <VoteFlow result={result} />
    </Tooltip.Provider>,
  )
}

describe('score des candidats dans les reports', () => {
  it('le graphique affiche le score du premier tour simulé (en % des exprimés), pas des inscrits', () => {
    renderFlow()
    expect(solos.length).toBeGreaterThan(5)
    for (const e of solos) {
      // Les étiquettes de gauche précèdent celles de droite : la première est celle de l'électorat.
      const label = screen
        .getAllByRole('button')
        .find((b) => b.textContent?.startsWith(cand(e.id).shortName))!
      expect(label.textContent).toContain(pct(shownScore(result, e)))
    }
  })

  it('le tableau affiche le même score, et les groupes non exprimés en % des inscrits', () => {
    renderFlow()
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    for (const e of solos) {
      const row = rows.find((r) => r.textContent?.startsWith(cand(e.id).shortName))!
      expect(within(row).getAllByRole('cell')[1]!.textContent).toBe(pct(shownScore(result, e)))
    }
    const abstention = rows.find((r) => r.textContent?.startsWith('Abstention au 1er tour'))!
    expect(within(abstention).getAllByRole('cell')[1]!.textContent).toMatch(/des inscrits$/)
  })

  it('les blancs et nuls du 1er tour sont en % des votants (bnShare), dans le graphique et le tableau', () => {
    const shown = `${pct(newVoterRates(simulationData).bnShare * 100)} des votants`
    renderFlow()
    for (const name of [/^Blancs et nuls au 1er tour/, /^Non mesuré/]) {
      expect(screen.getByRole('button', { name }).textContent).toContain(shown.replace(' des votants', ''))
      expect(screen.getByRole('button', { name }).textContent).toContain('des votants')
    }
    expect(screen.getByRole('button', { name: /^Blancs et nuls au 1er tour/ }).textContent).toContain(shown)
    act(() => fireEvent.click(screen.getByRole('radio', { name: 'Tableau' })))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const blankNull = rows.find((r) => r.textContent?.startsWith('Blancs et nuls au 1er tour'))!
    expect(within(blankNull).getAllByRole('cell')[1]!.textContent).toBe(shown)
  })
})
