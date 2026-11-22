import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { PLAUSIBLE_DUEL_MIN_FREQUENCY } from '../../domain/simulate'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { pct } from '../format'

/** Sélecteur des duels plausibles de 2nd tour (fréquence > 30 % dans les 2 000 simulations). */
export function QualificationSwitch({ result }: { result: SimulationResult }) {
  const setSelectedDuel = useSettings((s) => s.setSelectedDuel)
  const duels = result.selectableDuels
  if (duels.length <= 1) return null

  const activeId = `${result.secondRound.a}|${result.secondRound.b}`
  const defaultId = duels[0]!.id

  return (
    <section
      aria-labelledby="qualification-title"
      className="mt-6 rounded-xl border border-rule bg-surface px-5 py-4 shadow-[var(--ballot-shadow)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="qualification-title" className="font-semibold">
          Duels plausibles au second tour
        </h2>
        <span className="text-xs text-ink-3">
          Fréquence &gt; {PLAUSIBLE_DUEL_MIN_FREQUENCY}&#8239;% sur{' '}
          {result.monteCarlo.iterations.toLocaleString('fr-FR')} simulations
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        À cet horizon, la qualification au second tour reste ouverte. Choisissez un duel pour explorer ses reports de
        voix et son intervalle d’incertitude.
      </p>
      <ToggleGroup.Root
        type="single"
        value={activeId}
        onValueChange={(v) => {
          if (!v) return
          setSelectedDuel(v === defaultId ? null : v)
        }}
        aria-label="Duel de second tour affiché"
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {duels.map((d) => {
          const a = cand(d.a)
          const b = cand(d.b)
          return (
            <ToggleGroup.Item
              key={d.id}
              value={d.id}
              className="rounded-lg border border-rule bg-paper px-3.5 py-2.5 text-left transition-colors hover:border-ballpoint data-[state=on]:border-ballpoint data-[state=on]:bg-ballpoint-soft/40 data-[state=on]:ring-2 data-[state=on]:ring-ballpoint"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
                <span className="truncate">
                  {a.shortName} – {b.shortName}
                </span>
                <span className="num shrink-0 text-xs font-normal text-ink-3">
                  {d.frequency >= 0.5 ? pct(d.frequency, 0) : '< 1 %'}
                </span>
              </span>
              <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
                <span style={colorVars(a)} className="cand-fill h-2.5 w-2.5 rounded-full" />
                <span className="num">{pct(d.result.pct.a)}</span>
                <span className="text-ink-3">–</span>
                <span style={colorVars(b)} className="cand-fill h-2.5 w-2.5 rounded-full" />
                <span className="num">{pct(d.result.pct.b)}</span>
              </span>
            </ToggleGroup.Item>
          )
        })}
      </ToggleGroup.Root>
    </section>
  )
}
