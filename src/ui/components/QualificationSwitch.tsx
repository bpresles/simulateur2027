import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { SecondRoundResult, SimulationResult } from '../../domain/types'
import { TIGHT_QUALIFICATION_GAP } from '../../domain/simulate'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars, entrantLabel } from '../candidates'
import { num, pct } from '../format'

/** Qualification serrée : bascule entre le 2nd tour avec le 2e et celui avec le 3e du 1er tour. */
export function QualificationSwitch({ result }: { result: SimulationResult }) {
  const setPick = useSettings((s) => s.setQualificationPick)
  const { tight, gap, picked, withSecond, withThird } = result.qualification
  if (!tight || !withThird || gap === null) return null
  const [, second, third] = result.entrants

  return (
    <section
      aria-labelledby="qualification-title"
      className="mt-6 rounded-xl border-l-4 border-hypo bg-hypo-soft px-5 py-4"
    >
      <h2 id="qualification-title" className="font-semibold">
        Qualification serrée : deux seconds tours possibles
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {entrantLabel(second!)} ({pct(second!.score)}) devance {entrantLabel(third!)} ({pct(third!.score)}) de{' '}
        {num(gap, 2)} point, sous le seuil de {num(TIGHT_QUALIFICATION_GAP, 0)} point : un écart bien inférieur à la
        marge d’erreur des sondages. Choisissez le second tour à afficher.
      </p>
      <ToggleGroup.Root
        type="single"
        value={picked}
        onValueChange={(v) => v && setPick(v as 'second' | 'third')}
        aria-label="Second tour affiché"
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        <Option value="second" round={withSecond} rank="2e" />
        <Option value="third" round={withThird} rank="3e" />
      </ToggleGroup.Root>
    </section>
  )
}

function Option({ value, round, rank }: { value: string; round: SecondRoundResult; rank: string }) {
  const a = cand(round.a)
  const b = cand(round.b)
  return (
    <ToggleGroup.Item
      value={value}
      className="rounded-lg border border-rule bg-surface px-4 py-3 text-left transition-colors hover:border-ballpoint data-[state=on]:border-ballpoint data-[state=on]:ring-2 data-[state=on]:ring-ballpoint"
    >
      <span className="block text-sm font-semibold text-ink">
        {a.shortName} contre {b.shortName}
        <span className="ml-2 font-normal text-ink-3">avec le {rank} du 1er tour</span>
      </span>
      <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
        <span style={colorVars(a)} className="cand-fill h-2.5 w-2.5 rounded-full" />
        <span className="num">{pct(round.pct.a)}</span>
        <span className="text-ink-3">–</span>
        <span style={colorVars(b)} className="cand-fill h-2.5 w-2.5 rounded-full" />
        <span className="num">{pct(round.pct.b)}</span>
      </span>
    </ToggleGroup.Item>
  )
}
