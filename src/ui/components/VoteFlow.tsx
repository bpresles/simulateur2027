import { useState } from 'react'
import type { SimulationResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars, transferLabel } from '../candidates'
import { num, pct, points } from '../format'
import { Segmented } from './controls'
import { InfoTip } from './InfoTip'
import { VoteFlowSankey } from './VoteFlowSankey'

type View = 'table' | 'chart'

/**
 * Composition des voix de chaque finaliste et taux de report de chaque électorat, en tableau ou en
 * diagramme de Sankey. Le choix d'affichage reste local : ce n'est pas un réglage de la simulation.
 */
export function VoteFlow({ result }: { result: SimulationResult }) {
  const [view, setView] = useState<View>('chart')
  const sr = result.secondRound
  const flows = [...sr.flows].sort((x, y) => y.share - x.share)
  const transfers = flows.filter((f) => !f.isFinalistVoter)
  const allies = flows.filter((f) => f.isFinalistVoter)
  const a = cand(sr.a)
  const b = cand(sr.b)

  return (
    <section aria-labelledby="flow-title" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="flow-title" className="text-2xl font-bold tracking-tight">
          Reports vers le second tour
        </h2>
        <Segmented
          value={view}
          onValueChange={setView}
          label="Affichage des reports"
          options={[
            { value: 'chart', label: 'Graphique', hint: 'Diagramme de Sankey' },
            { value: 'table', label: 'Tableau' },
          ]}
        />
      </div>
      <p className="mt-1 text-ink-2">
        D’où viennent les voix de {a.shortName} et de {b.shortName}, en points des électeurs du 1er tour.
      </p>

      {view === 'chart' ? (
        <figure className="mt-4">
          <figcaption className="mb-2 text-sm text-ink-3">
            À gauche, l’électorat de chaque candidat au 1er tour simulé (avant alliances) ; à droite, les voix
            des finalistes (en % des exprimés) et les blancs, nuls et abstentions. L’épaisseur d’un ruban est
            proportionnelle aux électeurs du 1er tour qui se reportent. Une alliance entre candidats éliminés
            ne change pas ces reports.
          </figcaption>
          <VoteFlowSankey sr={sr} flows={[...allies, ...transfers]} />
        </figure>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <Composition
              label={a.shortName}
              flows={flows}
              pick={(f) => f.toA}
              total={sr.votes.a}
              score={sr.pct.a}
            />
            <Composition
              label={b.shortName}
              flows={flows}
              pick={(f) => f.toB}
              total={sr.votes.b}
              score={sr.pct.b}
            />
          </div>
          <TransferTable flows={[...allies, ...transfers]} a={a.shortName} b={b.shortName} />
        </>
      )}
      <p className="mt-2 text-sm text-ink-3">
        Les électeurs des finalistes et de leurs alliés leur restent fidèles à {pct(sr.fidelity * 100, 0)}.
        {flows.some((f) => f.like) &&
          ' Ceux d’un petit candidat se reportent comme les électorats indiqués, selon leurs poids (réglages).'}
      </p>
    </section>
  )
}

function TransferTable({ flows, a, b }: { flows: Flow[]; a: string; b: string }) {
  return (
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
            <th className="py-1.5 pr-2 text-right font-medium">{a}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{b}</th>
            <th className="py-1.5 text-right font-medium">Blanc, abst.</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => (
            <FlowRow key={f.candidateId} flow={f} />
          ))}
        </tbody>
      </table>
    </div>
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
        {flow.like && (
          <span className="block pl-[1.125rem] text-xs text-ink-3">comme {transferLabel(flow.like)}</span>
        )}
      </td>
      <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(flow.share)}</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toA), 0)}&#8239;%</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toB), 0)}&#8239;%</td>
      <td className="num py-1.5 text-right text-ink-2">{num(rate(flow.abstention), 0)}&#8239;%</td>
    </tr>
  )
}

/**
 * Composition des voix d'un finaliste. `total` : ses voix en points des électeurs du 1er tour (base des
 * parts) ; `score` : son résultat en % des exprimés, le seul affiché, comme dans le graphique et le duel.
 */
function Composition({
  label,
  flows,
  pick,
  total,
  score,
}: {
  label: string
  flows: Flow[]
  pick: (f: Flow) => number
  total: number
  score: number
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
              content={`${c.shortName} : ${points(pick(f), 1, true)} des électeurs du 1er tour (${pct((pick(f) * 100) / total)} des voix de ${label})`}
            >
              <span
                style={{ ...colorVars(c), flexGrow: pick(f), flexBasis: 0 }}
                className="cand-fill h-full min-w-[2px] first:rounded-l-[3px] last:rounded-r-[3px]"
              />
            </InfoTip>
          )
        })}
      </div>
      <span className="num text-right text-sm text-ink-2">{pct(score)}</span>
    </div>
  )
}
