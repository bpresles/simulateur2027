import {
  DEFAULT_LFI_LEFT_TRANSFER,
  DEFAULT_LFI_LEFT_TRANSFER_RANGE,
  REPUBLICAN_FRONT_PRESETS,
} from '../../domain/transfers'
import { REPUBLICAN_FRONT_FAMILIES } from '../../domain/types'
import type { RepublicanFrontFamily, RepublicanFrontPreset, RepublicanFrontSettings } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { num } from '../format'
import { Slider } from './controls'

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
    hint: '100 % : enquête Ipsos-Talan des législatives 2024 (défaut provisoire)',
  },
]

const FAMILY_META: { id: RepublicanFrontFamily; label: string; examples: string }[] = [
  { id: 'centerRight', label: 'Centre / Droite', examples: 'Philippe, Lisnard…' },
  { id: 'moderateLeft', label: 'Gauche modérée', examples: 'Glucksmann…' },
  { id: 'lfi', label: 'LFI', examples: 'Mélenchon' },
]

const LFI_LEFT_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 36, label: '36 % (décl. 2027)', hint: 'Déclarations 2027 corrigées en logit (borne basse)' },
  { value: 54, label: '54 % (médian)', hint: 'Point médian entre déclarations 2027 et NFP 2024' },
  { value: 72, label: '72 % (NFP 2024)', hint: 'Repère des législatives 2024 (borne haute, défaut provisoire)' },
]

function matchesPreset(rf: RepublicanFrontSettings, preset: RepublicanFrontPreset): boolean {
  const target = REPUBLICAN_FRONT_PRESETS[preset]
  return REPUBLICAN_FRONT_FAMILIES.every((k) => Math.abs(rf[k] - target[k]) < 0.005)
}

/**
 * Réglage du front républicain (interpolation logit entre deux repères mesurés : Présidentielle 2022 = 0 %
 * et Législatives 2024 = 100 %) et curseur dédié au report gauche hors LFI → Mélenchon.
 */
export function RepublicanFrontControls({ compact = false }: { compact?: boolean }) {
  const rf = useSettings((s) => s.republicanFront)
  const lfiLeftTransfer = useSettings((s) => s.lfiLeftTransfer)
  const lfiLeftRange = useSettings((s) => s.lfiLeftTransferRange)
  const transferSource = useSettings((s) => s.transferSource)
  const setRepublicanFront = useSettings((s) => s.setRepublicanFront)
  const setRepublicanFrontGlobal = useSettings((s) => s.setRepublicanFrontGlobal)
  const applyPreset = useSettings((s) => s.applyRepublicanFrontPreset)
  const resetRepublicanFront = useSettings((s) => s.resetRepublicanFront)
  const setLfiLeftTransfer = useSettings((s) => s.setLfiLeftTransfer)
  const resetLfiLeftTransfer = useSettings((s) => s.resetLfiLeftTransfer)

  const avg =
    REPUBLICAN_FRONT_FAMILIES.reduce((sum, k) => sum + rf[k], 0) / REPUBLICAN_FRONT_FAMILIES.length
  const isDefaultRf = matchesPreset(rf, 'leg2024')
  const isDefaultLfiLeft =
    lfiLeftTransfer === DEFAULT_LFI_LEFT_TRANSFER &&
    lfiLeftRange[0] === DEFAULT_LFI_LEFT_TRANSFER_RANGE[0] &&
    lfiLeftRange[1] === DEFAULT_LFI_LEFT_TRANSFER_RANGE[1]
  const disabled = transferSource === 'declared2027'

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 rounded-lg border border-rule bg-paper/60 p-3.5'}>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.95rem] font-medium text-ink">Front républicain (repères 2022 ↔ 2024)</p>
          {!isDefaultRf && (
            <button type="button" className="link text-xs" onClick={resetRepublicanFront}>
              Rétablir
            </button>
          )}
        </div>

        <p className="mt-1 text-xs text-ink-3">
          {disabled
            ? 'Inactif en mode « Déclarations 2027 » seul (ce réglage s’applique à la base historique et au mélange).'
            : 'Interpole directement en logit entre deux scrutins mesurés : 0 % = présidentielle 2022, 100 % = législatives 2024 (sans extrapolation sous 2022).'}
        </p>

        <div className={disabled ? 'pointer-events-none mt-2.5 space-y-3 opacity-50' : 'mt-2.5 space-y-3'}>
          <div role="group" aria-label="Préréglages du front républicain" className="flex flex-wrap gap-1.5">
            {PRESET_OPTIONS.map((p) => {
              const active = matchesPreset(rf, p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.hint}
                  aria-pressed={active}
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
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
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {FAMILY_META.map((fam) => (
              <div key={fam.id} className="rounded-md bg-surface px-2.5 py-2 text-xs shadow-xs">
                <div className="mb-1 flex items-baseline justify-between gap-1">
                  <span className="font-medium text-ink">{fam.label}</span>
                  <span className="num font-semibold text-ink">{num(rf[fam.id] * 100, 0)}&#8239;%</span>
                </div>
                <Slider
                  label={`Front républicain : ${fam.label}`}
                  value={Math.round(rf[fam.id] * 100)}
                  onValueChange={(v) => setRepublicanFront(fam.id, v / 100)}
                  min={0}
                  max={100}
                  step={5}
                />
                <span className="mt-1 block truncate text-[0.7rem] text-ink-3">{fam.examples}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report gauche hors LFI → Mélenchon (non mesuré directement en présidentielle) */}
      <div className={disabled ? 'pointer-events-none border-t border-rule/80 pt-3 opacity-50' : 'border-t border-rule/80 pt-3'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink">Report gauche hors LFI → Mélenchon (duel LFI – RN)</p>
          {!isDefaultLfiLeft && (
            <button type="button" className="link text-xs" onClick={resetLfiLeftTransfer}>
              Rétablir
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-3">
          Électeurs Glucksmann / Tondelier / Roussel face au RN : non mesuré en présidentielle. Plage tirée dans
          Monte-Carlo : <span className="num font-medium">{lfiLeftRange[0]}–{lfiLeftRange[1]}&#8239;%</span>.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Repères du report gauche hors LFI vers Mélenchon">
          {LFI_LEFT_PRESETS.map((p) => {
            const active = lfiLeftTransfer === p.value
            return (
              <button
                key={p.value}
                type="button"
                title={p.hint}
                aria-pressed={active}
                onClick={() => setLfiLeftTransfer(p.value)}
                className={`rounded-md px-2 py-0.5 text-[0.72rem] font-medium transition-colors ${
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
        <div className="mt-2 flex items-center gap-3 rounded-md bg-surface px-3 py-2 text-xs shadow-xs">
          <Slider
            label="Report gauche hors LFI vers Mélenchon"
            value={lfiLeftTransfer}
            onValueChange={setLfiLeftTransfer}
            min={20}
            max={85}
            step={1}
          />
          <span className="num w-11 text-right font-semibold text-ink">{num(lfiLeftTransfer, 0)}&#8239;%</span>
        </div>
      </div>
    </div>
  )
}
