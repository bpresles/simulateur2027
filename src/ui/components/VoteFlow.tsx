import type { SimulationResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars } from '../candidates'
import { num, pct } from '../format'
import { InfoTip } from './InfoTip'

/** Composition des voix de chaque finaliste et taux de report de chaque électorat. */
export function VoteFlow({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const flows = [...sr.flows].sort((x, y) => y.share - x.share)
  const transfers = flows.filter((f) => !f.isFinalistVoter)
  const allies = flows.filter((f) => f.isFinalistVoter)
  const a = cand(sr.a)
  const b = cand(sr.b)

  return (
    <section aria-labelledby="flow-title" className="mt-12">
      <h2 id="flow-title" className="text-2xl font-bold tracking-tight">
        Reports vers le second tour
      </h2>
      <p className="mt-1 text-ink-2">
        D’où viennent les voix de {a.shortName} et de {b.shortName}, en points des électeurs du 1er tour.
      </p>

      <div className="mt-4 space-y-3">
        <Composition label={a.shortName} flows={flows} pick={(f) => f.toA} total={sr.votes.a} />
        <Composition label={b.shortName} flows={flows} pick={(f) => f.toB} total={sr.votes.b} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <caption className="mb-2 text-left text-ink-3">
            Électorat de chaque candidat au 1er tour simulé (avant alliances) et son report au 2nd tour. Une
            alliance entre candidats éliminés ne change pas ces reports.
          </caption>
          <thead>
            <tr className="border-b border-rule text-left text-ink-3">
              <th className="py-1.5 pr-2 font-medium">Électeurs de</th>
              <th className="py-1.5 pr-2 text-right font-medium">Électorat</th>
              <th className="py-1.5 pr-2 text-right font-medium">{a.shortName}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{b.shortName}</th>
              <th className="py-1.5 text-right font-medium">Blanc, abst.</th>
            </tr>
          </thead>
          <tbody>
            {[...allies, ...transfers].map((f) => (
              <FlowRow key={f.candidateId} flow={f} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        Les électeurs des finalistes et de leurs alliés leur restent fidèles à {pct(sr.fidelity * 100, 0)}.
      </p>
    </section>
  )
}

function FlowRow({ flow }: { flow: Flow }) {
  const c = cand(flow.candidateId)
  const rate = (v: number) => (flow.share > 0 ? (v * 100) / flow.share : 0)
  return (
    <tr className="border-b border-rule/70">
      <td className="py-1.5 pr-2">
        <span className="flex items-center gap-2">
          <span style={colorVars(c)} className="cand-fill h-2.5 w-2.5 shrink-0 rounded-full" />
          {c.shortName}
        </span>
      </td>
      <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(flow.share)}</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toA), 0)}&#8239;%</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toB), 0)}&#8239;%</td>
      <td className="num py-1.5 text-right text-ink-2">{num(rate(flow.abstention), 0)}&#8239;%</td>
    </tr>
  )
}

function Composition({
  label,
  flows,
  pick,
  total,
}: {
  label: string
  flows: Flow[]
  pick: (f: Flow) => number
  total: number
}) {
  const parts = flows.filter((f) => pick(f) > 0.05)
  return (
    <div className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3">
      <span className="truncate text-sm font-medium">{label}</span>
      <div className="flex h-3 gap-[2px]">
        {parts.map((f) => {
          const c = cand(f.candidateId)
          return (
            <InfoTip
              key={f.candidateId}
              content={`${c.shortName} : ${pct(pick(f))} des électeurs du 1er tour (${pct((pick(f) * 100) / total)} des voix de ${label})`}
            >
              <span
                style={{ ...colorVars(c), flexGrow: pick(f), flexBasis: 0 }}
                className="cand-fill h-full min-w-[2px] first:rounded-l-[3px] last:rounded-r-[3px]"
              />
            </InfoTip>
          )
        })}
      </div>
      <span className="num text-right text-sm text-ink-2">{pct(total)}</span>
    </div>
  )
}
