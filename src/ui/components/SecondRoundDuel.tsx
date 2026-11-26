import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { legislativeDuelPolls2024, simulationData } from '../../data/schema'
import {
  betweenRoundsSummaries,
  directPollGapAlert,
  directPollRmse,
  implicitNoIntention,
  matchingLegislativeDuelPolls,
  noIntentionRange,
  secondRoundDropout,
} from '../../domain/secondRound'
import { computeSensitivity } from '../../domain/sensitivity'
import type { Entrant, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars, entrantLabel, profileLabel } from '../candidates'
import { date, fieldwork, integer, noIntentionLabel, num, pct, pts, range, shownScore } from '../format'
import { Link } from '../Link'
import { AnimatedNumber } from './AnimatedNumber'

const spring = { type: 'spring', stiffness: 120, damping: 22 } as const
const MAX_DIRECT_POLLS = 4
const pct1 = (v: number) => pct(v)
const NO_INTENTION = noIntentionRange(simulationData.polls.secondRoundPolls)
const POLL_RMSE = directPollRmse(simulationData.secondRoundPollBias, simulationData.polls)?.rmse
const BETWEEN_ROUNDS = betweenRoundsSummaries(simulationData.secondRoundPollBias)

export function SecondRoundDuel({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const dispMc = result.monteCarlo.displayedDuel
  const byId = new Map(result.entrants.map((e) => [e.id, e]))
  const a = byId.get(sr.a)!
  const b = byId.get(sr.b)!
  const leaderA = sr.pct.a >= sr.pct.b
  const rankA = result.entrants.findIndex((e) => e.id === sr.a) + 1
  const rankB = result.entrants.findIndex((e) => e.id === sr.b) + 1
  const isTop2 = rankA <= 2 && rankB <= 2

  return (
    <section aria-labelledby="second-round-title">
      <h2 id="second-round-title" className="text-2xl font-bold tracking-tight">
        {result.projection.enabled ? 'Second tour projeté (mai 2027)' : 'Second tour simulé'}
      </h2>
      <p className="mt-1 text-ink-2">
        {isTop2
          ? `Les deux premiers du 1er tour ${result.projection.enabled ? 'projeté' : 'pondéré'} : ${entrantLabel(a)} (${pct(shownScore(result, a))}) et ${entrantLabel(b)} (${pct(shownScore(result, b))}).`
          : `Duel sélectionné : ${entrantLabel(a)} (${pct(shownScore(result, a))}, ${rankA}e) contre ${entrantLabel(b)} (${pct(shownScore(result, b))}, ${rankB}e).`}
      </p>

      <div className="min-w-0 max-w-auto lg:mt-5">
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:mt-0">
          <Ballot
            entrant={a}
            value={sr.pct.a}
            p10={dispMc.aScoreP10}
            p90={dispMc.aScoreP90}
            winProb={dispMc.aWinProb}
            ahead={leaderA}
          />
          <Ballot
            entrant={b}
            value={sr.pct.b}
            p10={100 - dispMc.aScoreP90}
            p90={100 - dispMc.aScoreP10}
            winProb={100 - dispMc.aWinProb}
            ahead={!leaderA}
          />
        </div>

        <SplitBar a={a} b={b} pctA={sr.pct.a} p10A={dispMc.aScoreP10} p90A={dispMc.aScoreP90} />

        <p className="mt-3 text-sm text-ink-3">
          Score central en % des suffrages exprimés (moteur en flux bruts : participation T1{' '}
          {pct(sr.participation, 1)}, exprimés T2 {pct(sr.expressed2, 1)} des inscrits, soit un abandon net
          équivalent de {pct(sr.netDropout, 1)} ; nouveaux votants {pct(sr.newVoters, 1)} des inscrits).
          Fidélité appliquée : {cand(sr.a).shortName} {pct(sr.fidelity.a.loyal, 0)}, {cand(sr.b).shortName}{' '}
          {pct(sr.fidelity.b.loyal, 0)}. Détail dans les{' '}
          <Link to="simulateur" hash="flow-title" className="link">
            reports
          </Link>
          .
        </p>
        <MethodLine result={result} />
        <PollBiasLine result={result} />
        <BetweenRoundsTable />
        <LegislativeDuelTable aId={sr.a} bId={sr.b} />
        <SensitivityTable result={result} />
      </div>
    </section>
  )
}

function GapAlert({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const alert = directPollGapAlert(sr.pct.a, sr.directPolls, sr.a, POLL_RMSE)
  if (!alert) return null
  const names = `${cand(sr.a).shortName}`
  const withBase = sr.directPolls.find((p) => p.noIntention)
  const implicit = withBase
    ? implicitNoIntention(sr.pct.a, withBase.scores[sr.a] ?? NaN, withBase.noIntention, sr.expressed2)
    : undefined
  return (
    <div className="mt-2 space-y-1 text-sm text-ink-3">
      {alert.exceeded && (
        <p role="note" className="font-medium text-hypo">
          Écart notable avec les sondages directs : le modèle donne {names} à {pct(sr.pct.a)} contre{' '}
          {pct(alert.pollMean)} en moyenne dans les sondages publiés ({pts(alert.gap)}), au-delà de 2 × RMSE
          historique ({num(alert.threshold, 1)} pts).
        </p>
      )}
      {!alert.exceeded && (
        <p>
          Écart au sondage moyen : {pts(alert.gap)} (seuil d’alerte : 2 × RMSE historique ={' '}
          {num(alert.threshold, 1)} pts).
        </p>
      )}
      {implicit && (
        <p>
          {implicit.kind === 'ok'
            ? `Pour coïncider avec ces sondages, le modèle suppose que ${pct(implicit.share, 0)} des votants sans intention déclarée choisissent ${names}.`
            : `Le comportement des sans-intention n’est pas calculable pour ce sondage (${implicit.reason === 'no-room' ? 'aucun électeur supplémentaire ne s’exprime au-delà des intentions déclarées' : `valeur impossible : ${num(implicit.share ?? 0, 0)} %`}).`}
        </p>
      )}
    </div>
  )
}

function PollBiasLine({ result }: { result: SimulationResult }) {
  const gaps = result.secondRoundPollBias
  if (gaps.length === 0) return null
  const one = (g: (typeof gaps)[number]) =>
    g.nearest
      ? `en ${g.year}, sondage le plus proche (${g.nearest.institute}, ${date(g.nearest.end)}) à ${pct(g.estimate, 0)} pour ${pct(g.result)} au résultat (${pts(g.gap)})`
      : `${pct(g.estimate)} en moyenne en ${g.year} (${g.pollCount} sondage${g.pollCount > 1 ? 's' : ''}) pour ${pct(g.result, 2)} au résultat (${pts(g.gap)})`
  return (
    <p className="mt-2 text-sm text-ink-3">
      À la même distance du scrutin, les sondages de 2nd tour sous-estimaient le candidat opposé au RN :{' '}
      {gaps.map((g, i) => `${i > 0 ? ' ; ' : `${g.duel.split(' – ')[0]} `}${one(g)}`).join('')}. Mesuré sur
      des duels {gaps[0]!.duel} ; non appliqué au calcul.
    </p>
  )
}

function BetweenRoundsTable() {
  if (BETWEEN_ROUNDS.length === 0) return null
  return (
    <div className="mt-4 rounded-lg border border-rule px-3.5 py-3 text-sm text-ink-2">
      <h3 className="font-medium text-ink">Entre-deux-tours (pour mémoire, non utilisé dans le calcul)</h3>
      <p className="mt-1 text-xs text-ink-3">
        Sondages publiés entre le soir du 1er tour et le dernier jour avant l’interdiction légale en 2017 et
        2022 (Macron – Le Pen), comparés au résultat officiel. Écart = résultat − sondages (points sur le score
        de Macron). 2002 exclu.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-3">
              <th className="py-1.5 pr-3 font-medium">Scrutin</th>
              <th className="py-1.5 pr-3 font-medium">Sondages</th>
              <th className="py-1.5 pr-3 text-right font-medium">Moy. entre-deux-tours</th>
              <th className="py-1.5 pr-3 text-right font-medium">Derniers sondages</th>
              <th className="py-1.5 pr-3 text-right font-medium">Résultat réel</th>
              <th className="py-1.5 text-right font-medium">Écart (derniers / moy.)</th>
            </tr>
          </thead>
          <tbody>
            {BETWEEN_ROUNDS.map((s) => (
              <tr key={s.year} className="border-b border-rule/60 align-top">
                <td className="py-1.5 pr-3 font-medium text-ink">
                  {s.year} ({s.duel})
                </td>
                <td className="num py-1.5 pr-3">
                  {s.pollCount} ({date(s.electionDate)} – {date(s.lastDayDate)})
                </td>
                <td className="num py-1.5 pr-3 text-right">{pct(s.meanAntiRn)}</td>
                <td className="num py-1.5 pr-3 text-right">
                  {pct(s.lastDayMeanAntiRn)} ({s.lastDayCount} au {date(s.lastDayDate)})
                </td>
                <td className="num py-1.5 pr-3 text-right font-medium text-ink">
                  <a href={s.result.source.url} target="_blank" rel="noreferrer" className="link">
                    {pct(s.result.antiRn, 2)}
                  </a>
                </td>
                <td className="num py-1.5 text-right">
                  {pts(s.lastDayGap)} / {pts(s.meanGap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer font-medium text-ink-2">
          Détail des sondages d’entre-deux-tours (
          {BETWEEN_ROUNDS.reduce((t, s) => t + s.pollCount, 0)} sondages sourcés)
        </summary>
        <div className="mt-2 space-y-3">
          {BETWEEN_ROUNDS.map((s) => (
            <div key={s.year} className="overflow-x-auto">
              <p className="font-medium text-ink">
                {s.year} — {s.duel} (2nd tour du {date(s.secondRoundDate)} :{' '}
                {pct(s.result.antiRn, 2)} / {pct(s.result.rn, 2)} ·{' '}
                <a href={s.listSource.url} target="_blank" rel="noreferrer" className="link">
                  liste source
                </a>
                )
              </p>
              <table className="mt-1 w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-rule text-ink-3">
                    <th className="py-1 pr-3 font-medium">Fin de terrain</th>
                    <th className="py-1 pr-3 font-medium">Institut</th>
                    <th className="py-1 pr-3 text-right font-medium">Macron</th>
                    <th className="py-1 pr-3 text-right font-medium">Le Pen</th>
                    <th className="py-1 text-right font-medium">Écart Macron</th>
                  </tr>
                </thead>
                <tbody>
                  {s.polls.map((p, idx) => (
                    <tr key={`${s.year}-${p.end}-${p.institute}-${idx}`} className="border-b border-rule/40">
                      <td className="num py-1 pr-3">{date(p.end)}</td>
                      <td className="py-1 pr-3">
                        <a href={p.url} target="_blank" rel="noreferrer" className="link">
                          {p.institute}
                        </a>
                      </td>
                      <td className="num py-1 pr-3 text-right">{pct(p.antiRn)}</td>
                      <td className="num py-1 pr-3 text-right">{pct(p.rn)}</td>
                      <td className="num py-1 text-right">{pts(s.result.antiRn - p.antiRn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function LegislativeDuelTable({ aId, bId }: { aId: string; bId: string }) {
  const matches = useMemo(() => matchingLegislativeDuelPolls(legislativeDuelPolls2024, aId, bId), [aId, bId])
  if (matches.length === 0) return null
  const partyA = legislativeDuelPolls2024.candidateParties[aId]!
  const partyB = legislativeDuelPolls2024.candidateParties[bId]!
  return (
    <div className="mt-4 rounded-lg border border-rule px-3.5 py-3 text-sm text-ink-2">
      <h3 className="font-medium text-ink">Législatives 2024, même duel de partis</h3>
      <p className="mt-1 text-xs text-ink-3">
        Sondages de circonscription publiés entre les deux tours (duels uniquement, triangulaires exclues) pour
        la paire exacte de partis <strong className="text-ink">{partyA} – {partyB}</strong>. Petits échantillons
        locaux affichés à titre d’illustration uniquement, jamais agrégés ni utilisés dans le calcul.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-3">
              <th className="py-1.5 pr-3 font-medium">Circonscription</th>
              <th className="py-1.5 pr-3 font-medium">Sondage</th>
              <th className="py-1.5 pr-3 text-right font-medium">Effectif</th>
              <th className="py-1.5 pr-3 text-right font-medium">
                Sondage ({partyA} / {partyB})
              </th>
              <th className="py-1.5 pr-3 text-right font-medium">
                Résultat ({partyA} / {partyB})
              </th>
              <th className="py-1.5 text-right font-medium">Écart {partyA}</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(({ poll, candidateA, candidateB, gapA }) => (
              <tr key={poll.id} className="border-b border-rule/60 align-top">
                <td className="py-1.5 pr-3">
                  <div className="font-medium text-ink">{poll.constituencyLabel}</div>
                  <div className="text-[0.7rem] text-ink-3">
                    <a href={candidateA.partySource.url} target="_blank" rel="noreferrer" className="link">
                      {candidateA.name} ({candidateA.party})
                    </a>{' '}
                    c.{' '}
                    <a href={candidateB.partySource.url} target="_blank" rel="noreferrer" className="link">
                      {candidateB.name} ({candidateB.party})
                    </a>
                  </div>
                </td>
                <td className="py-1.5 pr-3">
                  <a href={poll.url} target="_blank" rel="noreferrer" className="link">
                    {poll.institute} ({fieldwork(poll.fieldwork)})
                  </a>
                </td>
                <td className="num py-1.5 pr-3 text-right" title={poll.sampleNote}>
                  {integer(poll.sampleSize)}
                </td>
                <td className="num py-1.5 pr-3 text-right">
                  {pct(candidateA.pollScore, 0)} / {pct(candidateB.pollScore, 0)}
                </td>
                <td className="num py-1.5 pr-3 text-right font-medium text-ink">
                  <a href={poll.officialResultSource.url} target="_blank" rel="noreferrer" className="link">
                    {pct(candidateA.officialScore, 2)} / {pct(candidateB.officialScore, 2)}
                  </a>
                </td>
                <td className="num py-1.5 text-right">{pts(gapA, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Ballot({
  entrant,
  value,
  p10,
  p90,
  winProb,
  ahead,
}: {
  entrant: Entrant
  value: number
  p10: number
  p90: number
  winProb: number
  ahead: boolean
}) {
  const leader = cand(entrant.id)
  const [first, ...rest] = leader.name.split(' ')
  return (
    <motion.article
      layout
      transition={spring}
      className={`relative flex flex-col overflow-hidden rounded-md bg-surface px-3 pb-4 pt-5 text-center shadow-(--ballot-shadow) sm:px-5 ${
        ahead ? 'ring-2 ring-ballpoint' : ''
      }`}
      aria-label={`${leader.name} : ${pct(value)}`}
    >
      <div className="min-h-17">
        <p className="text-[0.95rem] leading-tight text-ink-2 sm:text-base">{first}</p>
        <p className="wide text-lg font-extrabold uppercase leading-tight tracking-wide sm:text-xl">
          {rest.join(' ')}
        </p>
        <p className="mt-1 text-sm text-ink-3">{leader.party}</p>
      </div>
      <div style={colorVars(leader)} className="cand-fill mx-auto my-3 h-1 w-12 rounded-full" />
      <AnimatedNumber value={value} format={pct1} className="figure block text-[3rem] sm:text-[4rem]" />
      <p className="num mt-1 text-xs text-ink-3">
        IC 80 % : {pct(p10)} – {pct(p90)}
      </p>
      <p className={`num mt-1.5 text-sm font-medium ${winProb >= 50 ? 'text-ballpoint' : 'text-ink-2'}`}>
        Victoire : {pct(winProb, 0)}
      </p>
    </motion.article>
  )
}

function SplitBar({
  a,
  b,
  pctA,
  p10A,
  p90A,
}: {
  a: Entrant
  b: Entrant
  pctA: number
  p10A: number
  p90A: number
}) {
  return (
    <div className="mt-5" aria-hidden>
      <div className="relative flex h-3.5 gap-0.5">
        <motion.div
          style={colorVars(cand(a.id))}
          className="cand-fill h-full rounded-l-sm"
          animate={{ width: `${pctA}%` }}
          transition={spring}
        />
        <div style={colorVars(cand(b.id))} className="cand-fill h-full flex-1 rounded-r-sm" />
        {/* Bandeau d'incertitude 80 % sur la ligne de partage */}
        <motion.div
          className="pointer-events-none absolute -bottom-1 -top-1 rounded border border-ink/40 bg-surface/40"
          animate={{ left: `${p10A}%`, width: `${Math.max(1, p90A - p10A)}%` }}
          transition={spring}
        />
        <div className="absolute -bottom-1.5 -top-1.5 left-1/2 w-0.5 -translate-x-1/2 bg-ink" />
      </div>
      <p className="mt-2 text-center text-xs text-ink-3">
        50&#8239;% : majorité absolue · cadre : intervalle à 80 %
      </p>
    </div>
  )
}

function MethodLine({ result }: { result: SimulationResult }) {
  const { duel, directPolls, a, b, republicanFrontStrength, lfiLeftSensitivity } = result.secondRound
  const settings = useSettings()
  const shown = directPolls.slice(0, MAX_DIRECT_POLLS)
  const profileId = duel.profileWeights[0]?.profileId
  const rnCand = duel.rnId ? cand(duel.rnId) : null

  return (
    <div className="mt-6 space-y-4 border-t border-rule pt-4 lg:mt-0 lg:border-t-0 lg:pt-0">
      {duel.kind === 'rn-sourced' && profileId ? (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Reports utilisés : </span>
          {settings.transferSource === 'declared2027'
            ? `déclarations 2027 corrigées en logit (profil « ${profileLabel(profileId)} »).`
            : settings.transferSource === 'blend'
              ? `mélange ${pct((1 - settings.declaredWeight) * 100, 0)} base historique 2022 ↔ 2024 (position ${pct((republicanFrontStrength ?? 0) * 100, 0)}) / ${pct(settings.declaredWeight * 100, 0)} déclarations 2027 corrigées (« ${profileLabel(profileId)} »).`
              : `base historique 2022 ↔ 2024 (« ${profileLabel(profileId)} », curseur à ${pct((republicanFrontStrength ?? 0) * 100, 0)} : 0 % = Prés. 2022, 100 % = Lég. 2024).`}{' '}
          <Link to="methodologie" hash="reports" className="link">
            Détail des reports
          </Link>
        </p>
      ) : duel.kind === 'non-rn-presidential' ? (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Reports utilisés (duel hors RN) : </span>
          enquêtes « jour du vote » des seconds tours présidentiels 2007 (Sarkozy – Royal) et 2012 (Hollande –
          Sarkozy).{' '}
          <Link to="methodologie" hash="reports" className="link">
            Détail des reports
          </Link>
        </p>
      ) : (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-hypo">Duel de même camp : </span>
          aucune mesure historique directe ne couvre ce duel ; le calcul repose sur une matrice de repli
          symétrique.
        </p>
      )}

      {lfiLeftSensitivity && rnCand && (
        <div className="rounded-lg border border-rule bg-paper/70 px-3.5 py-2.5 text-xs text-ink-2">
          <p className="font-semibold text-ink">
            Sensibilité au report gauche hors LFI → Mélenchon (non mesuré en présidentielle)
          </p>
          <p className="mt-1">
            Entre <strong className="num">{lfiLeftSensitivity.lowRate}&#8239;%</strong> (proche des
            déclarations 2027 corrigées) et{' '}
            <strong className="num">{lfiLeftSensitivity.highRate}&#8239;%</strong> (repère NFP 2024),{' '}
            {rnCand.shortName} varie de{' '}
            <strong className="num">
              {pct(Math.min(lfiLeftSensitivity.rnAtLow, lfiLeftSensitivity.rnAtHigh))}
            </strong>{' '}
            à{' '}
            <strong className="num">
              {pct(Math.max(lfiLeftSensitivity.rnAtLow, lfiLeftSensitivity.rnAtHigh))}
            </strong>{' '}
            (écart de{' '}
            <span className="num font-medium">
              {num(Math.abs(lfiLeftSensitivity.rnAtLow - lfiLeftSensitivity.rnAtHigh), 1)} pts
            </span>
            , valeur centrale active : <span className="num">{lfiLeftSensitivity.currentRate}&#8239;%</span>).
            Cette plage est couverte dans Monte-Carlo autour du niveau actif du curseur gauche.
          </p>
        </div>
      )}

      {directPolls.length > 0 && (
        <div>
          <p className="text-sm font-medium text-ink">Repère : sondages de 2nd tour publiés pour ce duel</p>
          <ul className="mt-2 space-y-2">
            {shown.map((p) => (
              <li
                key={`${p.institute}-${p.fieldwork.end}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm"
              >
                <span className="text-ink-2">
                  {p.institute} ({fieldwork(p.fieldwork)})
                </span>
                <span className="num font-medium">
                  {cand(a).shortName} {pct(p.scores[a] ?? 0, 0)} – {cand(b).shortName}{' '}
                  {pct(p.scores[b] ?? 0, 0)}
                </span>
                {p.noIntention && (
                  <span className="col-span-2 text-xs text-ink-3">
                    Sans intention de vote :{' '}
                    <a href={p.noIntention.source.url} className="link" target="_blank" rel="noreferrer">
                      {noIntentionLabel(p.noIntention)}
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <GapAlert result={result} />
          {directPolls.length > MAX_DIRECT_POLLS && (
            <p className="mt-1 text-xs text-ink-3">
              Les {MAX_DIRECT_POLLS} plus récents sur {directPolls.length} sondages publiés pour ce duel.
            </p>
          )}
          <p className="mt-2 text-sm text-ink-3">
            Ces sondages directs ne servent jamais à recalibrer le modèle : la part élevée de personnes sans
            intention de vote ({NO_INTENTION ? range(NO_INTENTION.min, NO_INTENTION.max) : 'élevée'}) est
            écartée des pourcentages publiés. Au 2nd tour réel,{' '}
            {pct(secondRoundDropout(simulationData.reference2022), 2)} des exprimés du 1er tour en 2022 et{' '}
            {pct(secondRoundDropout(simulationData.reference2017), 2)} en 2017 ne se sont pas exprimés.
          </p>
        </div>
      )}
    </div>
  )
}

function SensitivityTable({ result }: { result: SimulationResult }) {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => (open ? computeSensitivity(simulationData, settings) : []), [open, settings])
  return (
    <details
      className="mt-4 rounded-lg border border-rule px-3.5 py-2.5 text-sm text-ink-2"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer font-medium text-ink">Sensibilité aux réglages non mesurés</summary>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <p className="text-xs text-ink-3">
            Score central déterministe de {cand(result.secondRound.a).shortName} au 2nd tour (% des exprimés), un seul réglage modifié à la fois, valeurs alternatives déjà documentées. Aucun Monte-Carlo.
          </p>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-ink-3">
                <th className="py-1 pr-3 font-medium">Réglage</th>
                <th className="py-1 pr-3 font-medium">Actif</th>
                <th className="py-1 font-medium">Alternatives</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-rule align-top">
                  <td className="py-1.5 pr-3">{r.label}</td>
                  <td className="num py-1.5 pr-3">{r.active}</td>
                  <td className="py-1.5">
                    {r.inactive && r.variants.length === 0
                      ? r.inactive
                      : r.variants.length === 0
                        ? 'aucune'
                        : r.variants.map((v) => (
                            <span key={v.label} className="num mr-3 inline-block">
                              {v.label} : {pct(v.scoreA)} ({pts(v.delta)})
                            </span>
                          ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
