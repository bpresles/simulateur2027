import { simulationData } from '../../data/schema'
import {
  acceptAlliances,
  alliancesConflict,
  availableAlliances,
  comboWith,
  isOptionChecked,
  testedOptions,
} from '../../domain/alliances'
import type { Alliance, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { Switch } from './controls'

const { polls } = simulationData
/** Alliances que les hypothèses des sondages retenus permettent, seules ou combinées. */
const proposed = availableAlliances(polls)
/** Options complètes testées par les sondeurs (plusieurs ralliements simultanés). */
const testedChoices = testedOptions(polls).filter((o) => o.alliances.length > 1)

const ids = (alliances: Alliance[]) => Object.fromEntries(alliances.map((a) => [a.id, true]))
const quoted = (alliances: Alliance[]) => alliances.map((a) => `« ${a.label} »`).join(', ')

/**
 * Interrupteurs d'alliances testées par les sondages.
 * Activer une alliance qui n'est testée qu'avec d'autres active la plus petite combinaison testée.
 */
export function AllianceSwitches({
  idPrefix,
  columns = false,
}: {
  idPrefix: string
  result?: SimulationResult
  /** Deux colonnes quand la largeur le permet. */
  columns?: boolean
}) {
  const active = useSettings((s) => s.alliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  const tested = acceptAlliances(polls, active)

  if (proposed.length === 0 && testedChoices.length === 0) {
    return <p className="text-sm text-ink-3">Aucun sondage de la période ne teste de ralliement.</p>
  }

  return (
    <div className={columns ? 'grid gap-x-8 gap-y-3 sm:grid-cols-2' : 'space-y-3'}>
      {proposed.map((a) => {
        const checked = tested.includes(a)
        const combo = comboWith(polls, tested, a)
        const blocker = tested.find((b) => alliancesConflict(a, b))
        const partners = combo?.filter((b) => b !== a && !tested.includes(b)) ?? []
        const disabled = !checked && !combo
        const description = checked
          ? a.description
          : combo
            ? partners.length > 0
              ? `Active aussi ${quoted(partners)} : seule combinaison testée`
              : a.description
            : blocker
              ? `Incompatible avec « ${blocker.label} »`
              : 'Non testée avec les alliances actives'

        return (
          <Switch
            key={a.id}
            id={`${idPrefix}-${a.id}`}
            checked={checked}
            onCheckedChange={(v) => {
              const next = v ? (combo ?? tested) : acceptAlliances(polls, ids(tested.filter((b) => b !== a)))
              setAlliances(ids(next))
            }}
            disabled={disabled}
            label={
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex gap-1" aria-hidden>
                  {a.members.map((id) => (
                    <span key={id} style={colorVars(cand(id))} className="cand-fill h-2.5 w-2.5 rounded-full" />
                  ))}
                </span>
                {a.label}
              </span>
            }
            description={description}
          />
        )
      })}

      {testedChoices.length > 0 && (
        <>
          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-ink-3 sm:col-span-2">
            Combinaisons testées par les sondeurs
          </p>
          {testedChoices.map((o) => {
            const checked = isOptionChecked(o, tested)
            return (
              <Switch
                key={o.id}
                id={`${idPrefix}-${o.id}`}
                checked={checked}
                onCheckedChange={(v) => {
                  const next = v ? o.alliances : acceptAlliances(polls, ids(tested.filter((b) => !o.alliances.includes(b))))
                  setAlliances(ids(next))
                }}
                label={
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex gap-1" aria-hidden>
                      {[...new Set(o.alliances.flatMap((a) => a.members))].map((id) => (
                        <span key={id} style={colorVars(cand(id))} className="cand-fill h-2.5 w-2.5 rounded-full" />
                      ))}
                    </span>
                    {o.label}
                  </span>
                }
                description={o.description}
              />
            )
          })}
        </>
      )}
    </div>
  )
}
