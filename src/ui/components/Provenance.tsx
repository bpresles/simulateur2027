import { simulationData } from '../../data/schema'
import type { ProvenanceId } from '../../domain/types'
import { num } from '../format'
import { provenanceClass } from '../provenance'


/** Une valeur de report, marquée selon sa provenance. */
export function ProvenanceValue({ value, provenance }: { value: number; provenance: ProvenanceId }) {
  const source = simulationData.transfers.sources[provenance]
  return (
    <span className={`num ${provenanceClass(provenance)}`} title={source.label}>
      {num(value, value % 1 === 0 ? 0 : 1)}
    </span>
  )
}

export function ProvenanceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
      <li>
        <span className="num font-semibold text-ink">43</span> sourcé (franceinfo, Public Sénat, LCP)
      </li>
      <li>
        <span className="num prov-derive text-ink">31</span> complété par règle
      </li>
      <li>
        <span className="num prov-transpose text-ink">72</span> taux 2024 d’un autre duel
      </li>
      <li>
        <span className="num prov-camp">100</span> camp RN (fidélité)
      </li>
      <li>
        <span className="num prov-hypothese px-1">25</span> hypothèse
      </li>
    </ul>
  )
}
