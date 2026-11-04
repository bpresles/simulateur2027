import { motion } from 'motion/react'
import { useSettings } from '../../state/settingsStore'
import { simulationData } from '../../data/schema'
import { noIntentionRange, secondRoundDropout } from '../../domain/secondRound'
import type { Entrant, SimulationResult } from '../../domain/types'
import { cand, colorVars, entrantLabel, profileLabel } from '../candidates'
import { fieldwork, noIntentionLabel, pct, range, shownScore } from '../format'
import { dropoutBasis } from '../dropout'
import { Link } from '../Link'
import { AnimatedNumber } from './AnimatedNumber'

const spring = { type: 'spring', stiffness: 120, damping: 22 } as const
/** Repères affichés : les plus récents. */
const MAX_DIRECT_POLLS = 4
const pct1 = (v: number) => pct(v)
const NO_INTENTION = noIntentionRange(simulationData.polls.secondRoundPolls)

export function SecondRoundDuel({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const byId = new Map(result.entrants.map((e) => [e.id, e]))
  const a = byId.get(sr.a)!
  const b = byId.get(sr.b)!
  const leaderA = sr.pct.a >= sr.pct.b
  const abstentionShare = sr.votes.abstention
  const settings = useSettings()

  return (
    <section aria-labelledby="second-round-title">
      <h2 id="second-round-title" className="text-2xl font-bold tracking-tight">
        Second tour simulé
      </h2>
      <p className="mt-1 text-ink-2">
        {result.qualification.picked === 'third'
          ? `Qualification serrée, hypothèse retenue : ${entrantLabel(a)} (${pct(shownScore(result, a))}, 1re position) et ${entrantLabel(b)} (${pct(shownScore(result, b))}, 3e position) au 1er tour simulé.`
          : `Les deux premiers du 1er tour simulé : ${entrantLabel(a)} (${pct(shownScore(result, a))}) et ${entrantLabel(b)} (${pct(shownScore(result, b))}).`}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5">
        <Ballot entrant={a} value={sr.pct.a} ahead={leaderA} />
        <Ballot entrant={b} value={sr.pct.b} ahead={!leaderA} />
      </div>

      <SplitBar a={a} b={b} pctA={sr.pct.a} />

      <p className="mt-3 text-sm text-ink-3">
        En % des suffrages exprimés. Blancs, nuls et abstention : {pct(abstentionShare)} des électeurs du 1er
        tour,{' '}
        {abstentionBasis(sr, settings.abstentionTarget !== null)}
      </p>
      <SensitivityLine result={result} />

      <MethodLine result={result} />
    </section>
  )
}

/** Signale les abandons (2017, 2022) qui changeraient le vainqueur : seuls ceux-là sont cités. */
/** Origine et répartition de l'abandon : « abandon estimé pour ce duel : 2,0 % des électeurs des camps… ». */
function abstentionBasis(sr: SimulationResult['secondRound'], chosen: boolean): string {
  const { mode, camps, factor, total, target } = sr.abstention
  if (mode === 'none') return 'selon les taux bruts des législatives 2024.'
  if (mode === 'uniform') {
    return `${pct(target!, 2)} attendus : ${chosen ? 'niveau choisi dans les réglages' : `estimation pour ce duel (${dropoutBasis(sr.duel)})`}.`
  }
  const split = `${pct(camps!.rates.camp * factor)} des électeurs des camps des finalistes, ${pct(camps!.rates.others * factor)} des autres`
  return chosen
    ? `total choisi dans les réglages (${pct(total)}), réparti comme aux législatives 2024 : ${split}.`
    : `abandon estimé pour ce duel : ${split} (${dropoutBasis(sr.duel)}), soit ${pct(total)} au total.`
}

function SensitivityLine({ result }: { result: SimulationResult }) {
  const sens = result.secondRoundSensitivity
  if (!sens?.winnerChanges) return null
  const sr = result.secondRound
  const name = (r: { pct: { a: number; b: number } }) => cand(r.pct.a >= r.pct.b ? sr.a : sr.b).shortName
  const score = (r: { pct: { a: number; b: number } }) => pct(Math.max(r.pct.a, r.pct.b))
  const parts = [
    ...([2017, 2022] as const)
      .filter((year) => sens.variants[year].winnerChanges)
      .map((year) => {
        const v = sens.variants[year]
        return `avec l’abandon de ${year} (${pct(v.target, 2)}), ${name(v)} l’emporterait (${score(v)})`
      }),
    ...(sens.structural?.winnerChanges
      ? [
          `si les électeurs des autres candidats du bloc d’un finaliste (hors extrême droite) s’abstenaient autant que ceux des autres blocs, ${name(sens.structural)} l’emporterait (${score(sens.structural)})`,
        ]
      : []),
  ]
  return (
    <p className="mt-2 text-sm font-medium text-ink-2" role="status">
      2nd tour serré : {parts.join(' ; ')}.
    </p>
  )
}

function Ballot({ entrant, value, ahead }: { entrant: Entrant; value: number; ahead: boolean }) {
  const leader = cand(entrant.id)
  const allies = entrant.members.slice(1).map((m) => cand(m.candidateId))
  const [first, ...rest] = leader.name.split(' ')
  return (
    <motion.article
      layout
      transition={spring}
      className={`relative flex flex-col overflow-hidden rounded-[6px] bg-surface px-3 pb-4 pt-5 text-center shadow-[var(--ballot-shadow)] sm:px-5 ${
        ahead ? 'ring-2 ring-ballpoint' : ''
      }`}
      aria-label={`${leader.name} : ${pct(value)}`}
    >
      <div className="min-h-[4.5rem]">
        <p className="text-[0.95rem] leading-tight text-ink-2 sm:text-base">{first}</p>
        <p className="wide text-lg font-extrabold uppercase leading-tight tracking-wide sm:text-xl">
          {rest.join(' ')}
        </p>
        <p className="mt-1 text-sm text-ink-3">
          {leader.party}
          {allies.length > 0 && ` avec ${allies.map((c) => c.shortName).join(', ')}`}
        </p>
      </div>
      <div style={colorVars(leader)} className="cand-fill mx-auto my-4 h-1 w-12 rounded-full" />
      <AnimatedNumber value={value} format={pct1} className="figure block text-[3.25rem] sm:text-[4.5rem]" />
      <p className={`mt-2 text-sm font-medium ${ahead ? 'text-ballpoint' : 'text-transparent'}`} aria-hidden={!ahead}>
        En tête
      </p>
    </motion.article>
  )
}

function SplitBar({ a, b, pctA }: { a: Entrant; b: Entrant; pctA: number }) {
  return (
    <div className="mt-5" aria-hidden>
      <div className="relative flex h-3.5 gap-[2px]">
        <motion.div
          style={colorVars(cand(a.id))}
          className="cand-fill h-full rounded-l-[4px]"
          animate={{ width: `${pctA}%` }}
          transition={spring}
        />
        <div style={colorVars(cand(b.id))} className="cand-fill h-full flex-1 rounded-r-[4px]" />
        <div className="absolute -bottom-1 -top-1 left-1/2 w-0.5 -translate-x-1/2 bg-ink" />
      </div>
      <p className="mt-2 text-center text-xs text-ink-3">50&#8239;% : majorité absolue</p>
    </div>
  )
}

function MethodLine({ result }: { result: SimulationResult }) {
  const { duel, directPolls, a, b } = result.secondRound
  const withAlliance = result.entrants.some((e) => (e.id === a || e.id === b) && e.allianceIds.length > 0)
  const shown = directPolls.slice(0, MAX_DIRECT_POLLS)
  return (
    <div className="mt-6 space-y-4 border-t border-rule pt-4">
      {duel.kind === 'sourced' ? (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Reports utilisés : </span>
          {duel.profileWeights.length === 1
            ? `duels « ${profileLabel(duel.profileWeights[0]!.profileId)} » des législatives 2024.`
            : duel.profileWeights
                .map((w) => `${pct(w.weight * 100, 0)} « ${profileLabel(w.profileId)} »`)
                .join(', ') + ' (profil pondéré par la part de chaque membre de l’alliance).'}{' '}
          <Link to="methodologie" hash="reports" className="link">
            Détail des reports
          </Link>
        </p>
      ) : (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-hypo">Duel hors source : </span>
          aucune donnée des législatives 2024 ne couvre ce duel, le résultat repose sur un modèle d’affinités
          entre blocs (hypothèses).
        </p>
      )}

      {directPolls.length > 0 && (
        <div>
          <p className="text-sm font-medium text-ink">Repère : sondages de 2nd tour publiés pour ce duel</p>
          <ul className="mt-2 space-y-2">
            {shown.map((p) => (
              <li key={`${p.institute}-${p.fieldwork.end}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
                <span className="text-ink-2">
                  {p.institute} ({fieldwork(p.fieldwork)})
                </span>
                <span className="num font-medium">
                  {cand(a).shortName} {pct(p.scores[a] ?? 0, 0)} – {cand(b).shortName} {pct(p.scores[b] ?? 0, 0)}
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
          {directPolls.length > MAX_DIRECT_POLLS && (
            <p className="mt-1 text-xs text-ink-3">
              Les {MAX_DIRECT_POLLS} plus récents sur {directPolls.length} sondages publiés pour ce duel.
            </p>
          )}
          <p className="mt-2 text-sm text-ink-3">
            {withAlliance && 'Ces sondages testent les candidats sans l’alliance estimée. '}
            L’écart avec la simulation s’explique par la part élevée de personnes interrogées qui n’expriment
            aucun choix entre les deux candidats : elles sont écartées des pourcentages publiés, qui ne portent
            que sur les « votants décidés ».{' '}
            {NO_INTENTION &&
              `Selon les instituts et les duels, c’est ${range(NO_INTENTION.min, NO_INTENTION.max)} des inscrits interrogés, ou des seuls inscrits comptant voter selon l’institut (indécis, vote blanc ou nul et abstention compris). `}
            {shown.some((p) => p.noIntention?.calculation) &&
              '≈ : part non publiée telle quelle, calculée d’après la notice de l’institut. '}
            Au 2nd tour, {pct(secondRoundDropout(simulationData.reference2022), 2)} des électeurs qui s’étaient
            exprimés au 1er tour en 2022, et {pct(secondRoundDropout(simulationData.reference2017), 2)} en 2017, ne
            se sont pas exprimés (abstention, vote blanc ou nul).
          </p>
        </div>
      )}
    </div>
  )
}
