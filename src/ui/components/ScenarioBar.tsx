import { simulationData } from '../../data/schema'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { num } from '../format'
import { AllianceSwitches } from './AllianceSwitches'
import { Segmented, Slider, Switch } from './controls'

const { hypothesisSets } = simulationData.polls

export function ScenarioBar({ result }: { result: SimulationResult }) {
  const s = useSettings()
  const institutes = (id: string) =>
    id === result.hypothesisSet.id ? ` (${result.institutesUsed} instituts)` : ''

  return (
    <section aria-labelledby="scenario-title" className="rounded-xl bg-surface p-5 shadow-[var(--ballot-shadow)]">
      <h2 id="scenario-title" className="sr-only">
        Scénario
      </h2>
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-x-10">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-2">Candidats testés au 1er tour</p>
          <Segmented
            label="Hypothèse de premier tour"
            value={result.hypothesisSet.id}
            onValueChange={s.setHypothesisSet}
            options={hypothesisSets.map((h) => ({ value: h.id, label: h.label, hint: h.description }))}
          />
          <p className="mt-2 max-w-[26rem] text-sm text-ink-3">
            {result.hypothesisSet.description}
            {institutes(result.hypothesisSet.id)}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">Alliances</legend>
            <AllianceSwitches idPrefix="alliance" />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">Ajustements fondés sur 2022</legend>
            <div className="mb-4">
              <Switch
                id="progression"
                checked={s.progressionEnabled}
                onCheckedChange={s.setProgressionEnabled}
                label="Progression comme en 2022"
                description="Estime les derniers sondages avant le vote selon l’évolution d’octobre 2021 à avril 2022"
              />
            </div>
            <Switch
              id="corrections"
              checked={s.correctionsEnabled}
              onCheckedChange={s.setCorrectionsEnabled}
              label="Corriger la moyenne"
              description="Selon l’écart réel entre derniers sondages et résultat en 2022"
            />
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-ink-3" title="100 % reproduit exactement l’écart de 2022">
                Intensité
              </span>
              <Slider
                label="Intensité de la correction"
                value={s.correctionIntensity * 100}
                onValueChange={(v) => s.setCorrectionIntensity(v / 100)}
                min={0}
                max={150}
                step={5}
                disabled={!s.correctionsEnabled}
              />
              <span className="num w-12 text-right text-sm font-medium">
                {num(s.correctionIntensity * 100, 0)}&#8239;%
              </span>
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  )
}
