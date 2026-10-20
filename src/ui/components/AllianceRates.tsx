import { simulationData } from '../../data/schema'
import type { AllianceRate, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, profileLabel } from '../candidates'
import { pct } from '../format'
import { provenanceClass } from '../provenance'
import { Slider, TextButton } from './controls'

const { transfers, polls } = simulationData
const labels = new Map(polls.alliances.map((a) => [a.id, a.label]))

/**
 * Taux de report de chaque alliance : part qui suit le leader, part RN, abstention, et leur source.
 * En mode modifiable, un curseur par alliance remplace la part qui suit le leader.
 */
export function AllianceRates({ result, editable = false }: { result: SimulationResult; editable?: boolean }) {
  const applied = new Set(result.entrants.flatMap((e) => e.allianceIds))
  return (
    <ul className="space-y-4">
      {result.allianceRates.map((r) => (
        <li key={r.allianceId} className="text-sm">
          <p className="font-medium text-ink">
            {labels.get(r.allianceId)}
            {applied.has(r.allianceId) && <span className="ml-2 text-xs font-medium text-ballpoint">active</span>}
          </p>
          {r.joining.map((j) => (
            <JoiningRate key={j.candidateId} rate={r} joining={j} editable={editable} />
          ))}
        </li>
      ))}
    </ul>
  )
}

function JoiningRate({
  rate,
  joining: j,
  editable,
}: {
  rate: AllianceRate
  joining: AllianceRate['joining'][number]
  editable: boolean
}) {
  const setOverride = useSettings((s) => s.setAllianceOverride)
  const row = j.source ? transfers.profiles.find((p) => p.id === j.source!.profileId)!.rows[j.source.bloc] : null
  const from = cand(j.candidateId).shortName
  const to = cand(rate.leaderId).shortName

  return (
    <div className="mt-1">
      <p className="text-ink-2">
        Électeurs de {from} vers {to} : <span className="num font-medium text-ink">{pct(j.leader * 100, 0)}</span>{' '}
        le suivent, <span className="num">{pct(j.rn * 100, 0)}</span> votent RN,{' '}
        <span className="num">{pct((1 - j.leader - j.rn) * 100, 0)}</span> s’abstiennent.
      </p>
      {editable && (
        <div className="mt-2 flex items-center gap-3">
          <Slider
            label={`Part des électeurs de ${from} qui suivent ${to}`}
            value={Math.round(j.leader * 100)}
            onValueChange={(v) => setOverride(rate.allianceId, v / 100)}
            min={0}
            max={100}
            step={1}
          />
          <span className="num w-12 text-right font-medium">{pct(j.leader * 100, 0)}</span>
        </div>
      )}
      <p className="mt-1 text-xs text-ink-3">
        {j.isOverride ? (
          <>
            Modifié (taux 2024 : {pct(j.default2024.leader * 100, 0)} le suivent, {pct(j.default2024.rn * 100, 0)}{' '}
            votent RN). {editable && <TextButton onClick={() => setOverride(rate.allianceId, undefined)}>Rétablir le taux 2024</TextButton>}
          </>
        ) : row && j.source ? (
          <>
            Législatives 2024, profil « {profileLabel(j.source.profileId)} » :{' '}
            <span className={provenanceClass(row.provenance.finalist)}>
              {transfers.sources[row.provenance.finalist].label}
            </span>
          </>
        ) : (
          'Aucun profil de reports pour ce leader : toutes les voix le suivent.'
        )}
      </p>
    </div>
  )
}
