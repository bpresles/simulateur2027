import { useState } from 'react'
import { simulationData } from '../../data/schema'
import { firstRoundParticipation, grossFlows, newVoterRates } from '../../domain/newVoters'
import type { GrossFlows, NewVoterRates } from '../../domain/newVoters'
import type { SimulationResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars, transferLabel } from '../candidates'
import { num, pct, shownScore } from '../format'
import { abstentionNote, unmeasuredNote } from '../newVotersText'
import { Segmented } from './controls'
import { InfoTip } from './InfoTip'
import { VoteFlowSankey } from './VoteFlowSankey'

type View = 'table' | 'chart'

/**
 * Composition des voix de chaque finaliste et taux de report de chaque électorat, en tableau ou en
 * diagramme de Sankey, en flux bruts : % des inscrits, avec les nouveaux votants venus de l'abstention du 1er
 * tour. Le résultat les comptait déjà (abandon net) : seul l'affichage change. Le choix d'affichage reste
 * local : ce n'est pas un réglage de la simulation.
 */
export function VoteFlow({ result }: { result: SimulationResult }) {
  const [view, setView] = useState<View>('chart')
  const sr = result.secondRound
  const rates = newVoterRates(simulationData)
  const gross = grossFlows(sr, firstRoundParticipation(result.turnoutBalance, rates), rates)
  const flows = [...gross.flows].sort((x, y) => y.share - x.share)
  const transfers = flows.filter((f) => !f.isFinalistVoter)
  const allies = flows.filter((f) => f.isFinalistVoter)
  const a = cand(sr.a)
  const b = cand(sr.b)
  // Score d'un candidat en % des exprimés : celui de « Premier tour simulé » (arrondi comme lui) quand il y
  // est seul ; avant alliances, c'est la part de son électorat dans les exprimés du 1er tour.
  const scores = new Map(
    flows.map((f) => {
      const solo = result.entrants.find((e) => e.id === f.candidateId && e.members.length === 1)
      return [f.candidateId, solo ? shownScore(result, solo) : f.share / gross.scale] as const
    }),
  )

  return (
    <section aria-labelledby="flow-title">
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
        D’où viennent les voix de {a.shortName} et de {b.shortName} au 2nd tour, y compris celles des
        abstentionnistes du 1er tour.
      </p>

      {view === 'chart' ? (
        <figure className="mt-4">
          <figcaption className="mb-2 text-sm text-ink-3">
            Scores en % des exprimés, blancs et nuls en % des votants, abstention en % des inscrits ;
            l’épaisseur des rubans suit le nombre d’électeurs. À gauche, les électorats du 1er tour (avant
            alliances) ; à droite, les finalistes, ceux qui ne s’expriment pas et le vote non mesuré des blancs
            et nuls. Une alliance entre candidats éliminés ne change pas ces reports.
          </figcaption>
          <VoteFlowSankey sr={sr} gross={gross} flows={[...allies, ...transfers]} rates={rates} scores={scores} />
        </figure>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <Composition
              label={a.shortName}
              flows={flows}
              pick={(f) => f.toA}
              fromAbstention={gross.abstainers.toA}
              total={gross.totals.a}
              score={sr.pct.a}
            />
            <Composition
              label={b.shortName}
              flows={flows}
              pick={(f) => f.toB}
              fromAbstention={gross.abstainers.toB}
              total={gross.totals.b}
              score={sr.pct.b}
            />
          </div>
          <TransferTable
            flows={[...allies, ...transfers]}
            gross={gross}
            scores={scores}
            a={a.shortName}
            b={b.shortName}
            rates={rates}
          />
        </>
      )}
      <p className="mt-2 text-sm text-ink-3">
        Une partie des électeurs du 1er tour ne vote pas au 2nd, et des abstentionnistes du 1er tour prennent
        leur place : les taux de report affichés en tiennent compte.
        {flows.some((f) => f.like) &&
          ' Les électeurs d’un petit candidat se reportent comme les électorats indiqués (réglages).'}
      </p>
    </section>
  )
}

function TransferTable({
  flows,
  gross,
  scores,
  a,
  b,
  rates,
}: {
  flows: Flow[]
  gross: GrossFlows
  scores: Map<string, number>
  a: string
  b: string
  rates: Parameters<typeof abstentionNote>[0] & Pick<NewVoterRates, 'bnShare'>
}) {
  const { abstainers, blankNull } = gross
  const share = (v: number) => (abstainers.volume > 0 ? (v * 100) / abstainers.volume : 0)
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="mb-2 text-left text-ink-3">
          Électorats du 1er tour (avant alliances, en % des exprimés) et leurs reports au 2nd tour. Blancs et
          nuls : % des votants ; abstention : % des inscrits.
        </caption>
        <thead>
          <tr className="border-b border-rule text-left text-ink-3">
            <th className="py-1.5 pr-2 font-medium">Électeurs de</th>
            <th className="py-1.5 pr-2 text-right font-medium">Électorat</th>
            <th className="py-1.5 pr-2 text-right font-medium">{a}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{b}</th>
            <th className="py-1.5 text-right font-medium">Ne s’expriment pas</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => (
            <FlowRow key={f.candidateId} flow={f} score={scores.get(f.candidateId) ?? 0} />
          ))}
          <tr className="border-b border-rule/70">
            <td className="py-1.5 pr-2">
              <InfoTip content={abstentionNote(rates)}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  Abstention au 1er tour
                </span>
              </InfoTip>
              <span className="block text-xs text-ink-3">nouveaux votants, répartis comme l’ensemble des votants</span>
            </td>
            <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(abstainers.volume)} des inscrits</td>
            <td className="num py-1.5 pr-2 text-right">{num(share(abstainers.toA), 1)}&#8239;%</td>
            <td className="num py-1.5 pr-2 text-right">{num(share(abstainers.toB), 1)}&#8239;%</td>
            <td className="num py-1.5 text-right text-ink-2">{num(share(abstainers.nonExpressed), 1)}&#8239;%</td>
          </tr>
          <tr className="border-b border-rule/70">
            <td className="py-1.5 pr-2">
              <InfoTip content={unmeasuredNote(blankNull.volume)}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  Blancs et nuls au 1er tour
                </span>
              </InfoTip>
            </td>
            <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(rates.bnShare * 100)} des votants</td>
            <td colSpan={3} className="py-1.5 text-right text-ink-3">
              non mesuré
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function FlowRow({ flow, score }: { flow: Flow; score: number }) {
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
      <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(score)}</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toA), 0)}&#8239;%</td>
      <td className="num py-1.5 pr-2 text-right">{num(rate(flow.toB), 0)}&#8239;%</td>
      <td className="num py-1.5 text-right text-ink-2">{num(rate(flow.abstention), 0)}&#8239;%</td>
    </tr>
  )
}

/**
 * Composition des voix d'un finaliste. `total` : ses voix en % des inscrits (base des parts), dont
 * `fromAbstention` venues des abstentionnistes du 1er tour ; `score` : son résultat en % des exprimés, le
 * seul affiché, comme dans le graphique et le duel.
 */
function Composition({
  label,
  flows,
  pick,
  fromAbstention,
  total,
  score,
}: {
  label: string
  flows: Flow[]
  pick: (f: Flow) => number
  fromAbstention: number
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
              content={`${c.shortName} : ${pct(pick(f))} des inscrits (${pct((pick(f) * 100) / total)} des voix de ${label})`}
            >
              <span
                style={{ ...colorVars(c), flexGrow: pick(f), flexBasis: 0 }}
                className="cand-fill h-full min-w-[2px] first:rounded-l-[3px]"
              />
            </InfoTip>
          )
        })}
        {fromAbstention > 0.05 && (
          <InfoTip
            content={`Abstentionnistes du 1er tour : ${pct(fromAbstention)} des inscrits (${pct((fromAbstention * 100) / total)} des voix de ${label})`}
          >
            <span
              style={{ flexGrow: fromAbstention, flexBasis: 0 }}
              className="h-full min-w-[2px] rounded-r-[3px] bg-ink-3/60"
            />
          </InfoTip>
        )}
      </div>
      <span className="num text-right text-sm text-ink-2">{pct(score)}</span>
    </div>
  )
}
