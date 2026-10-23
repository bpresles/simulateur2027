import { simulationData } from '../../data/schema'
import { acceptAlliances, alliancesConflict, availableAlliances, comboWith, testedShare } from '../../domain/alliances'
import type { Alliance, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { Switch } from './controls'

const { polls } = simulationData
/** Alliances que les hypothèses des sondages retenus permettent, seules ou combinées. */
const proposed = availableAlliances(polls)

const ids = (alliances: Alliance[]) => Object.fromEntries(alliances.map((a) => [a.id, true]))
const quoted = (alliances: Alliance[]) => alliances.map((a) => `« ${a.label} »`).join(', ')

/**
 * Option « alliances non évaluées » (désactivée par défaut). La désactiver retire les alliances estimées
 * et ne garde que celles que les sondages testent.
 */
export function UntestedAlliancesSwitch({ id }: { id: string }) {
  const untested = useSettings((s) => s.untestedAlliances)
  const active = useSettings((s) => s.alliances)
  const setUntested = useSettings((s) => s.setUntestedAlliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  return (
    <Switch
      id={id}
      checked={untested}
      onCheckedChange={(v) => {
        setUntested(v)
        if (!v) setAlliances(ids(acceptAlliances(polls, active)))
      }}
      label="Permettre de tester des alliances non évaluées par les sondeurs"
      description="Estimées par les reports de voix des législatives 2024, faute d’hypothèse de sondage"
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
}: {
  idPrefix: string
  result: SimulationResult
  /** Deux colonnes quand la largeur le permet. */
  columns?: boolean
}) {
  const active = useSettings((s) => s.alliances)
  const untested = useSettings((s) => s.untestedAlliances)
  const setAlliances = useSettings((s) => s.setAlliances)
  const tested = acceptAlliances(polls, active)
  const estimated = polls.alliances.filter((a) => result.estimatedAllianceIds.includes(a.id))
  const applied = [...tested, ...estimated]
  const excludedPolls = useSettings((s) => s.excludedPolls)
  const simulated = new Set(result.firstRound.map((r) => r.candidateId))
  // Petit candidat absent du 1er tour simulé : son ralliement s'estime s'il est testé dans une hypothèse.
  const untestable = (id: string) => !simulated.has(id) && testedShare(polls, id, new Set(excludedPolls)) <= 0
  const list = untested ? polls.alliances : proposed

  if (list.length === 0) {
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
        if (!untested) {
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
          onCheckedChange = (v) =>
            setAlliances(ids(v ? (combo ?? tested) : acceptAlliances(polls, ids(tested.filter((b) => b !== a)))))
        } else {
          // Sondages où l'alliance est lue dans une hypothèse, et ceux où elle est estimée.
          const pollsWhere = (field: 'allianceIds' | 'estimatedAllianceIds') =>
            result.hypothesisGroups.filter((g) => g[field].includes(a.id)).reduce((n, g) => n + g.pollIds.length, 0)
          const [read, guessed] = [pollsWhere('allianceIds'), pollsWhere('estimatedAllianceIds')]
          const isEstimated = checked ? estimated.includes(a) : !combo || partners.length > 0
          // Alliance à estimer dont un membre n'est testé par aucun sondage retenu : pas de score à reprendre.
          const missing = combo ? undefined : a.members.find(untestable)
          disabled = !checked && (blocker !== undefined || missing !== undefined)
          description =
            !checked && blocker
              ? `Incompatible avec « ${blocker.label} »`
              : !checked && missing
                ? `Aucun sondage retenu ne teste ${cand(missing).name}`
                : checked && read > 0 && guessed > 0
                ? `Lue dans ${read} sondage${read > 1 ? 's' : ''}, estimée pour ${guessed} (reports 2024)`
                : isEstimated
                  ? `Estimée (reports 2024)${partners.length > 0 ? ` ; testée par les sondeurs avec ${quoted(partners)}` : ' : non testée par les sondeurs'}`
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
