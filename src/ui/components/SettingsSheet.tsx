import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { simulationData } from '../../data/schema'
import { effectiveProfiles, frontStrengthForBloc, minorTransfer } from '../../domain/transfers'
import { BLOCS } from '../../domain/types'
import type { Bloc, CandidateId, ProfileId, SimulationResult, TransferValues } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { BLOC_LABELS, BLOC_VOTERS, MINOR_CANDIDATES, cand, colorVars, transferLabel } from '../candidates'
import { num, pct } from '../format'
import { provenanceClass } from '../provenance'
import { AllianceSwitches } from './AllianceSwitches'
import { ProvenanceLegend } from './Provenance'
import { RepublicanFrontControls } from './RepublicanFrontControls'
import { Segmented, Slider, Switch, TextButton } from './controls'

export type SettingsTab = 'reports' | 'projection' | 'alliances'

const { transfers, declaredTransfers } = simulationData

export function SettingsSheet({
  open,
  onOpenChange,
  result,
  tab = 'reports',
  onTabChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  result: SimulationResult
  tab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
}) {
  const resetAll = useSettings((s) => s.resetAll)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(10_12_18/0.45)]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[36rem] flex-col bg-paper shadow-2xl focus:outline-none">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <Dialog.Title className="text-xl font-bold tracking-tight">Réglages avancés</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-ink-3">
                Enregistrés dans ce navigateur. Les valeurs par défaut restent calculées à partir des sources.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md px-2 py-1 text-sm font-medium text-ink-2 hover:bg-sunken">
              Fermer
            </Dialog.Close>
          </header>

          <Tabs.Root
            value={tab}
            onValueChange={(v) => onTabChange?.(v as SettingsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List aria-label="Catégories de réglages" className="flex gap-1 border-b border-rule px-5">
              {(
                [
                  ['reports', 'Reports et 2nd tour'],
                  ['projection', 'Projection 1er tour'],
                  ['alliances', 'Alliances'],
                ] as const
              ).map(([v, l]) => (
                <Tabs.Trigger
                  key={v}
                  value={v}
                  className="-mb-px border-b-2 border-transparent px-2 py-2.5 text-sm font-medium text-ink-3 hover:text-ink data-[state=active]:border-ballpoint data-[state=active]:text-ink"
                >
                  {l}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <Tabs.Content value="reports">
                <TransfersEditor result={result} />
              </Tabs.Content>
              <Tabs.Content value="projection">
                <ProjectionPanel result={result} />
              </Tabs.Content>
              <Tabs.Content value="alliances">
                <AlliancesPanel result={result} />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          <footer className="border-t border-rule px-5 py-3">
            <TextButton onClick={resetAll}>Tout réinitialiser</TextButton>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function NumberInput({
  value,
  onChange,
  label,
  placeholder,
  min,
  max,
  step = 0.1,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  label: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={value === undefined ? '' : Number(value.toFixed(1))}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.')
        if (raw === '') return onChange(undefined)
        const v = Number(raw)
        if (Number.isFinite(v)) onChange(v)
      }}
      className="num w-20 rounded-md border border-rule bg-surface px-2 py-1 text-right text-sm placeholder:text-ink-3"
    />
  )
}

function AlliancesPanel({ result }: { result: SimulationResult }) {
  return (
    <div className="space-y-6">
      <AllianceSwitches idPrefix="sheet-alliance" result={result} />
      <p className="text-sm text-ink-3">
        Une alliance testée par les sondeurs retire le candidat rallié du 1er tour : on retient les hypothèses où il est
        absent et où son leader reste seul candidat principal de son camp. Aucun taux de report artificiel n’est
        appliqué : ce sont les sondés eux-mêmes qui répartissent ses électeurs.
      </p>
    </div>
  )
}

function ProjectionPanel({ result }: { result: SimulationResult }) {
  const s = useSettings()
  const proj = s.projection
  const activeIds = result.firstRound.map((r) => r.candidateId)
  const membersOf = (blocs: Bloc[]) =>
    activeIds
      .filter((id) => {
        const b = cand(id).bloc
        return b !== null && blocs.includes(b)
      })
      .sort((a, b) => {
        const sa = result.firstRound.find((r) => r.candidateId === a)?.currentScore ?? 0
        const sb = result.firstRound.find((r) => r.candidateId === b)?.currentScore ?? 0
        return sb - sa
      })

  const polesToRender: {
    key: 'gauche' | 'centre' | 'droite' | 'centre_droite' | 'extreme_droite'
    label: string
    blocs: Bloc[]
    settingBloc: Bloc
  }[] = proj.mergeCenterRight
    ? [
        { key: 'gauche', label: BLOC_LABELS.gauche, blocs: ['gauche'], settingBloc: 'gauche' },
        { key: 'centre_droite', label: 'Centre + Droite', blocs: ['centre', 'droite'], settingBloc: 'centre' },
        {
          key: 'extreme_droite',
          label: BLOC_LABELS.extreme_droite,
          blocs: ['extreme_droite'],
          settingBloc: 'extreme_droite',
        },
      ]
    : BLOCS.map((b) => ({ key: b, label: BLOC_LABELS[b], blocs: [b], settingBloc: b }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-4">
        <div>
          <p className="text-[0.95rem] font-medium text-ink">Horizon temporel du 1er tour</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {proj.enabled
              ? `Projection active jusqu’au 1er tour (J−${result.projection.daysRemaining}).`
              : 'Photographie actuelle affichée. Activez la projection pour appliquer les réglages ci-dessous.'}
          </p>
        </div>
        <Segmented<'now' | 'projected'>
          label="Horizon temporel (réglages)"
          value={proj.enabled ? 'projected' : 'now'}
          onValueChange={(v) => s.setProjectionEnabled(v === 'projected')}
          options={[
            { value: 'now', label: 'Aujourd’hui' },
            { value: 'projected', label: 'Projection avril 2027' },
          ]}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Vote utile par bloc</p>
          <TextButton onClick={s.resetProjection}>Rétablir la projection</TextButton>
        </div>

        <Switch
          id="sheet-merge-center-right"
          checked={proj.mergeCenterRight}
          onCheckedChange={s.setMergeCenterRight}
          label="Regrouper centre et droite (scénario type 2022)"
          description="Si activé, le vote utile concentre centre et droite vers un seul pivot (cible 65 %) ; sinon les 4 blocs se consolident séparément."
        />

        <div className="space-y-2.5">
          {polesToRender.map(({ key, label, blocs, settingBloc }) => {
            const stat = result.projection.poles.find((p) => p.pole === key)
            const members = membersOf(blocs)
            const autoLeader = members[0]
            const uv = proj.usefulVote[settingBloc]
            const intensity =
              proj.mergeCenterRight && key === 'centre_droite'
                ? (proj.usefulVote.centre.intensity + proj.usefulVote.droite.intensity) / 2
                : uv.intensity
            const setIntensity = (val: number) => {
              if (proj.mergeCenterRight && key === 'centre_droite') {
                s.setBlocUsefulVote('centre', { intensity: val })
                s.setBlocUsefulVote('droite', { intensity: val })
              } else {
                s.setBlocUsefulVote(settingBloc, { intensity: val })
              }
            }
            const setBeneficiary = (val: CandidateId | 'auto') => {
              if (proj.mergeCenterRight && key === 'centre_droite') {
                s.setBlocUsefulVote('centre', { beneficiary: val })
                s.setBlocUsefulVote('droite', { beneficiary: val })
              } else {
                s.setBlocUsefulVote(settingBloc, { beneficiary: val })
              }
            }

            return (
              <div key={key} className="rounded-md border border-rule bg-surface px-3 py-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{label}</span>
                  {stat && (
                    <span className="num text-ink-3">
                      {stat.saturated
                        ? `déjà à ${pct(stat.shareBefore * 100, 0)} (seuil ${pct(stat.targetShare * 100, 0)})`
                        : `part du pivot : ${pct(stat.shareBefore * 100, 0)} → ${pct(stat.shareAfter * 100, 0)}`}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex min-w-[10rem] flex-1 items-center gap-2">
                    <Slider
                      label={`Intensité du vote utile : ${label}`}
                      value={intensity * 100}
                      onValueChange={(v) => setIntensity(v / 100)}
                      min={0}
                      max={100}
                      step={5}
                    />
                    <span className="num w-10 text-right font-medium text-ink">{num(intensity * 100, 0)}&#8239;%</span>
                  </div>
                  {members.length > 1 && (
                    <label className="flex items-center gap-1.5 text-ink-3">
                      <span>Pivot</span>
                      <select
                        aria-label={`Candidat pivot du vote utile : ${label}`}
                        value={uv.beneficiary}
                        onChange={(e) => setBeneficiary(e.target.value as CandidateId | 'auto')}
                        className="rounded border border-rule bg-paper px-1.5 py-0.5 text-xs text-ink"
                      >
                        <option value="auto">Auto ({autoLeader ? cand(autoLeader).shortName : '—'})</option>
                        {members.slice(0, 5).map((id) => (
                          <option key={id} value={id}>
                            {cand(id).shortName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-4 border-t border-rule pt-4">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-ink">Amortissement vers les fondamentaux (option)</span>
              <span className="num font-medium">{num(proj.meanReversion * 100, 0)}&#8239;%</span>
            </div>
            <p className="mb-2 text-xs text-ink-3">
              Désactivé par défaut (0 %). Si activé, rappelle les totaux de blocs vers une moyenne 2017–2024 (poids max
              25 % à J−150, s’annulant le jour du scrutin).
            </p>
            <Slider
              label="Amortissement des écarts précoces"
              value={proj.meanReversion * 100}
              onValueChange={(v) => s.setMeanReversion(v / 100)}
              min={0}
              max={100}
              step={10}
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-ink">Tendance récente amortie sur 21 jours (option)</span>
              <span className="num font-medium">{num(proj.dampedTrend * 100, 0)}&#8239;%</span>
            </div>
            <p className="mb-2 text-xs text-ink-3">
              Désactivé par défaut (0 %) : sur les présidentielles 1995–2022, la persistance des pentes sur 6 semaines
              est non significative (r = −0,26). Plafonné à ±2,5 pts si activé.
            </p>
            <Slider
              label="Tendance récente amortie"
              value={proj.dampedTrend * 100}
              onValueChange={(v) => s.setDampedTrend(v / 100)}
              min={0}
              max={100}
              step={10}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SecondRoundParamsPanel({ result }: { result: SimulationResult }) {
  const s = useSettings()
  return (
    <div className="space-y-5 border-b border-rule pb-6">
      <RepublicanFrontControls compact result={result} />

      <div className="rounded-md border border-rule bg-surface px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-ink">Plage Monte-Carlo : gauche hors LFI → Mélenchon (%)</p>
          {(s.lfiLeftTransferRange[0] !== 35 || s.lfiLeftTransferRange[1] !== 75) && (
            <button type="button" className="link text-xs" onClick={s.resetLfiLeftTransferRange}>
              Rétablir
            </button>
          )}
        </div>
        <p className="mt-0.5 text-ink-3">
          Plage d’incertitude tirée dans Monte-Carlo autour du taux actif du curseur gauche (défaut : 35 % à 75 %).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-ink-2">
            <span>Min</span>
            <NumberInput
              label="Borne basse du report gauche hors LFI vers Mélenchon"
              value={s.lfiLeftTransferRange[0]}
              onChange={(v) => v !== undefined && s.setLfiLeftTransferRange([v, s.lfiLeftTransferRange[1]])}
              min={5}
              max={95}
              step={1}
            />
          </label>
          <label className="flex items-center gap-1.5 text-ink-2">
            <span>Max</span>
            <NumberInput
              label="Borne haute du report gauche hors LFI vers Mélenchon"
              value={s.lfiLeftTransferRange[1]}
              onChange={(v) => v !== undefined && s.setLfiLeftTransferRange([s.lfiLeftTransferRange[0], v])}
              min={5}
              max={95}
              step={1}
            />
          </label>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">
          Participation au 1er tour : <span className="num">{pct(s.firstRoundTurnout, 1)}</span> des inscrits
        </p>
        <p className="mb-2 mt-0.5 text-xs text-ink-3">
          Rappel : 77,8 % en 2017, 73,7 % en 2022. Défaut : 74 %.
        </p>
        <Slider
          label="Participation au 1er tour"
          value={s.firstRoundTurnout}
          onValueChange={s.setFirstRoundTurnout}
          min={60}
          max={85}
          step={0.5}
        />
      </div>

      <div>
        <p className="text-sm font-medium">
          Abstentionnistes du 1er tour votant valablement au 2nd :{' '}
          <span className="num">{pct(s.abstainerMobilization * 100, 0)}</span>
        </p>
        <p className="mb-2 mt-0.5 text-xs text-ink-3">
          Repères : ~14–22 % (Ifop 2022 / Insee 2017–2022). Défaut : 20 %.
        </p>
        <Slider
          label="Part des abstentionnistes mobilisés au 2nd tour"
          value={s.abstainerMobilization * 100}
          onValueChange={(v) => s.setAbstainerMobilization(v / 100)}
          min={5}
          max={40}
          step={1}
        />
      </div>

      <div>
        <p className="text-sm font-medium">
          Orientation des nouveaux votants (adversaire du RN) :{' '}
          <span className="num">{pct(s.abstainerAntiRnShare * 100, 0)}</span>
        </p>
        <p className="mb-2 mt-0.5 text-xs text-ink-3">
          Part des abstentionnistes du 1er tour qui votent pour l’adversaire du RN au 2nd tour (repère Ifop 2022 : 59 % ;
          50 % dans les duels hors RN). Défaut : 55 %.
        </p>
        <Slider
          label="Orientation des nouveaux votants face au RN"
          value={s.abstainerAntiRnShare * 100}
          onValueChange={(v) => s.setAbstainerAntiRnShare(v / 100)}
          min={30}
          max={75}
          step={1}
        />
      </div>

      <div>
        <p className="text-sm font-medium">
          Fidélité des finalistes :{' '}
          {s.fidelity === null
            ? `différenciée (Le Pen ${transfers.fidelity.byCandidate.lepen?.loyal} %, Mélenchon ${transfers.fidelity.byCandidate.melenchon?.loyal} %, autres ${transfers.fidelity.default.loyal} %)`
            : `uniforme à ${pct(s.fidelity * 100, 0)}`}
        </p>
        <p className="mb-2 mt-0.5 text-xs text-ink-3">{transfers.fidelity.note}</p>
        <Slider
          label="Fidélité uniforme des finalistes"
          value={(s.fidelity ?? transfers.fidelity.default.loyal / 100) * 100}
          onValueChange={(v) => s.setFidelity(v / 100)}
          min={75}
          max={100}
          step={1}
        />
        {s.fidelity !== null && (
          <TextButton className="mt-2" onClick={() => s.setFidelity(null)}>
            Revenir à la fidélité différenciée par finaliste
          </TextButton>
        )}
      </div>
    </div>
  )
}

function MinorTransfersPanel({ eligibleMinors }: { eligibleMinors: string[] }) {
  const choices = useSettings((s) => s.minorTransfers)
  const setMinorTransfer = useSettings((s) => s.setMinorTransfer)
  const shown = MINOR_CANDIDATES.filter((c) => eligibleMinors.includes(c.id))
  if (shown.length === 0) return null

  return (
    <div className="space-y-5 border-b border-rule pb-6">
      <div>
        <p className="text-[0.95rem] font-medium">Électeurs des petits candidats (≥ 3 instituts)</p>
        <p className="mt-0.5 text-sm text-ink-3">
          Éliminés au 1er tour, leurs électeurs suivent au 2nd tour les électorats principaux ci-dessous.
        </p>
      </div>
      {shown.map((c) => {
        const variants = c.minor!.transfers
        const chosen = minorTransfer(c, choices)!
        return (
          <fieldset key={c.id}>
            <legend className="flex items-center gap-2 text-sm font-medium">
              <span style={colorVars(c)} className="cand-fill h-2.5 w-2.5 rounded-full" />
              {c.name}
            </legend>
            <div className="mt-2 space-y-1.5">
              {variants.map((t, i) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`minor-transfer-${c.id}`}
                    checked={t.id === chosen.id}
                    onChange={() => setMinorTransfer(c.id, i === 0 ? undefined : t.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-ballpoint"
                  />
                  <span className="leading-tight">
                    <span className="font-medium text-ink">{t.label}</span>
                    {i === 0 && <span className="text-ink-3"> (par défaut)</span>}
                    <span className="block text-xs text-ink-3">{transferLabel(t.parts)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {chosen.note}
              {chosen.sources?.map((src) => (
                <a key={src.url} href={src.url} className="link ml-1.5" target="_blank" rel="noreferrer">
                  {src.label}
                </a>
              ))}
            </p>
          </fieldset>
        )
      })}
    </div>
  )
}

function TransfersEditor({ result }: { result: SimulationResult }) {
  const [profileId, setProfileId] = useState<ProfileId>('lfi_rn')
  const s = useSettings()
  const profile = transfers.profiles.find((p) => p.id === profileId)!
  const overrides = s.transferOverrides[profileId] ?? {}
  const effectiveWithoutOverrides = effectiveProfiles(transfers, declaredTransfers, {
    ...s,
    transferOverrides: {},
  })

  const update = (bloc: Bloc, current: TransferValues, key: 'finalist' | 'rn', v: number | undefined) => {
    const def = effectiveWithoutOverrides[profileId][bloc]
    const next = { ...current, [key]: Math.min(100, Math.max(0, v ?? def[key])) }
    if (next.finalist + next.rn > 100) {
      if (key === 'finalist') next.rn = 100 - next.finalist
      else next.finalist = 100 - next.rn
    }
    next.abstention = 100 - next.finalist - next.rn
    s.setTransferOverride(profileId, bloc, next)
  }

  return (
    <div className="space-y-5">
      <SecondRoundParamsPanel result={result} />
      <MinorTransfersPanel eligibleMinors={result.eligibleMinors} />
      <p className="text-sm text-ink-2">
        Taux de report effectifs selon le type de duel face au RN. Toute valeur saisie ici surcharge la source
        sélectionnée ; l’abstention/blanc/nul complète automatiquement à 100 %.
      </p>
      <Segmented
        label="Type de duel"
        value={profileId}
        onValueChange={setProfileId}
        options={[
          { value: 'lfi_rn', label: 'LFI' },
          { value: 'ecolo_ps_pcf_rn', label: 'PS, écolo, PCF' },
          { value: 'ensemble_rn', label: 'Ensemble' },
          { value: 'lr_rn', label: 'LR' },
        ]}
      />
      <p className="text-sm font-medium">{profile.label}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-3">
            <th className="py-1.5 font-medium">Électorat</th>
            <th className="py-1.5 text-right font-medium">Finaliste</th>
            <th className="py-1.5 text-right font-medium">RN</th>
            <th className="py-1.5 text-right font-medium">Blanc, abst.</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {BLOCS.map((bloc) => {
            const row = profile.rows[bloc]
            const def = effectiveWithoutOverrides[profileId][bloc]
            const current = overrides[bloc] ?? def
            const modified = overrides[bloc] !== undefined
            const isLfiLeft = profileId === 'lfi_rn' && bloc === 'gauche'
            const provList =
              s.transferSource === 'declared2027' && !row.camp
                ? (['declare2027'] as const)
                : [...new Set(Object.values(row.provenance))]
            return (
              <tr key={bloc} className="border-b border-rule/70 align-middle">
                <td className="py-1.5 pr-2">
                  {BLOC_VOTERS[bloc]}
                  {!modified && (
                    <span className="block text-xs text-ink-3">
                      {provList.map((p, i) => (
                        <span key={p}>
                          {i > 0 && ', '}
                          <span className={provenanceClass(p)}>{transfers.sources[p].label}</span>
                        </span>
                      ))}
                      {!row.camp && s.transferSource !== 'declared2027' && (
                        <span>
                          {` · 2022 ↔ 2024 (${pct(frontStrengthForBloc(bloc, s.republicanFront) * 100, 0)}${
                            isLfiLeft ? `, MC ${s.lfiLeftTransferRange[0]}–${s.lfiLeftTransferRange[1]} %` : ''
                          })`}
                        </span>
                      )}
                    </span>
                  )}
                  {modified && <span className="block text-xs font-medium text-ballpoint">modifié</span>}
                </td>
                <td className="py-1 text-right">
                  <NumberInput
                    label={`${BLOC_VOTERS[bloc]} vers le finaliste, en %`}
                    value={current.finalist}
                    onChange={(v) => update(bloc, current, 'finalist', v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </td>
                <td className="py-1 text-right">
                  <NumberInput
                    label={`${BLOC_VOTERS[bloc]} vers le RN, en %`}
                    value={current.rn}
                    onChange={(v) => update(bloc, current, 'rn', v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </td>
                <td className="num py-1.5 text-right text-ink-2">{num(current.abstention)}</td>
                <td className="py-1.5 pl-2 text-right">
                  {modified && (
                    <TextButton onClick={() => s.setTransferOverride(profileId, bloc, undefined)}>Rétablir</TextButton>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ProvenanceLegend />
      <TextButton onClick={s.resetTransfers}>Rétablir tous les paramètres de 2nd tour</TextButton>
    </div>
  )
}
