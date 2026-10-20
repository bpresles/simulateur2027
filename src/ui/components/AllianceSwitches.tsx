import { simulationData } from '../../data/schema'
import { acceptAlliances, alliancesConflict, availableAlliances, comboWith } from '../../domain/alliances'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { Switch } from './controls'

const { polls } = simulationData
/** Alliances que les hypothèses des sondages retenus permettent, seules ou combinées. */
const proposed = availableAlliances(polls)

const ids = (alliances: { id: string }[]) => Object.fromEntries(alliances.map((a) => [a.id, true]))

/**
 * Interrupteurs d'alliance : seules les alliances testées par les sondages sont proposées. Activer une
 * alliance qui n'est testée qu'avec d'autres les active aussi ; une alliance incompatible avec les
 * alliances actives, ou non testée avec elles, est désactivée.
 */
export function AllianceSwitches({ idPrefix }: { idPrefix: string }) {
  const active = useSettings((s) => s.alliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  const accepted = acceptAlliances(polls, active)

  if (proposed.length === 0) {
    return <p className="text-sm text-ink-3">Aucun sondage de la période ne teste de ralliement.</p>
  }
  return (
    <div className="space-y-3">
      {proposed.map((a) => {
        const checked = accepted.includes(a)
        const combo = checked ? undefined : comboWith(polls, accepted, a)
        const blocker = accepted.find((b) => alliancesConflict(a, b))
        const extra = combo?.filter((b) => b !== a && !accepted.includes(b)) ?? []
        const description = checked
          ? a.description
          : combo
            ? extra.length > 0
              ? `Active aussi ${extra.map((b) => `« ${b.label} »`).join(', ')} : seule combinaison testée`
              : a.description
            : blocker
              ? `Incompatible avec « ${blocker.label} »`
              : 'Non testée avec les alliances actives'
        return (
          <Switch
            key={a.id}
            id={`${idPrefix}-${a.id}`}
            checked={checked}
            onCheckedChange={(v) =>
              // Désactiver une alliance retire aussi celles qui ne sont testées qu'avec elle.
              setAlliances(ids(v ? (combo ?? accepted) : acceptAlliances(polls, ids(accepted.filter((b) => b !== a)))))
            }
            disabled={!checked && !combo}
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
    </div>
  )
}
