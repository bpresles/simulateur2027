import { BLOG_BIAS_URL, totalBias } from '../../domain/blogBias'
import { newestFirst } from '../../domain/pollAverage'
import { correctionUncertainty } from '../../domain/transferCorrection'
import type { SimulationResult, TurnoutBalance } from '../../domain/types'
import { calibration, progression2022Stats } from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { date, distance, fieldwork, month, num, ofMonth, pct, pts, ratio } from '../format'
import { simulationData } from '../../data/schema'
import { AllianceSwitches, GroupedAlliancesSwitch, UntestedAlliancesSwitch } from './AllianceSwitches'
import { Checkbox, Slider, Switch } from './controls'

const allianceLabel = new Map(simulationData.polls.alliances.map((a) => [a.id, a.label]))
/** Incertitude des reports tirés des votes réels de 2024 (erreurs types des lignes corrigées). */
const TRANSFER_UNCERTAINTY = correctionUncertainty(simulationData.transfers, simulationData.secondRoundDropout)
/** Période de la progression 2022 : même distance du scrutin que la base 2027, jusqu'au vote. */
const PROGRESSION_PERIOD = `${ofMonth(progression2022Stats.asOf)} à ${month(simulationData.reference2022.electionDate)}`
const { extreme_droite: farRightBias, gauche: leftBias } = calibration.blogBias
/** Biais du billet estimés sur 2017 et 2022 à la même distance du scrutin, par bloc. */
const BLOG_BIAS_DESCRIPTION = [
  `En 2017 et 2022, des sondages à ${distance(progression2022Stats.daysBefore)} du scrutin au résultat`,
  [
    farRightBias && `extrême droite ${ratio(totalBias(farRightBias))}`,
    leftBias && `gauche ${ratio(totalBias(leftBias))}`,
  ]
    .filter(Boolean)
    .join(', '),
].join(' : ')

/** Biais du billet déjà corrigés par les options activées : corrigés une seule fois. */
function blogOverlapNote(progression: boolean, correction: boolean): string | null {
  const once = 'à la plus forte des deux intensités'
  if (progression && correction)
    return `Progression et correction ci-dessus couvrent déjà ces biais : chacun n’est corrigé qu’une fois, ${once}.`
  if (correction)
    return `« Corriger la moyenne » couvre déjà l’écart entre derniers sondages et résultat : il n’est corrigé qu’une fois, ${once}.`
  if (progression)
    return `« Progression comme en 2022 » couvre déjà l’évolution des sondages : elle n’est corrigée qu’une fois, ${once}.`
  return null
}

/** Candidats testés : hypothèse retenue (les alliances testées y retirent leurs ralliés), puis alliances estimées. */
function firstRoundSummary(result: SimulationResult): string {
  const estimated = result.estimatedAllianceIds.map((id) => `${allianceLabel.get(id) ?? id} (estimée)`)
  return [result.hypothesisSet.description.replace(/\.$/, ''), ...estimated].join(', ') + '.'
}

export function ScenarioBar({ result, onOpenSettings }: { result: SimulationResult; onOpenSettings: () => void }) {
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

          {s.groupedAlliances && (
            <fieldset className="md:col-span-2">
              <legend className="mb-2 text-lg font-medium text-ink-2">Alliances groupées</legend>
              <AllianceSwitches idPrefix="grouped" result={result} columns grouped />
            </fieldset>
          )}

          {/* À droite des sondages sur grand écran ; sous les alliances sur mobile. */}
          <fieldset className="md:col-start-2 md:row-start-1">
            <legend className="mb-2 text-lg font-medium text-ink-2">Ajustements de la simulation</legend>
            <div className="mb-4">
              <UntestedAlliancesSwitch id="untested-alliances" />
            </div>
            <div className="mb-4">
              <GroupedAlliancesSwitch id="grouped-alliances" />
            </div>
            <div className="mb-4">
              <Switch
                id="progression"
                checked={s.progressionEnabled}
                onCheckedChange={s.setProgressionEnabled}
                label="Progression comme en 2022"
                description={`Estime les derniers sondages avant le vote selon l’évolution ${PROGRESSION_PERIOD}`}
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
              description={
                Object.keys(s.correctionOverrides).length > 0
                  ? 'Selon les écarts saisis dans les réglages'
                  : 'Selon une estimation basée sur les écarts réels entre les derniers sondages et résultats de 2017 et 2022'
              }
            />
            {/* Hors du <label> du switch : un clic ne doit pas le basculer. Aligné sur sa description. */}
            <button type="button" className="link ml-12 mt-1 block text-sm" onClick={onOpenSettings}>
              Modifier les écarts
            </button>
            <Intensity
              label="Intensité de la correction"
              hint="l’écart estimé sur 2017 et 2022"
              value={s.correctionIntensity}
              onValueChange={s.setCorrectionIntensity}
              disabled={!s.correctionsEnabled}
            />
            <div className="mt-4">
              <Switch
                id="blog-bias"
                checked={s.blogBiasEnabled}
                onCheckedChange={s.setBlogBiasEnabled}
                label="Corriger les biais révélés dans le billet de blog d’Eliot Thibault"
                aside={
                  <a
                    href={BLOG_BIAS_URL}
                    target="_blank"
                    rel="noreferrer"
                    title="Lire le billet de blog d’Eliot Thibault (Club de Mediapart)"
                    aria-label="Lire le billet de blog d’Eliot Thibault (Club de Mediapart, nouvel onglet)"
                    className="rounded text-ink-3 transition-colors hover:text-ballpoint"
                  >
                    <ExternalLinkIcon />
                  </a>
                }
                description={BLOG_BIAS_DESCRIPTION}
              />
              {s.blogBiasEnabled && blogOverlapNote(s.progressionEnabled, s.correctionsEnabled) && (
                <p className="ml-12 mt-1 text-sm text-ink-3">
                  {blogOverlapNote(s.progressionEnabled, s.correctionsEnabled)}
                </p>
              )}
              <Intensity
                label="Intensité de la correction des biais du billet"
                hint="les écarts par bloc estimés"
                value={s.blogBiasIntensity}
                onValueChange={s.setBlogBiasIntensity}
                disabled={!s.blogBiasEnabled}
              />
            </div>
            <div className="mt-4">
              <Switch
                id="transfer-correction"
                checked={s.transferCorrectionEnabled}
                onCheckedChange={s.setTransferCorrectionEnabled}
                label="Reports de voix tirés des votes réels de 2024, et non d’un sondage"
                description={`Sans cette option, les reports de voix au 2nd tour reprennent l’enquête Ipsos-Talan du 07/07/2024, un sondage où les électeurs déclaraient leur vote. Avec elle, les reports des électeurs dont le camp était absent du duel (par exemple le centre et la droite dans un duel RN – LFI) sont estimés à partir des résultats officiels des législatives 2024, en comparant les ${TRANSFER_UNCERTAINTY.constituencies} circonscriptions de ces duels.`}
              />
              <p className="ml-12 mt-1 text-sm text-ink-3">
                Marge d’erreur : le vote étant secret, ces reports sont déduits des écarts entre circonscriptions, pas
                observés. Erreur type de {num(TRANSFER_UNCERTAINTY.minSe, 1)} à {num(TRANSFER_UNCERTAINTY.maxSe, 1)}{' '}
                points selon l’électorat, soit environ ±&#8239;{num(1.96 * TRANSFER_UNCERTAINTY.minSe, 0)} à{' '}
                {num(1.96 * TRANSFER_UNCERTAINTY.maxSe, 0)} points à 95&#8239;%. Les électeurs du camp d’un finaliste
                gardent les valeurs de l’enquête.
              </p>
              <Intensity
                label="Intensité de la correction des reports"
                hint="les reports estimés sur les votes réels ; 0 % garde l’enquête"
                value={s.transferCorrectionIntensity}
                onValueChange={s.setTransferCorrectionIntensity}
                disabled={!s.transferCorrectionEnabled}
              />
            </div>
            <div className="mt-4">
              <Switch
                id="turnout"
                checked={s.turnoutEnabled}
                onCheckedChange={s.setTurnoutEnabled}
                label="Participation attendue au 1er tour"
                description="Ajuste les scores à la participation attendue, l’écart étant réparti comme le vote 2022 des abstentionnistes de 2017 venus voter"
              />
              <TurnoutControls balance={result.turnoutBalance} />
            </div>
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

/** Curseur d'intensité d'un ajustement (1 = 100 %, reproduit exactement l'écart estimé). */
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

/**
 * Participation attendue au 1er tour et bilan : ce que les sondages contiennent déjà, ce que les options
 * reproduisent de la mobilisation de 2022, et le supplément (ou retrait) appliqué.
 */
function TurnoutControls({ balance }: { balance: TurnoutBalance | null }) {
  const enabled = useSettings((s) => s.turnoutEnabled)
  const expected = useSettings((s) => s.turnoutExpected)
  const setExpected = useSettings((s) => s.setTurnoutExpected)
  if (!balance) return null
  return (
    <div className="ml-12 mt-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-3">Participation attendue</span>
        <Slider
          label="Participation attendue"
          value={balance.expected}
          onValueChange={setExpected}
          min={70}
          max={90}
          step={0.5}
          disabled={!enabled}
        />
        <span className="num w-14 text-right text-sm font-medium">{pct(balance.expected, 1)}</span>
      </div>
      {expected !== null && (
        <button
          type="button"
          className="link mt-1 text-sm"
          disabled={!enabled}
          onClick={() => setExpected(null)}
        >
          Revenir au défaut ({pct(balance.defaultExpected, 1)}, hypothèse du billet : la hausse des certains reportée
          sur 2022)
        </button>
      )}
      {enabled && (
        <ul className="mt-2 space-y-0.5 text-sm text-ink-3">
          <li>
            Certains d’aller voter aujourd’hui (Ifop, {date(balance.certainNow.measure.fieldwork.end)}) :{' '}
            {pct(balance.certainNow.share, 1)} des inscrits, déjà dans les sondages
          </li>
          <li>
            Mobilisation de 2022 déjà corrigée : {pts(balance.covered, 1)}, selon les options activées
          </li>
          <li>Supplément appliqué : {pts(balance.delta, 1)}</li>
        </ul>
      )}
    </div>
  )
}
