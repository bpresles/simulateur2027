import { REPUBLICAN_FRONT_PRESETS } from '../../domain/transfers'
import { REPUBLICAN_FRONT_FAMILIES } from '../../domain/types'
import type { RepublicanFrontFamily, RepublicanFrontPreset, RepublicanFrontSettings } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { num } from '../format'
import { Slider } from './controls'

const PRESET_OPTIONS: { id: RepublicanFrontPreset; label: string; hint: string }[] = [
  { id: 'none', label: 'Effacé', hint: '0 % sur tous les duels' },
  { id: 'eroded2027', label: 'Érodé 2027', hint: 'Défaut : 55 % Centre/Droite, 50 % Gauche modérée, 35 % LFI' },
  { id: 'level2022', label: 'Niveau 2022', hint: '75 % (repère présidentielle 2022)' },
  { id: 'level2017', label: 'Niveau 2017', hint: '100 % (repère présidentielle 2017)' },
]

const FAMILY_META: { id: RepublicanFrontFamily; label: string; examples: string }[] = [
  { id: 'centerRight', label: 'Centre / Droite', examples: 'Philippe, Lisnard…' },
  { id: 'moderateLeft', label: 'Gauche modérée', examples: 'Glucksmann…' },
  { id: 'lfi', label: 'LFI', examples: 'Mélenchon' },
]

function matchesPreset(rf: RepublicanFrontSettings, preset: RepublicanFrontPreset): boolean {
  const target = REPUBLICAN_FRONT_PRESETS[preset]
  return REPUBLICAN_FRONT_FAMILIES.every((k) => Math.abs(rf[k] - target[k]) < 0.005)
}

/**
 * Réglage du front républicain (vote de rejet du RN) :
 * préréglages historiques (2017, 2022, 2027 érodé, effacé), curseur principal global et réglage
 * séparé par famille de duel (Centre/Droite, Gauche modérée, LFI).
 */
export function RepublicanFrontControls({ compact = false }: { compact?: boolean }) {
  const rf = useSettings((s) => s.republicanFront)
  const transferSource = useSettings((s) => s.transferSource)
  const setRepublicanFront = useSettings((s) => s.setRepublicanFront)
  const setRepublicanFrontGlobal = useSettings((s) => s.setRepublicanFrontGlobal)
  const applyPreset = useSettings((s) => s.applyRepublicanFrontPreset)
  const resetRepublicanFront = useSettings((s) => s.resetRepublicanFront)

  const avg =
    REPUBLICAN_FRONT_FAMILIES.reduce((sum, k) => sum + rf[k], 0) / REPUBLICAN_FRONT_FAMILIES.length
  const isDefault = matchesPreset(rf, 'eroded2027')
  const disabled = transferSource === 'declared2027'

  return (
    <div className={compact ? 'space-y-3' : 'rounded-lg border border-rule bg-paper/60 p-3.5'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.95rem] font-medium text-ink">Front républicain (vote de rejet du RN)</p>
        {!isDefault && (
          <button type="button" className="link text-xs" onClick={resetRepublicanFront}>
            Rétablir
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-3">
        {disabled
          ? 'Inactif en mode « Déclarations 2027 » seul (ce réglage s’applique à la base historique et au mélange).'
          : 'Transpose les législatives 2024 en scrutin présidentiel (d’après 2017–2022) sur les 4 types de duels face au RN, puis module l’intensité du barrage anti-RN selon l’adversaire.'}
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
            <span className="font-semibold text-ink">Intensité globale</span>
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
  )
}
