import { useState } from 'react'
import type { SimulationResult, VoteFlow as Flow } from '../../domain/types'
import { newVoterReferenceRates } from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars, transferLabel } from '../candidates'
import { num, pct, shownScore } from '../format'
import { abstentionNote, unmeasuredNote } from '../newVotersText'
import { Segmented } from './controls'
import { InfoTip } from './InfoTip'
import { VoteFlowSankey } from './VoteFlowSankey'

type View = 'table' | 'chart'

/**
 * Composition des voix de chaque finaliste et taux de report de chaque électorat, en tableau ou en
 * diagramme de Sankey, directement issus du moteur unifié en flux bruts (% des inscrits).
 */
export function VoteFlow({ result }: { result: SimulationResult }) {
  const [view, setView] = useState<View>('chart')
  const sr = result.secondRound
  const settings = useSettings()
  const rates = newVoterReferenceRates
  const flows = [...sr.flows].sort((x, y) => y.share - x.share)
  const transfers = flows.filter((f) => !f.isFinalistVoter)
  const allies = flows.filter((f) => f.isFinalistVoter)
  const a = cand(sr.a)
  const b = cand(sr.b)

  const scores = new Map(
    flows.map((f) => {
      const entrant = result.entrants.find((e) => e.id === f.candidateId)
      return [f.candidateId, entrant ? shownScore(result, entrant) : f.firstRoundPct] as const
    }),
  )

  return (
    <section
      aria-labelledby="flow-title"
      className="rounded-xl bg-surface p-5 shadow-(--ballot-shadow) sm:p-6"
    >
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
        D’où viennent les voix de {a.shortName} et de {b.shortName} au 2nd tour, en flux bruts (% des
        inscrits), y compris les non-exprimés du 1er tour qui votent au 2nd.
      </p>

      {view === 'chart' ? (
        <figure className="mt-4">
          <figcaption className="mb-2 text-sm text-ink-3">
            Scores en % des exprimés, blancs et nuls en % des votants, abstention en % des inscrits ;
            l’épaisseur des rubans suit le nombre d’électeurs. À gauche, les électorats du 1er tour ; à
            droite, les finalistes et ceux qui ne s’expriment pas.
          </figcaption>
          <VoteFlowSankey
            sr={sr}
            flows={[...allies, ...transfers]}
            rates={rates}
            scores={scores}
            mobilization={settings.abstainerMobilization}
            antiRnShare={sr.duel.kind === 'rn-sourced' ? sr.effectiveAbstainerAntiRnShare : undefined}
            endogenous={settings.abstainerAntiRnShare === null}
          />
        </figure>
      ) : (
        <>
          <ul aria-label="Composition des voix des finalistes" className="mt-4 space-y-3">
            <Composition
              label={a.shortName}
              flows={flows}
              pick={(f) => f.toA}
              fromAbstention={sr.abstainers.toA + sr.blankNull.toA}
              total={sr.totals.a}
              score={sr.pct.a}
            />
            <Composition
              label={b.shortName}
              flows={flows}
              pick={(f) => f.toB}
              fromAbstention={sr.abstainers.toB + sr.blankNull.toB}
              total={sr.totals.b}
              score={sr.pct.b}
            />
          </ul>
          <TransferTable
            sr={sr}
            flows={[...allies, ...transfers]}
            scores={scores}
            a={a.shortName}
            b={b.shortName}
            mobilization={settings.abstainerMobilization}
            antiRnShare={sr.duel.kind === 'rn-sourced' ? sr.effectiveAbstainerAntiRnShare : undefined}
            endogenous={settings.abstainerAntiRnShare === null}
          />
        </>
      )}
      <p className="mt-2 text-sm text-ink-3">
        Les taux affichés sont directement ceux du calcul (aucun recalibrage post-hoc par camp).
        {sr.republicanFrontStrength !== null && settings.transferSource !== 'declared2027' && (
          <>
            {' '}
            Curseur front républicain (0 % = Prés. 2022, 100 % = Lég. 2024) :{' '}
            <strong className="num font-medium text-ink-2">{pct(sr.republicanFrontStrength * 100, 0)}</strong>
            .
          </>
        )}
        {flows.some((f) => f.like) &&
          ' Les électeurs d’un petit candidat se reportent comme les électorats indiqués (réglages).'}
      </p>
    </section>
  )
}

function TransferTable({
  sr,
  flows,
  scores,
  a,
  b,
  mobilization,
  antiRnShare,
  endogenous,
}: {
  sr: SimulationResult['secondRound']
  flows: Flow[]
  scores: Map<string, number>
  a: string
  b: string
  mobilization: number
  antiRnShare: number | undefined
  endogenous: boolean
}) {
  const { abstainers, blankNull } = sr
  const rates = newVoterReferenceRates
  const shareOf = (v: number, volume: number) => (volume > 0 ? (v * 100) / volume : 0)
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="mb-2 text-left text-ink-3">
          Électorats du 1er tour (% des exprimés) et leurs reports directs au 2nd tour. Blancs et nuls : % des
          votants ; abstention : % des inscrits.
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
              <InfoTip content={abstentionNote(rates, mobilization, antiRnShare, endogenous)}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  Abstention au 1er tour
                </span>
              </InfoTip>
              <span className="block text-xs text-ink-3">
                {pct(mobilization * 100, 1)} votent au 2nd tour
              </span>
            </td>
            <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(abstainers.volume)} des inscrits</td>
            <td className="num py-1.5 pr-2 text-right">{num(shareOf(abstainers.toA, abstainers.volume), 1)}&#8239;%</td>
            <td className="num py-1.5 pr-2 text-right">{num(shareOf(abstainers.toB, abstainers.volume), 1)}&#8239;%</td>
            <td className="num py-1.5 text-right text-ink-2">
              {num(shareOf(abstainers.nonExpressed, abstainers.volume), 1)}&#8239;%
            </td>
          </tr>
          <tr className="border-b border-rule/70">
            <td className="py-1.5 pr-2">
              <InfoTip content={unmeasuredNote(blankNull.volume)}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  Blancs et nuls au 1er tour
                </span>
              </InfoTip>
              <span className="block text-xs text-ink-3">non mesuré séparément (même taux que l’abstention)</span>
            </td>
            <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(rates.bnShare * 100)} des votants</td>
            <td className="num py-1.5 pr-2 text-right">{num(shareOf(blankNull.toA, blankNull.volume), 1)}&#8239;%</td>
            <td className="num py-1.5 pr-2 text-right">{num(shareOf(blankNull.toB, blankNull.volume), 1)}&#8239;%</td>
            <td className="num py-1.5 text-right text-ink-2">
              {num(shareOf(blankNull.nonExpressed, blankNull.volume), 1)}&#8239;%
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
    <li className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3">
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
    </li>
  )
}
