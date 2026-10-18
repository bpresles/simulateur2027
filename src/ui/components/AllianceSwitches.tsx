import { simulationData } from '../../data/schema'
import { alliancesConflict } from '../../domain/alliances'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { Switch } from './controls'

const { alliances } = simulationData.polls

/** Interrupteurs d'alliance : une alliance incompatible avec une alliance active est désactivée. */
export function AllianceSwitches({ idPrefix }: { idPrefix: string }) {
  const active = useSettings((s) => s.alliances)
  const setAlliance = useSettings((s) => s.setAlliance)

  return (
    <div className="space-y-3">
      {alliances.map((a) => {
        const blocker = alliances.find((b) => active[b.id] && alliancesConflict(a, b))
        const disabled = !active[a.id] && blocker !== undefined
        return (
          <Switch
            key={a.id}
            id={`${idPrefix}-${a.id}`}
            checked={!!active[a.id]}
            onCheckedChange={(v) => setAlliance(a.id, v)}
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
            description={disabled ? `Incompatible avec « ${blocker.label} »` : a.description}
          />
        )
      })}
    </div>
  )
}
