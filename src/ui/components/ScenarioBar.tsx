import { simulationData } from '../../data/schema'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { fieldwork, num } from '../format'
import { AllianceSwitches } from './AllianceSwitches'
import { Slider, Switch } from './controls'

/**
 * Candidats testés : description du jeu d'hypothèses, suivie des alliances appliquées dans l'ordre des
 * données. Une alliance modélisée par un jeu d'hypothèses est déjà décrite par celui-ci.
 */
function firstRoundSummary(result: SimulationResult): string {
  const applied = new Set(result.entrants.flatMap((e) => e.allianceIds))
  const rallies = simulationData.polls.alliances.filter((a) => !a.hypothesisSet && applied.has(a.id))
  return [result.hypothesisSet.description.replace(/\.$/, ''), ...rallies.map((a) => a.label)].join(', ') + '.'
}

export function ScenarioBar({ result }: { result: SimulationResult }) {
  const s = useSettings()
  const resetAll = useSettings((s) => s.resetAll)
  const latestPoll = result.pollUsage.find((u) => u.status === 'used')?.poll
  const basis =
    result.pollMode === 'latest'
      ? latestPoll && ` (dernier sondage : ${latestPoll.institute}, ${fieldwork(latestPoll.fieldwork)})`
      : ` (${result.institutesUsed} instituts)`

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
          <div className="mt-4">
            <Switch
              id="latest-poll"
              checked={s.pollMode === 'latest'}
              onCheckedChange={(latest) => s.setPollMode(latest ? 'latest' : 'average')}
              label="Dernier sondage uniquement"
              description="Retient le sondage le plus récent au lieu de la moyenne des instituts"
            />
          </div>
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
