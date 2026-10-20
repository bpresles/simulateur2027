import { newestFirst } from '../../domain/pollAverage'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { fieldwork, num } from '../format'
import { AllianceSwitches } from './AllianceSwitches'
import { Checkbox, Slider, Switch } from './controls'

/** Candidats testés : description du jeu d'hypothèses retenu (les alliances y retirent leurs ralliés). */
function firstRoundSummary(result: SimulationResult): string {
  return result.hypothesisSet.description
}

export function ScenarioBar({ result }: { result: SimulationResult }) {
  const s = useSettings()
  const resetAll = useSettings((s) => s.resetAll)
  const singlePoll = result.institutesUsed === 1 ? result.pollUsage.find((u) => u.status === 'used')?.poll : undefined
  const basis = singlePoll
    ? ` (sondage ${singlePoll.institute} seul, ${fieldwork(singlePoll.fieldwork)})`
    : ` (moyenne de ${result.institutesUsed} instituts)`

  return (
    <section aria-labelledby="scenario-title" className="rounded-xl bg-surface p-5 shadow-[var(--ballot-shadow)]">
      <h2 id="scenario-title" className="sr-only">
        Scénarios
      </h2>
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-x-10">
        <div>
          <p className="mb-2 text-lg font-medium text-ink-2">Candidats testés au 1er tour</p>
          <p className="max-w-[26rem] text-sm text-ink-3">
            {firstRoundSummary(result)}
            {basis}
          </p>
          <PollPicker result={result} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-lg font-medium text-ink-2">Alliances</legend>
            <AllianceSwitches idPrefix="alliance" />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-lg font-medium text-ink-2">Ajustements fondés sur 2022</legend>
            <div className="mb-4">
              <Switch
                id="progression"
                checked={s.progressionEnabled}
                onCheckedChange={s.setProgressionEnabled}
                label="Progression comme en 2022"
                description="Estime les derniers sondages avant le vote selon l’évolution d’octobre 2021 à avril 2022"
              />
              <Intensity
                label="Intensité de la progression"
                hint="la progression de 2022"
                value={s.progressionIntensity}
                onValueChange={s.setProgressionIntensity}
                disabled={!s.progressionEnabled}
              />
            </div>
            <Switch
              id="corrections"
              checked={s.correctionsEnabled}
              onCheckedChange={s.setCorrectionsEnabled}
              label="Corriger la moyenne"
              description="Selon l’écart réel entre derniers sondages et résultat en 2022"
            />
            <Intensity
              label="Intensité de la correction"
              hint="l’écart de 2022"
              value={s.correctionIntensity}
              onValueChange={s.setCorrectionIntensity}
              disabled={!s.correctionsEnabled}
            />
          </fieldset>
        </div>
        <div>
          <button type="button" className="link text-sm" onClick={resetAll}>
          Réinitialiser tous les paramètres
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Sondages proposés pour la base du 1er tour (dernier sondage de chaque institut testant l'hypothèse),
 * du plus récent au plus ancien. Le dernier sondage coché ne peut pas être décoché.
 */
function PollPicker({ result }: { result: SimulationResult }) {
  const excludedPolls = useSettings((s) => s.excludedPolls)
  const setPollIncluded = useSettings((s) => s.setPollIncluded)
  const includeAllPolls = useSettings((s) => s.includeAllPolls)
  const excluded = new Set(excludedPolls)
  const polls = result.pollUsage
    .filter((u) => u.status === 'used' || u.status === 'excluded')
    .map((u) => u.poll)
    .sort(newestFirst)
  const checkedCount = polls.filter((p) => !excluded.has(p.id)).length

  return (
    <fieldset className="mt-4">
      <legend className="text-[0.95rem] font-medium text-ink">Sondages retenus</legend>
      <p className="mt-0.5 text-sm text-ink-3">Un seul coché : sondage seul ; deux ou plus : moyenne</p>
      <div className="mt-2 space-y-1.5">
        {polls.map((p) => {
          const checked = !excluded.has(p.id)
          const last = checked && checkedCount === 1
          return (
            <Checkbox
              key={p.id}
              id={`poll-${p.id}`}
              checked={checked}
              onCheckedChange={(v) => setPollIncluded(p.id, v)}
              disabled={last}
              title={last ? 'Au moins un sondage doit rester coché' : undefined}
              label={p.institute}
              description={fieldwork(p.fieldwork)}
            />
          )
        })}
      </div>
      {checkedCount < polls.length && (
        <button type="button" className="link mt-2 text-sm" onClick={includeAllPolls}>
          Tout cocher
        </button>
      )}
    </fieldset>
  )
}

/** Curseur d'intensité d'un ajustement 2022 (1 = 100 %, reproduit 2022 à l'identique). */
function Intensity({
  label,
  hint,
  value,
  onValueChange,
  disabled,
}: {
  label: string
  hint: string
  value: number
  onValueChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="text-sm text-ink-3" title={`100 % reproduit exactement ${hint}`}>
        Intensité <br />
        (100&#8239;% reproduit exactement {hint})
      </span>
      <Slider
        label={label}
        value={value * 100}
        onValueChange={(v) => onValueChange(v / 100)}
        min={0}
        max={150}
        step={5}
        disabled={disabled}
      />
      <span className="num w-12 text-right text-sm font-medium">{num(value * 100, 0)}&#8239;%</span>
    </div>
  )
}
