import { simulationData } from '../../data/schema'
import { newestFirst } from '../../domain/pollAverage'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand } from '../candidates'
import { fieldwork, num, pct } from '../format'
import { AllianceSwitches } from './AllianceSwitches'
import { BetweenRoundsBiasControl } from './BetweenRoundsBiasControl'
import { Checkbox, Segmented, Switch } from './controls'
import { RepublicanFrontControls } from './RepublicanFrontControls'
import type { SettingsTab } from './SettingsSheet'

export function ScenarioBar({
  result,
  onOpenSettings,
}: {
  result: SimulationResult
  onOpenSettings: (tab?: SettingsTab) => void
}) {
  const s = useSettings()
  const resetAll = useSettings((st) => st.resetAll)
  const singlePoll = result.institutesUsed === 1 ? result.pollUsage.find((u) => u.status === 'used')?.poll : undefined
  const basis = singlePoll
    ? ` (sondage ${singlePoll.institute} seul, ${fieldwork(singlePoll.fieldwork)})`
    : ` (moyenne pondérée de ${result.institutesUsed} instituts${result.projectedInstitutes > 0 ? `, dont ${result.projectedInstitutes} projeté${result.projectedInstitutes > 1 ? 's' : ''}` : ''})`

  const customPivots = Object.values(s.projection.usefulVote)
    .filter((u) => u.beneficiary !== 'auto')
    .map((u) => cand(u.beneficiary).shortName)

  const extraPillars = [
    s.projection.meanReversion > 0 ? `amortissement ${num(s.projection.meanReversion * 100, 0)} %` : null,
    s.projection.dampedTrend > 0 ? `tendance ${num(s.projection.dampedTrend * 100, 0)} %` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="scenario-title" className="rounded-xl bg-surface shadow-[var(--ballot-shadow)]">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 hover:bg-sunken/50 [&::-webkit-details-marker]:hidden">
          <h2 id="scenario-title" className="text-lg font-semibold tracking-tight">
            Paramètres de la simulation
            {s.projection.enabled && (
              <span className="ml-2 rounded-full bg-ballpoint-soft px-2.5 py-0.5 text-xs font-medium text-ballpoint">
                Projection avril 2027
              </span>
            )}
          </h2>
          <ChevronIcon />
        </summary>
        <div className="grid gap-6 px-5 pb-5 pt-1 md:grid-cols-[auto_1fr] md:gap-x-10">
          <div>
            <p className="mb-2 text-lg font-medium text-ink-2">Sondages de 1er tour</p>
            <p className="max-w-[26rem] text-sm text-ink-3">
              {result.hypothesisSet.description}
              {basis}
            </p>
            <PollPicker result={result} />
          </div>

          <fieldset className="md:col-start-2 md:row-start-1">
            <legend className="mb-2 text-lg font-medium text-ink-2">Hypothèses du modèle</legend>
            <div className="space-y-5">
              {/* Horizon temporel : aujourd'hui vs projection avril 2027 (s'applique à toute la simulation et à la trajectoire) */}
              <div className="rounded-lg border border-rule bg-paper/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.95rem] font-medium text-ink">Horizon temporel</p>
                  <Segmented<'now' | 'projected'>
                    label="Horizon temporel"
                    value={s.projection.enabled ? 'projected' : 'now'}
                    onValueChange={(v) => s.setProjectionEnabled(v === 'projected')}
                    options={[
                      { value: 'now', label: 'Aujourd’hui' },
                      { value: 'projected', label: 'Projection avril 2027' },
                    ]}
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-3">
                  {s.projection.enabled
                    ? `Projette le vote utile par bloc d’ici au 1er tour (J−${result.projection.daysRemaining}) : ${s.projection.mergeCenterRight ? 'Centre + Droite regroupés' : '4 blocs séparés'}${customPivots.length > 0 ? `, pivot forcé : ${customPivots.join(', ')}` : ''}${extraPillars.length > 0 ? ` + ${extraPillars.join(', ')}` : ''}.`
                    : 'Photographie pondérée des sondages actuels (sans projection temporelle). Activez la projection pour simuler le vote utile jusqu’à avril 2027.'}
                </p>
                <button
                  type="button"
                  className="link mt-2 block text-xs"
                  onClick={() => onOpenSettings('projection')}
                >
                  Régler finement le vote utile par bloc et la projection (réglages avancés)
                </button>
              </div>

              <Switch
                id="offer-projection"
                checked={s.offerProjectionEnabled}
                onCheckedChange={s.setOfferProjectionEnabled}
                label="Projeter les sondages à offre proche (paires propres)"
                description="Intègre les instituts qui ne testent pas un candidat (ex. Attal dans Odoxa ou Cluster17) en appliquant 100 % des transferts mesurés sur paires exactes intra-institut."
              />

              <Switch
                id="candidacy-uncertainty"
                checked={s.candidacyUncertaintyEnabled && !simulationData.polls.officialList}
                onCheckedChange={s.setCandidacyUncertaintyEnabled}
                disabled={result.allianceIds.length > 0 || Boolean(simulationData.polls.officialList)}
                label="Intégrer l’incertitude des candidatures (Monte-Carlo)"
                description={
                  simulationData.polls.officialList
                    ? 'Inactif : la liste officielle des candidats du Conseil constitutionnel est arrêtée.'
                    : result.allianceIds.length > 0
                      ? 'Inactif lorsqu’une alliance est cochée : désactivez les alliances pour pondérer les 5 configurations de candidatures.'
                      : 'Tire à chaque simulation parmi 5 offres testées au centre et à droite (Philippe + Lisnard 40 %, Philippe seul 30 %, Philippe + Attal 15 %, Attal seul 10 %, Lagarde seule 5 %).'
                }
              />

              {/* Source des reports (duels face au RN) et front républicain par électorat (2022 ↔ 2024) */}
              <RepublicanFrontControls
                result={result}
                footer={
                  <button type="button" className="link block text-xs" onClick={() => onOpenSettings('reports')}>
                    Ajuster les reports, les plages d’incertitude, la fidélité et la participation
                  </button>
                }
              />

              {/* Option activée par défaut (2022) : écart derniers sondages avant T2 → résultat réel */}
              <BetweenRoundsBiasControl idPrefix="scenario" result={result} />
            </div>
          </fieldset>

          <details className="group/alliances rounded-lg border border-rule md:col-span-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-4 py-3 hover:bg-sunken/50 [&::-webkit-details-marker]:hidden">
              <span className="text-lg font-medium text-ink-2">
                Alliances testées par les sondeurs
                {result.allianceIds.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-ballpoint">
                    ({result.allianceIds.length} active{result.allianceIds.length > 1 ? 's' : ''})
                  </span>
                )}
              </span>
              <ChevronIcon className="group-open/alliances:rotate-180" />
            </summary>
            <fieldset className="px-4 pb-4 pt-2">
              <legend className="sr-only">Alliances testées par les sondeurs</legend>
              <AllianceSwitches idPrefix="alliance" result={result} columns />
            </fieldset>
          </details>

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

function ChevronIcon({ className = 'group-open:rotate-180' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-ink-3 transition-transform ${className}`}
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

function PollPicker({ result }: { result: SimulationResult }) {
  const excludedPolls = useSettings((s) => s.excludedPolls)
  const setPollIncluded = useSettings((s) => s.setPollIncluded)
  const includeAllPolls = useSettings((s) => s.includeAllPolls)
  const excluded = new Set(excludedPolls)
  const items = result.pollUsage
    .filter((u) => u.status === 'used' || u.status === 'excluded')
    .sort((a, b) => newestFirst(a.poll, b.poll))
  const checkedCount = items.filter((u) => !excluded.has(u.poll.id)).length

  return (
    <fieldset className="mt-4">
      <legend className="text-[0.95rem] font-medium text-ink">Sondages retenus</legend>
      <p className="mt-0.5 text-sm text-ink-3">Un seul coché : sondage seul ; deux ou plus : moyenne pondérée</p>
      <div className="mt-2 space-y-1.5">
        {items.map((u) => {
          const p = u.poll
          const checked = !excluded.has(p.id)
          const last = checked && checkedCount === 1
          const synthesis =
            p.sources.find((s) => s.kind === 'synthese') ??
            p.sources.find((s) => !s.kind && !/wikipedia|commission-des-sondages/.test(s.url))
          const notice = p.sources.find((s) => s.kind === 'notice' || /commission-des-sondages/.test(s.url))
          const desc = [
            fieldwork(p.fieldwork),
            u.status === 'used' && checkedCount > 1 ? `poids ${pct(u.weightShare, 0)}` : null,
            u.projected ? `projeté ${u.projectionSteps.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <div key={p.id} className="flex items-start gap-2">
              <Checkbox
                id={`poll-${p.id}`}
                checked={checked}
                onCheckedChange={(v) => setPollIncluded(p.id, v)}
                disabled={last}
                title={last ? 'Au moins un sondage doit rester coché' : undefined}
                label={p.institute}
                description={desc}
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
      {checkedCount < items.length && (
        <button type="button" className="link mt-2 text-sm" onClick={includeAllPolls}>
          Tout cocher
        </button>
      )}
    </fieldset>
  )
}

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
