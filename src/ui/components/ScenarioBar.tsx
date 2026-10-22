import { newestFirst } from '../../domain/pollAverage'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { fieldwork, num } from '../format'
import { simulationData } from '../../data/schema'
import { AllianceSwitches, UntestedAlliancesSwitch } from './AllianceSwitches'
import { Checkbox, Slider, Switch } from './controls'

const allianceLabel = new Map(simulationData.polls.alliances.map((a) => [a.id, a.label]))

/**
 * Candidats testés : hypothèses retenues (les alliances testées y retirent leurs ralliés), par groupe de
 * sondages quand certains ne testent qu'une partie des alliances, suivies des alliances estimées.
 */
function firstRoundSummary(result: SimulationResult): string {
  const groups = result.hypothesisGroups
  const label = (id: string) => allianceLabel.get(id) ?? id
  // Alliances estimées pour tous les sondages ; les autres sont précisées groupe par groupe.
  const everywhere = result.estimatedAllianceIds.filter((id) => groups.every((g) => g.estimatedAllianceIds.includes(id)))
  const estimated = everywhere.map((id) => `${label(id)} (estimée)`)
  if (groups.length <= 1) return [result.hypothesisSet.description.replace(/\.$/, ''), ...estimated].join(', ') + '.'
  const institute = new Map(result.pollUsage.map((u) => [u.poll.id, u.poll.institute]))
  const parts = groups.map((g) => {
    const extra = g.estimatedAllianceIds.filter((id) => !everywhere.includes(id)).map(label)
    const many = extra.length > 1 ? 's' : ''
    return `« ${g.set.label} » pour ${g.pollIds.map((id) => institute.get(id)).join(', ')}${
      extra.length > 0 ? ` (${extra.join(', ')} y ${extra.length > 1 ? 'sont' : 'est'} estimée${many})` : ''
    }`
  })
  return `Hypothèses ${parts.join(' ; ')}${estimated.length > 0 ? ` ; ${estimated.join(', ')}` : ''}.`
}

export function ScenarioBar({ result }: { result: SimulationResult }) {
  const s = useSettings()
  const resetAll = useSettings((s) => s.resetAll)
  const singlePoll = result.institutesUsed === 1 ? result.pollUsage.find((u) => u.status === 'used')?.poll : undefined
  const basis = singlePoll
    ? ` (sondage ${singlePoll.institute} seul, ${fieldwork(singlePoll.fieldwork)})`
    : ` (moyenne de ${result.institutesUsed} instituts)`

  return (
    <section aria-labelledby="scenario-title" className="rounded-xl bg-surface shadow-[var(--ballot-shadow)]">
      {/* Replié par défaut : les résultats restent en vue, les réglages s'ouvrent à la demande. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 hover:bg-sunken/50 [&::-webkit-details-marker]:hidden">
          <h2 id="scenario-title" className="text-lg font-semibold tracking-tight">
            Paramètres de la simulation
          </h2>
          <ChevronIcon />
        </summary>
        <div className="grid gap-6 px-5 pb-5 pt-1 md:grid-cols-[auto_1fr] md:gap-x-10">
          <div>
            <p className="mb-2 text-lg font-medium text-ink-2">Candidats testés au 1er tour</p>
            <p className="max-w-[26rem] text-sm text-ink-3">
              {firstRoundSummary(result)}
              {basis}
            </p>
            <PollPicker result={result} />
          </div>

          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-lg font-medium text-ink-2">Alliances</legend>
            <AllianceSwitches idPrefix="alliance" result={result} columns />
          </fieldset>

          {/* À droite des sondages sur grand écran ; sous les alliances sur mobile. */}
          <fieldset className="md:col-start-2 md:row-start-1">
            <legend className="mb-2 text-lg font-medium text-ink-2">Ajustements de la simulation</legend>
            <div className="mb-4">
              <UntestedAlliancesSwitch id="untested-alliances" />
            </div>
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
          <div>
            <button type="button" className="link text-sm" onClick={resetAll}>
              Réinitialiser tous les paramètres
            </button>
          </div>
        </div>
      </details>
    </section>
  )
}

/** Chevron du bloc repliable, tourné vers le haut quand il est ouvert. */
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
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
          // Synthèse de l'institut, à défaut la publication reprise par Wikipedia ; notice à part.
          const synthesis =
            p.sources.find((s) => s.kind === 'synthese') ??
            p.sources.find((s) => !s.kind && !/wikipedia|commission-des-sondages/.test(s.url))
          const notice = p.sources.find((s) => s.kind === 'notice' || /commission-des-sondages/.test(s.url))
          return (
            <div key={p.id} className="flex items-start gap-2">
              <Checkbox
                id={`poll-${p.id}`}
                checked={checked}
                onCheckedChange={(v) => setPollIncluded(p.id, v)}
                disabled={last}
                title={last ? 'Au moins un sondage doit rester coché' : undefined}
                label={p.institute}
                description={fieldwork(p.fieldwork)}
              />
              <span className="mt-0.5 flex shrink-0 items-center gap-2">
                {synthesis && (
                  <a
                    href={synthesis.url}
                    target="_blank"
                    rel="noreferrer"
                    title={synthesis.label}
                    aria-label={`${synthesis.label} : sondage ${p.institute} (nouvel onglet)`}
                    className="rounded text-ink-3 transition-colors hover:text-ballpoint"
                  >
                    <ExternalLinkIcon />
                  </a>
                )}
                {notice && (
                  <a
                    href={notice.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Notice déposée à la Commission des sondages"
                    aria-label={`Note technique du sondage ${p.institute}, Commission des sondages (nouvel onglet)`}
                    className="link text-xs"
                  >
                    note technique
                  </a>
                )}
              </span>
            </div>
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

/** Icône de lien externe (flèche sortant d'un cadre). */
function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
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
