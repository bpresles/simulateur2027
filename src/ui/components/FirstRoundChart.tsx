import { motion } from 'motion/react'
import type {
  CandidateProjectionDelta,
  CandidateUncertainty,
  Entrant,
  ImputationDonors,
  SimulationResult,
} from '../../domain/types'
import { cand, colorVars } from '../candidates'
import { pct, pts, shownScore } from '../format'
import { InfoTip } from './InfoTip'

const spring = { type: 'spring', stiffness: 170, damping: 26 } as const

export function FirstRoundChart({ result }: { result: SimulationResult }) {
  const mc = result.monteCarlo.candidates
  const projEnabled = result.projection.enabled
  const rowsById = new Map(result.firstRound.map((r) => [r.candidateId, r]))
  const w = (v: number) => `${Math.min(100, Math.max(0, v))}%`
  const threshold = result.entrants[1]!.score
  const finalists = new Set([result.secondRound.a, result.secondRound.b])
  const single = result.institutesUsed === 1
  const baseLabel = single ? 'Sondage retenu' : 'Moyenne pondérée'

  return (
    <section aria-labelledby="first-round-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="first-round-title" className="text-2xl font-bold tracking-tight">
          {projEnabled ? 'Premier tour projeté (avril 2027)' : 'Premier tour simulé'}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3" aria-label="Légende">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-[3px] bg-ink-2" />{' '}
            {projEnabled ? 'score projeté' : single ? 'sondage retenu' : 'moyenne pondérée'}
          </li>
          {projEnabled && (
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-ink" /> aujourd’hui
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-[3px] bg-ink-3/25" /> intervalle 80 % (P10–P90)
          </li>
        </ul>
      </div>

      <div className="relative pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-6 left-0 right-0 hidden sm:block sm:left-[10.75rem] sm:right-[9.75rem]"
        >
          <motion.div
            className="absolute inset-y-0 w-px bg-ballpoint/60"
            animate={{ left: w(threshold) }}
            transition={spring}
          >
            <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs text-ballpoint">
              seuil du 2nd tour
            </span>
          </motion.div>
        </div>

        <div className="mb-1 hidden grid-cols-[10rem_1fr_4rem_4.25rem] gap-x-3 px-2 text-xs text-ink-3 sm:grid">
          <span>Candidat</span>
          <span className="num flex justify-between text-[0.7rem] text-ink-3/70">
            <span>0 %</span>
            <span>50 %</span>
            <span>100 %</span>
          </span>
          <span className="text-right">Score</span>
          <span className="text-right">Qualif.</span>
        </div>

        <ol className="space-y-1">
          {result.entrants.map((e, i) => (
            <motion.li key={e.id} layout transition={spring}>
              <CandidateRow
                entrant={e}
                currentScore={rowsById.get(e.id)?.currentScore ?? e.score}
                projEnabled={projEnabled}
                projDelta={result.projection.byCandidate[e.id]}
                uncertainty={mc[e.id]}
                qualified={finalists.has(e.id)}
                rank={i + 1}
                shown={shownScore(result, e)}
                width={w}
                donors={result.minorDonors}
                baseLabel={baseLabel}
              />
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CandidateRow({
  entrant,
  currentScore,
  projEnabled,
  projDelta,
  uncertainty,
  qualified,
  rank,
  shown,
  width,
  donors,
  baseLabel,
}: {
  entrant: Entrant
  currentScore: number
  projEnabled: boolean
  projDelta: CandidateProjectionDelta | undefined
  uncertainty: CandidateUncertainty | undefined
  donors: Record<string, ImputationDonors>
  baseLabel: string
  qualified: boolean
  rank: number
  shown: number
  width: (v: number) => string
}) {
  const info = cand(entrant.id)
  const p10 = uncertainty?.p10 ?? entrant.score
  const p90 = uncertainty?.p90 ?? entrant.score
  const qualifProb = uncertainty?.qualifProb ?? 0

  return (
    <InfoTip
      content={
        <RowDetails
          entrant={entrant}
          projEnabled={projEnabled}
          projDelta={projDelta}
          uncertainty={uncertainty}
          donors={donors}
          baseLabel={baseLabel}
        />
      }
    >
      <div
        tabIndex={0}
        aria-label={`${rank}e : ${info.shortName}, ${pct(shown)}`}
        className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 outline-offset-0 hover:bg-sunken/70 sm:grid-cols-[10rem_1fr_4rem_4.25rem] ${
          qualified ? 'bg-ballpoint-soft/60' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span style={colorVars(info)} className="cand-fill h-3 w-3 shrink-0 rounded-full" />
          <span className={`truncate ${qualified ? 'font-semibold' : 'font-medium'}`}>{info.shortName}</span>
        </div>

        <div className="relative order-3 col-span-2 h-[18px] overflow-hidden rounded-[4px] bg-sunken/70 sm:order-none sm:col-span-1">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-rule" />
          <motion.div
            className="absolute inset-y-0 rounded-[4px] bg-ink-3/25"
            animate={{ left: width(p10), width: width(Math.max(0.2, p90 - p10)) }}
            transition={spring}
          />
          <motion.div
            style={colorVars(info)}
            className="cand-fill absolute inset-y-[4px] left-0 rounded-r-[4px]"
            animate={{ width: width(entrant.score) }}
            transition={spring}
          />
          {projEnabled && (
            <motion.div
              className="pointer-events-none absolute inset-y-[1px] w-0.5 bg-ink"
              animate={{ left: width(currentScore) }}
              transition={spring}
            />
          )}
        </div>

        <span className="num text-right font-semibold">{pct(shown)}</span>
        <span className={`num hidden text-right text-sm sm:block ${qualifProb >= 5 ? 'text-ink-2' : 'text-ink-3'}`}>
          {qualifProb >= 0.5 ? pct(qualifProb, 0) : '< 1 %'}
        </span>
      </div>
    </InfoTip>
  )
}

function RowDetails({
  entrant,
  projEnabled,
  projDelta,
  uncertainty,
  donors,
  baseLabel,
}: {
  entrant: Entrant
  projEnabled: boolean
  projDelta: CandidateProjectionDelta | undefined
  uncertainty: CandidateUncertainty | undefined
  donors: Record<string, ImputationDonors>
  baseLabel: string
}) {
  const c = cand(entrant.id)
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
      <dt className="col-span-2 font-semibold">{c.name}</dt>
      <dt className="text-ink-3">{baseLabel}</dt>
      <dd className="num text-right">{pct(projDelta?.current ?? entrant.score)}</dd>
      {projEnabled && projDelta && (
        <>
          <dt className="text-ink-3">Vote utile</dt>
          <dd className="num text-right">{pts(projDelta.usefulVoteDelta)}</dd>
          {Math.abs(projDelta.reversionDelta) >= 0.05 && (
            <>
              <dt className="text-ink-3">Amortissement précoce</dt>
              <dd className="num text-right">{pts(projDelta.reversionDelta)}</dd>
            </>
          )}
          {Math.abs(projDelta.trendDelta) >= 0.05 && (
            <>
              <dt className="text-ink-3">Tendance amortie</dt>
              <dd className="num text-right">{pts(projDelta.trendDelta)}</dd>
            </>
          )}
          <dt className="font-medium text-ink">Score projeté avril 2027</dt>
          <dd className="num text-right font-medium">{pct(projDelta.projected)}</dd>
        </>
      )}
      {uncertainty && (
        <>
          <dt className="text-ink-3">Intervalle 80 % (P10–P90)</dt>
          <dd className="num text-right">
            {pct(uncertainty.p10)} – {pct(uncertainty.p90)}
          </dd>
          <dt className="text-ink-3">Probabilité de qualification</dt>
          <dd className="num text-right">{pct(uncertainty.qualifProb, 0)}</dd>
          <dt className="text-ink-3">Probabilité de victoire</dt>
          <dd className="num text-right">{pct(uncertainty.winProb, 0)}</dd>
        </>
      )}
      {c.minor && (
        <>
          <dt className="text-ink-3">Hypothèses sans {c.shortName}</dt>
          <dd className="text-right">score imputé</dd>
          {donors[c.id] && <DonorsNote donors={donors[c.id]!} />}
        </>
      )}
      {c.auto && (
        <dd className="col-span-2 max-w-[16rem] text-xs text-ink-3">
          Ajouté automatiquement par la synchronisation : bloc non classé, reports par défaut.
        </dd>
      )}
    </dl>
  )
}

function DonorsNote({ donors }: { donors: ImputationDonors }) {
  const shown = donors.parts.filter((p) => p.weight >= 0.005)
  const top = shown.slice(0, 3).map((p) => `${cand(p.id).shortName} ${pct(p.weight * 100, 0)}`)
  const institutes = [...new Set(donors.pairs.map((p) => p.institute))]
  return (
    <dd className="col-span-2 max-w-[16rem] text-xs text-ink-3">
      pris à {top.join(', ')}
      {shown.length > 3 ? '…' : ''}{' '}
      {institutes.length > 0
        ? `(paires exactes dans ${institutes.join(', ')})`
        : '(répartition par défaut : aucune paire exacte mono-candidat dans les sondages)'}
    </dd>
  )
}
