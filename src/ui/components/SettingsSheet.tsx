import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { simulationData } from '../../data/schema'
import { BLOCS } from '../../domain/types'
import type { Bloc, ProfileId, SimulationResult, TransferValues } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { BLOC_VOTERS, cand, colorVars } from '../candidates'
import { num, pct, pts, ratio } from '../format'
import { referenceParts } from '../../domain/references'
import { secondRoundDropout2022 } from '../../domain/secondRound'
import { AllianceRates } from './AllianceRates'
import { AllianceSwitches, UntestedAlliancesSwitch } from './AllianceSwitches'
import { Segmented, Slider, Switch, TextButton } from './controls'
import { provenanceClass } from '../provenance'
import { ProvenanceLegend } from './Provenance'

const { transfers } = simulationData
const COMPOSITE = simulationData.polls.candidates.filter((c) => Array.isArray(c.ref2022) && c.ref2022.length === 2)
const REF_NAMES = new Map(simulationData.reference2022.candidates.map((c) => [c.id, c.name]))

export function SettingsSheet({
  open,
  onOpenChange,
  result,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  result: SimulationResult
}) {
  const resetAll = useSettings((s) => s.resetAll)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(10_12_18/0.45)]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[36rem] flex-col bg-paper shadow-2xl focus:outline-none">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <Dialog.Title className="text-xl font-bold tracking-tight">Réglages</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-ink-3">
                Enregistrés dans ce navigateur. Les valeurs par défaut restent calculées à partir des sources.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md px-2 py-1 text-sm font-medium text-ink-2 hover:bg-sunken">
              Fermer
            </Dialog.Close>
          </header>

          <Tabs.Root defaultValue="corrections" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List aria-label="Catégories de réglages" className="flex gap-1 border-b border-rule px-5">
              {[
                ['corrections', 'Corrections'],
                ['alliances', 'Alliances'],
                ['reports', 'Reports et abstention'],
              ].map(([v, l]) => (
                <Tabs.Trigger
                  key={v}
                  value={v!}
                  className="-mb-px border-b-2 border-transparent px-2 py-2.5 text-sm font-medium text-ink-3 hover:text-ink data-[state=active]:border-ballpoint data-[state=active]:text-ink"
                >
                  {l}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <Tabs.Content value="corrections">
                <CorrectionsPanel result={result} />
              </Tabs.Content>
              <Tabs.Content value="alliances">
                <AlliancesPanel result={result} />
              </Tabs.Content>
              <Tabs.Content value="reports">
                <TransfersEditor />
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
      value={value === undefined ? '' : Number(value.toFixed(2))}
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

function CorrectionsPanel({ result }: { result: SimulationResult }) {
  const s = useSettings()
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2">
        La correction par défaut vaut <em>moyenne × (ratio 2022 − 1) × intensité de la correction</em>, appliquée aux sondages
        projetés si la progression comme en 2022 est activée. Saisissez une valeur en
        points pour la remplacer ; videz le champ pour revenir au calcul.
      </p>
      <Switch
        id="sheet-corrections"
        checked={s.correctionsEnabled}
        onCheckedChange={s.setCorrectionsEnabled}
        label="Corriger la moyenne des sondages"
      />
      <div className="space-y-4 rounded-lg bg-sunken/60 p-4">
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Références pondérées.</span> Le ratio de 2022 de ces candidats
          mélange deux références ; il sert à la correction et à la progression.
        </p>
        {COMPOSITE.map((c) => {
          const [first, second] = referenceParts(c, s.referenceBlend[c.id])
          const name = (id: string) => REF_NAMES.get(id) ?? id
          return (
            <div key={c.id}>
              <p className="text-sm">
                <span className="font-medium">{c.shortName}</span> : {name(first!.id)} {pct(first!.weight * 100, 0)},{' '}
                {name(second!.id)} {pct(second!.weight * 100, 0)}
                {s.referenceBlend[c.id] !== undefined && (
                  <TextButton className="ml-2" onClick={() => s.setReferenceBlend(c.id, undefined)}>
                    Rétablir
                  </TextButton>
                )}
              </p>
              <div className="mt-2">
                <Slider
                  label={`Poids de ${name(second!.id)} dans la référence de ${c.shortName}`}
                  value={Math.round(second!.weight * 100)}
                  onValueChange={(v) => s.setReferenceBlend(c.id, v / 100)}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            </div>
          )
        })}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-3">
            <th className="py-1.5 font-medium">Candidat</th>
            <th className="py-1.5 text-right font-medium">{s.progressionEnabled ? 'Projetée' : result.institutesUsed === 1 ? 'Sondage' : 'Moyenne'}</th>
            <th className="py-1.5 text-right font-medium">Ratio 2022</th>
            <th className="py-1.5 text-right font-medium">Calculée</th>
            <th className="py-1.5 text-right font-medium">Manuelle</th>
          </tr>
        </thead>
        <tbody>
          {result.firstRound.map((r) => {
            const c = cand(r.candidateId)
            const override = s.correctionOverrides[c.id]
            return (
              <tr key={c.id} className="border-b border-rule/70">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span style={colorVars(c)} className="cand-fill h-2.5 w-2.5 rounded-full" />
                    {c.shortName}
                  </span>
                </td>
                <td className="num py-1.5 text-right">{pct(r.projected)}</td>
                <td className="num py-1.5 text-right text-ink-2">{r.ratio2022 ? ratio(r.ratio2022) : '—'}</td>
                <td className="num py-1.5 text-right text-ink-2">{pts(r.defaultCorrection * s.correctionIntensity)}</td>
                <td className="py-1 text-right">
                  <NumberInput
                    label={`Correction manuelle pour ${c.name}, en points`}
                    value={override}
                    placeholder={num(r.defaultCorrection * s.correctionIntensity)}
                    onChange={(v) => s.setCorrectionOverride(c.id, v)}
                    min={-30}
                    max={30}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <TextButton onClick={s.resetCorrections}>Rétablir les corrections calculées</TextButton>
    </div>
  )
}

function AlliancesPanel({ result }: { result: SimulationResult }) {
  const untested = useSettings((s) => s.untestedAlliances)
  return (
    <div className="space-y-6">
      <UntestedAlliancesSwitch id="sheet-untested-alliances" />
      <AllianceSwitches idPrefix="sheet-alliance" result={result} />
      <p className="text-sm text-ink-3">
        Une alliance testée par les sondeurs retire le candidat rallié du 1er tour : on ne retient que les
        hypothèses de sondage qui testent tous les autres candidats sans lui, et seuls les sondages qui en ont
        une. Aucun taux de report n’est appliqué : ce sont les sondés qui répartissent ses électeurs. Une
        alliance testée seulement avec une autre active les deux. Un candidat ne peut rallier qu’une alliance,
        et un candidat rallié ne peut pas en mener une autre.
      </p>
      {untested && (
        <div className="space-y-4 border-t border-rule pt-5">
          <div>
            <p className="text-[0.95rem] font-medium">Report des voix du candidat rallié (alliances estimées)</p>
            <p className="mt-0.5 text-sm text-ink-3">
              Une alliance qu’aucun sondage ne teste est estimée : par défaut, taux constatés aux législatives
              2024 après les désistements, les électeurs du candidat rallié se comportant comme leur électorat
              dans les duels où un candidat de la famille du leader affrontait le RN. Le curseur règle la part
              qui suit le leader ; le reste se répartit entre vote RN et abstention dans les proportions de
              2024. Si le leader est au 2nd tour, ceux qui se sont abstenus au 1er tour se reportent alors comme
              les électeurs de leur bloc.
            </p>
          </div>
          <AllianceRates result={result} editable />
        </div>
      )}
    </div>
  )
}

function SecondRoundPanel() {
  const s = useSettings()
  const fidelity = s.fidelity ?? transfers.defaultFidelity
  const reference = secondRoundDropout2022(simulationData.reference2022)
  const target = s.abstentionTarget ?? reference
  return (
    <div className="space-y-6 border-b border-rule pb-6">
      <div>
        <Switch
          id="sheet-abstention"
          checked={s.abstentionCalibration}
          onCheckedChange={s.setAbstentionCalibration}
          label={`Caler blancs, nuls et abstention : ${pct(target, 2)}`}
          description={`Part des électeurs exprimés du 1er tour qui ne s’expriment pas au 2nd. Par défaut, niveau réel du 2nd tour 2022 (${pct(reference, 2)}). Désactivé : taux bruts des législatives 2024.`}
        />
        <div className="mt-3 pl-12">
          <Slider
            label="Blancs, nuls et abstention au 2nd tour"
            value={target}
            onValueChange={(v) => s.setAbstentionTarget(v)}
            min={0}
            max={25}
            step={0.25}
            disabled={!s.abstentionCalibration}
          />
          {s.abstentionTarget !== null && (
            <TextButton className="mt-2" onClick={() => s.setAbstentionTarget(null)}>
              Revenir au niveau de 2022
            </TextButton>
          )}
        </div>
      </div>
      <div>
        <p className="text-[0.95rem] font-medium">Fidélité des électeurs des finalistes : {pct(fidelity * 100, 0)}</p>
        <p className="mb-3 mt-0.5 text-sm text-ink-3">
          Part des électeurs d’un finaliste, de ses alliés et du camp RN qui votent pour lui au 2nd tour.
          Hypothèse par défaut : {pct(transfers.defaultFidelity * 100, 0)}.
        </p>
        <Slider
          label="Fidélité des électeurs des finalistes"
          value={fidelity * 100}
          onValueChange={(v) => s.setFidelity(v / 100)}
          min={70}
          max={100}
          step={1}
        />
      </div>
    </div>
  )
}

function TransfersEditor() {
  const [profileId, setProfileId] = useState<ProfileId>('lfi_rn')
  const s = useSettings()
  const profile = transfers.profiles.find((p) => p.id === profileId)!
  const overrides = s.transferOverrides[profileId] ?? {}

  const update = (bloc: Bloc, current: TransferValues, key: 'finalist' | 'rn', v: number | undefined) => {
    const next = { ...current, [key]: Math.min(100, Math.max(0, v ?? profile.rows[bloc][key])) }
    if (next.finalist + next.rn > 100) {
      if (key === 'finalist') next.rn = 100 - next.finalist
      else next.finalist = 100 - next.rn
    }
    next.abstention = 100 - next.finalist - next.rn
    s.setTransferOverride(profileId, bloc, next)
  }

  return (
    <div className="space-y-5">
      <SecondRoundPanel />
      <p className="text-sm text-ink-2">
        Taux de report de chaque électorat selon le type de duel. Le taux de blanc, nul ou abstention est
        recalculé pour que la ligne totalise 100 %.
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
            const current = overrides[bloc] ?? row
            const modified = overrides[bloc] !== undefined
            return (
              <tr key={bloc} className="border-b border-rule/70 align-middle">
                <td className="py-1.5 pr-2">
                  {BLOC_VOTERS[bloc]}
                  {!modified && (
                    <span className="block text-xs text-ink-3">
                      {[...new Set(Object.values(row.provenance))].map((p, i) => (
                        <span key={p}>
                          {i > 0 && ', '}
                          <span className={provenanceClass(p)}>{transfers.sources[p].label}</span>
                        </span>
                      ))}
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
      <TextButton onClick={s.resetTransfers}>Rétablir tous les reports sourcés</TextButton>
    </div>
  )
}
