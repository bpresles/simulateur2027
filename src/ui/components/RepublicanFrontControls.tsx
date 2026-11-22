import type { ReactNode } from 'react'
import { simulationData } from '../../data/schema'
import {
  REPUBLICAN_FRONT_PRESETS,
  effectiveProfiles,
  eliminatedBlocsForProfile,
} from '../../domain/transfers'
import { REPUBLICAN_FRONT_BLOCS } from '../../domain/types'
import type {
  ProfileId,
  RepublicanFrontBloc,
  RepublicanFrontPreset,
  RepublicanFrontSettings,
  SimulationResult,
  TransferSource,
} from '../../domain/types'
import { selectSettings, useSettings } from '../../state/settingsStore'
import { cand } from '../candidates'
import { num } from '../format'
import { Segmented, Slider } from './controls'

const PRESET_OPTIONS: { id: RepublicanFrontPreset; label: string; hint: string }[] = [
  {
    id: 'pres2022',
    label: 'Présidentielle 2022',
    hint: '0 % : niveau des enquêtes « jour du vote » de la présidentielle 2022',
  },
  {
    id: 'midpoint',
    label: 'Mi-chemin',
    hint: '50 % : position intermédiaire entre présidentielle 2022 et législatives 2024',
  },
  {
    id: 'leg2024',
    label: 'Législatives 2024',
    hint: '100 % : enquête Ipsos-Talan des législatives 2024 par paire exacte de finalistes (défaut)',
  },
]

const BLOC_VOTERS_DEFAULT: Record<RepublicanFrontBloc, string> = {
  gauche: 'Mélenchon, Glucksmann, Tondelier…',
  centre: 'Philippe, Attal…',
  droite: 'Lisnard, Retailleau…',
}

function blocLabel(
  bloc: RepublicanFrontBloc,
  profileId: ProfileId | undefined,
  challengerName: string | null,
): string {
  if (bloc === 'gauche') {
    if (profileId === 'lfi_rn') return 'Électeurs de gauche (hors LFI)'
    if (profileId === 'ecolo_ps_pcf_rn' && challengerName) {
      return `Électeurs de gauche (hors ${challengerName})`
    }
    return 'Électeurs de gauche'
  }
  if (bloc === 'centre') return 'Électeurs du centre'
  return 'Électeurs de droite'
}

function matchesPreset(rf: RepublicanFrontSettings, preset: RepublicanFrontPreset): boolean {
  const target = REPUBLICAN_FRONT_PRESETS[preset]
  return REPUBLICAN_FRONT_BLOCS.every((k) => Math.abs(rf[k] - target[k]) < 0.005)
}

/**
 * Bloc unifié des reports face au RN :
 * 1. Source des reports (Base historique 2022 ↔ 2024, Mélange hist. / 2027, Déclarations 2027) — placée au-dessus
 *    pour rendre explicite son lien direct avec le front républicain.
 * 2. Front républicain par électorat éliminé du 1er tour qui se reporte (`gauche`, `centre`, `droite`),
 *    interpolé en logit entre Présidentielle 2022 (0 %) et Législatives 2024 par paire exacte de finalistes (100 %).
 */
export function RepublicanFrontControls({
  compact = false,
  result,
  footer,
}: {
  compact?: boolean
  result?: SimulationResult
  footer?: ReactNode
}) {
  const store = useSettings()
  const rf = store.republicanFront
  const lfiLeftRange = store.lfiLeftTransferRange
  const transferSource = store.transferSource
  const declaredWeight = store.declaredWeight
  const setTransferSource = store.setTransferSource
  const setDeclaredWeight = store.setDeclaredWeight
  const setRepublicanFront = store.setRepublicanFront
  const setRepublicanFrontGlobal = store.setRepublicanFrontGlobal
  const applyPreset = store.applyRepublicanFrontPreset
  const resetRepublicanFront = store.resetRepublicanFront

  const avg =
    REPUBLICAN_FRONT_BLOCS.reduce((sum, k) => sum + rf[k], 0) / REPUBLICAN_FRONT_BLOCS.length
  const isDefaultRf = matchesPreset(rf, 'leg2024')

  const duel = result?.secondRound.duel
  const isNonRnDuel = Boolean(duel && duel.kind !== 'rn-sourced')
  const isDeclaredOnly = transferSource === 'declared2027'
  const rfDisabled = isNonRnDuel || isDeclaredOnly
  const activeProfileId = duel?.kind === 'rn-sourced' ? duel.profileWeights[0]?.profileId : undefined
  const activeEliminatedBlocs = new Set(activeProfileId ? eliminatedBlocsForProfile(activeProfileId) : [])
  const challengerName = duel?.challengerId ? cand(duel.challengerId).shortName : null
  const activeProfiles = activeProfileId
    ? effectiveProfiles(simulationData.transfers, simulationData.declaredTransfers, selectSettings(store))
    : null
  const isDisplayedLfiRn = activeProfileId === 'lfi_rn'
  const duelPairLabel = result
    ? `${cand(result.secondRound.a).shortName} – ${cand(result.secondRound.b).shortName}`
    : null

  const nonRnNotice =
    duel?.kind === 'non-rn-same-side'
      ? `Inactif sur ce duel hors RN (${duelPairLabel}) : duel de même camp sans barrage anti-RN. Sélectionnez un duel face au RN pour ajuster les reports et le front républicain.`
      : `Inactif sur ce duel hors RN (${duelPairLabel}) : ce duel utilise les reports des présidentielles 2007 et 2012 (sans barrage anti-RN). Sélectionnez un duel face au RN pour ajuster les reports et le front républicain.`

  const rfStatusText = isNonRnDuel
    ? 'Sans effet sur un duel hors RN.'
    : isDeclaredOnly
      ? 'Inactif en mode « Déclarations 2027 » seul (ce réglage s’applique à la base historique et au mélange).'
      : 'Chaque curseur règle la tenue du barrage anti-RN des électeurs éliminés de ce camp (0 % = présidentielle 2022, 100 % = législatives 2024 sur la paire exacte de finalistes).'

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 rounded-lg border border-rule bg-paper/60 p-3.5'}>
      {/* 1. Source des reports de voix (duels face au RN) — commande directement le front républicain ci-dessous */}
      <div className="space-y-2">
        <p className="text-[0.95rem] font-medium text-ink">Source des reports de voix (duels face au RN)</p>
        {isNonRnDuel && <p className="text-xs text-ink-3">{nonRnNotice}</p>}
        <div
          aria-disabled={isNonRnDuel}
          className={isNonRnDuel ? 'pointer-events-none space-y-2 opacity-50' : 'space-y-2'}
        >
          <Segmented<TransferSource>
            label="Source des reports au second tour"
            value={transferSource}
            onValueChange={setTransferSource}
            disabled={isNonRnDuel}
            options={[
              {
                value: 'legislatives2024',
                label: 'Base historique',
                hint: 'Défaut : interpolation logit entre présidentielle 2022 (0 %) et législatives 2024 (100 %)',
              },
              {
                value: 'blend',
                label: 'Mélange hist. / 2027',
                hint: 'Moyenne pondérée entre base historique et déclarations 2027 corrigées en logit',
              },
              {
                value: 'declared2027',
                label: 'Déclarations 2027',
                hint: 'Option : reports déclarés Harris/Odoxa 2026 corrigés en logit (désactive le front républicain 2022 ↔ 2024)',
              },
            ]}
          />
          {!isNonRnDuel && (
            <p className="text-xs text-ink-3">
              {transferSource === 'legislatives2024' &&
                'Interpolation directe en logit entre les législatives 2024 (Ipsos-Talan par paire exacte de finalistes, 100 %) et la présidentielle 2022 (0 %), réglée ci-dessous.'}
              {transferSource === 'blend' &&
                'Combine la base historique 2022 ↔ 2024 (réglée ci-dessous) avec les déclarations d’intention 2027 corrigées sur échelle logit.'}
              {transferSource === 'declared2027' &&
                'Reports déclarés dans les sondages de 2026 (Harris / Odoxa), corrigés sur échelle logit de l’écart moyen campagne → scrutin (2017 et 2022). Désactive le réglage du front républicain ci-dessous.'}
            </p>
          )}
          {transferSource === 'blend' && (
            <div className="flex items-center gap-3 rounded-md bg-surface px-3 py-2 text-xs shadow-xs">
              <span className="shrink-0 font-medium text-ink-2">Poids des déclarations 2027</span>
              <Slider
                label="Poids des déclarations 2027"
                value={declaredWeight * 100}
                onValueChange={(v) => setDeclaredWeight(v / 100)}
                min={0}
                max={100}
                step={5}
                disabled={isNonRnDuel}
              />
              <span className="num w-10 text-right font-semibold text-ink">
                {num(declaredWeight * 100, 0)}&#8239;%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Front républicain par électorat qui se reporte (2022 ↔ 2024) */}
      <div className="space-y-3 border-t border-rule/80 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.95rem] font-medium text-ink">
            Front républicain par électorat qui se reporte (2022 ↔ 2024)
          </p>
          {!isDefaultRf && !rfDisabled && (
            <button type="button" className="link text-xs" onClick={resetRepublicanFront}>
              Rétablir
            </button>
          )}
        </div>

        <p className="text-xs text-ink-3">{rfStatusText}</p>

        <div
          aria-disabled={rfDisabled}
          className={rfDisabled ? 'pointer-events-none space-y-3 opacity-50' : 'space-y-3'}
        >
          <div role="group" aria-label="Préréglages du front républicain" className="flex flex-wrap gap-1.5">
            {PRESET_OPTIONS.map((p) => {
              const active = matchesPreset(rf, p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={rfDisabled}
                  title={p.hint}
                  aria-pressed={active}
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    active
                      ? 'bg-ballpoint text-surface shadow-xs'
                      : 'bg-surface text-ink-2 ring-1 ring-rule hover:bg-sunken hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          <div className="rounded-md bg-surface px-3 py-2 text-xs shadow-xs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">Position globale (2022 → 2024)</span>
              <span className="num font-medium text-ink">{num(avg * 100, 0)}&#8239;%</span>
            </div>
            <Slider
              label="Intensité globale du front républicain"
              value={Math.round(avg * 100)}
              onValueChange={(v) => setRepublicanFrontGlobal(v / 100)}
              min={0}
              max={100}
              step={5}
              disabled={rfDisabled}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {REPUBLICAN_FRONT_BLOCS.map((bloc) => {
              const label = blocLabel(bloc, activeProfileId, challengerName)
              const activeOnDuel = !rfDisabled && activeEliminatedBlocs.has(bloc)
              const liveRow = activeProfileId && activeProfiles ? activeProfiles[activeProfileId][bloc] : null
              const hint =
                activeOnDuel && challengerName && liveRow
                  ? `→ ${num(liveRow.finalist, 0)} % ${challengerName} · ${num(liveRow.rn, 0)} % RN`
                  : activeProfileId && challengerName
                    ? `Camp de ${challengerName} (actif sur autres duels)`
                    : BLOC_VOTERS_DEFAULT[bloc]
              return (
                <div
                  key={bloc}
                  className={`rounded-md bg-surface px-2.5 py-2 text-xs shadow-xs ${
                    activeOnDuel ? 'ring-1 ring-ballpoint/45' : ''
                  }`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-1">
                    <span className="font-medium leading-snug text-ink">{label}</span>
                    <span className="num shrink-0 font-semibold text-ink">{num(rf[bloc] * 100, 0)}&#8239;%</span>
                  </div>
                  <Slider
                    label={`Front républicain : ${label}`}
                    value={Math.round(rf[bloc] * 100)}
                    onValueChange={(v) => setRepublicanFront(bloc, v / 100)}
                    min={0}
                    max={100}
                    step={5}
                    disabled={rfDisabled}
                  />
                  <span
                    className={`mt-1 block truncate text-[0.7rem] ${
                      activeOnDuel ? 'font-medium text-ballpoint' : 'text-ink-3'
                    }`}
                    title={hint}
                  >
                    {hint}
                  </span>
                </div>
              )
            })}
          </div>

          {isDisplayedLfiRn && !rfDisabled && (
            <p className="text-[0.72rem] leading-snug text-ink-3">
              Sur un duel LFI – RN, <strong>Électeurs de gauche (hors LFI)</strong> pilote les reports de Glucksmann,
              Tondelier et Roussel (100&#8239;% = 72&#8239;% repère NFP 2024, 0&#8239;% = 47&#8239;% niveau Prés. 2022 ;
              incertitude tirée dans Monte-Carlo sur{' '}
              <span className="num font-medium">
                {lfiLeftRange[0]}–{lfiLeftRange[1]}&#8239;%
              </span>
              ).
            </p>
          )}
        </div>
      </div>

      {footer && <div className="border-t border-rule/80 pt-2.5">{footer}</div>}
    </div>
  )
}
