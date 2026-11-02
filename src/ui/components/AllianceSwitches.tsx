import { simulationData } from '../../data/schema'
import {
  acceptAlliances,
  alliancesConflict,
  availableAlliances,
  comboWith,
  isEstimable,
  testedShare,
} from '../../domain/alliances'
import type { Alliance, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { Switch } from './controls'

const { polls } = simulationData
/** Alliances que les hypothèses des sondages retenus permettent, seules ou combinées. */
const proposed = availableAlliances(polls)

const ids = (alliances: Alliance[]) => Object.fromEntries(alliances.map((a) => [a.id, true]))
/** Alliances que l'option désactivée ne permet plus d'estimer sont retirées ; les autres sont conservées. */
const stillAllowed = (active: Record<string, boolean>, untested: boolean, grouped: boolean) =>
  polls.alliances.filter((a) => active[a.id] && isEstimable(a, { untestedAlliances: untested, groupedAlliances: grouped }))
const quoted = (alliances: Alliance[]) => alliances.map((a) => `« ${a.label} »`).join(', ')

/**
 * Option « alliances non évaluées » (désactivée par défaut). La désactiver retire les alliances estimées
 * et ne garde que celles que les sondages testent.
 */
export function UntestedAlliancesSwitch({ id }: { id: string }) {
  const untested = useSettings((s) => s.untestedAlliances)
  const grouped = useSettings((s) => s.groupedAlliances)
  const active = useSettings((s) => s.alliances)
  const setUntested = useSettings((s) => s.setUntestedAlliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  return (
    <Switch
      id={id}
      checked={untested}
      onCheckedChange={(v) => {
        setUntested(v)
        // Les alliances groupées estimées restent actives tant que leur option l'est.
        if (!v) setAlliances(ids([...acceptAlliances(polls, active), ...stillAllowed(active, false, grouped)]))
      }}
      label="Permettre de tester des alliances non évaluées par les sondeurs"
      description="Estimées par les reports de voix des législatives 2024, faute d’hypothèse de sondage"
    />
  )
}

/**
 * Option « alliances groupées » (désactivée par défaut) : plusieurs candidats d'un camp rassemblés derrière
 * celui qui a le plus d'intentions de vote. La désactiver retire les alliances groupées actives.
 */
export function GroupedAlliancesSwitch({ id }: { id: string }) {
  const grouped = useSettings((s) => s.groupedAlliances)
  const untested = useSettings((s) => s.untestedAlliances)
  const active = useSettings((s) => s.alliances)
  const setGrouped = useSettings((s) => s.setGroupedAlliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  return (
    <Switch
      id={id}
      checked={grouped}
      onCheckedChange={(v) => {
        setGrouped(v)
        if (!v) setAlliances(ids([...acceptAlliances(polls, active), ...stillAllowed(active, untested, false)]))
      }}
      label="Alliances groupées"
      description="Plusieurs candidats d’un camp derrière celui qui a le plus d’intentions de vote, estimées par les reports de 2024"
    />
  )
}

/**
 * Interrupteurs d'alliance. Par défaut, seules les alliances testées par les sondages sont proposées :
 * activer une alliance qui n'est testée qu'avec d'autres les active aussi. Avec l'option des alliances non
 * évaluées, tout le catalogue est proposé ; une alliance sans hypothèse de sondage est alors estimée.
 */
export function AllianceSwitches({
  idPrefix,
  result,
  columns = false,
  grouped: onlyGrouped = false,
}: {
  idPrefix: string
  result: SimulationResult
  /** Deux colonnes quand la largeur le permet. */
  columns?: boolean
  /** Section des alliances groupées (option) au lieu des alliances simples. */
  grouped?: boolean
}) {
  const active = useSettings((s) => s.alliances)
  const untested = useSettings((s) => s.untestedAlliances)
  const grouped = useSettings((s) => s.groupedAlliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  const tested = acceptAlliances(polls, active)
  const estimated = polls.alliances.filter((a) => result.estimatedAllianceIds.includes(a.id))
  const applied = [...tested, ...estimated]
  const excludedPolls = useSettings((s) => s.excludedPolls)
  const simulated = new Set(result.firstRound.map((r) => r.candidateId))
  // Petit candidat absent du 1er tour simulé : son ralliement s'estime s'il est testé dans une hypothèse.
  const untestable = (id: string) => !simulated.has(id) && testedShare(polls, id, new Set(excludedPolls)) <= 0
  const options = { untestedAlliances: untested, groupedAlliances: grouped }
  const list = onlyGrouped
    ? polls.alliances.filter((a) => a.grouped && grouped)
    : untested
      ? polls.alliances.filter((a) => !a.grouped)
      : proposed

  if (list.length === 0) {
    if (onlyGrouped) return null
    return <p className="text-sm text-ink-3">Aucun sondage de la période ne teste de ralliement.</p>
  }
  return (
    <div className={columns ? 'grid gap-x-8 gap-y-3 sm:grid-cols-2' : 'space-y-3'}>
      {list.map((a) => {
        const checked = applied.includes(a)
        const combo = comboWith(polls, tested, a)
        const blocker = applied.find((b) => alliancesConflict(a, b))
        const partners = combo?.filter((b) => b !== a && !tested.includes(b)) ?? []
        let disabled: boolean
        let description: string | undefined
        let onCheckedChange: (v: boolean) => void
        if (!isEstimable(a, options)) {
          disabled = !checked && !combo
          description = checked
            ? a.description
            : combo
              ? partners.length > 0
                ? `Active aussi ${quoted(partners)} : seule combinaison testée`
                : a.description
              : blocker
                ? `Incompatible avec « ${blocker.label} »`
                : 'Non testée avec les alliances actives'
          // Désactiver une alliance retire aussi celles qui ne sont testées qu'avec elle.
          // Les alliances groupées estimées compatibles restent actives.
          onCheckedChange = (v) => {
            const next = v ? (combo ?? tested) : acceptAlliances(polls, ids(tested.filter((b) => b !== a)))
            setAlliances(ids([...next, ...estimated.filter((e) => !next.some((b) => alliancesConflict(e, b)))]))
          }
        } else {
          const isEstimated = checked ? estimated.includes(a) : !combo || partners.length > 0
          // Alliance à estimer dont un membre n'est testé par aucun sondage retenu : pas de score à reprendre.
          const missing = combo ? undefined : a.members.find(untestable)
          disabled = !checked && (blocker !== undefined || missing !== undefined)
          description =
            !checked && blocker
              ? `Incompatible avec « ${blocker.label} »`
              : !checked && missing
                ? `Aucun sondage retenu ne teste ${cand(missing).name}`
                : isEstimated
                  ? `${a.grouped ? `${a.description}. ` : ''}Estimée (reports 2024)${partners.length > 0 ? ` ; testée par les sondeurs avec ${quoted(partners)}` : ' : non testée par les sondeurs'}${a.grouped ? `, autour de ${cand(a.leader).name} (en tête de la moyenne des sondages)` : ''}`
                  : a.description
          onCheckedChange = (v) => setAlliances(ids(v ? [...applied, a] : applied.filter((b) => b !== a)))
        }
        return (
          <Switch
            key={a.id}
            id={`${idPrefix}-${a.id}`}
            checked={checked}
            onCheckedChange={onCheckedChange}
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
    </div>
  )
}
