import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import type { AllianceLeak, Entrant, FirstRoundRow, SimulationResult } from '../../domain/types'
import { reference2022Stats } from '../../hooks/useSimulation'
import { simulationData } from '../../data/schema'
import { cand, colorVars } from '../candidates'
import { pct, pts, ratio } from '../format'
import { InfoTip } from './InfoTip'

const ref2022Names = new Map(simulationData.reference2022.candidates.map((c) => [c.id, c.name]))
const spring = { type: 'spring', stiffness: 170, damping: 26 } as const

export function FirstRoundChart({ result }: { result: SimulationResult }) {
  const rows = new Map(result.firstRound.map((r) => [r.candidateId, r]))
  const baseOf = (e: Entrant) => e.members.reduce((s, m) => s + (rows.get(m.candidateId)?.base ?? 0), 0)
  const scaleMax = Math.max(...result.entrants.map((e) => Math.max(e.score, baseOf(e)))) * 1.04
  const w = (v: number) => `${(v / scaleMax) * 100}%`
  const threshold = result.entrants[1]!.score
  const finalists = new Set([result.secondRound.a, result.secondRound.b])

  return (
    <section aria-labelledby="first-round-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="first-round-title" className="text-2xl font-bold tracking-tight">
          Premier tour simulé
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3" aria-label="Légende">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-r-[3px] bg-ink-3/25" /> moyenne brute des sondages
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-r-[3px] bg-ink-2" /> score simulé
          </li>
          {result.entrants.some((e) => e.allianceIds.length > 0) && (
            <li className="flex items-center gap-1.5">
              <span
                className="cand-hatch h-2.5 w-5 rounded-r-[3px]"
                style={{ '--c': 'var(--ink-2)', '--c-dark': 'var(--ink-2)' } as CSSProperties}
              />
              part ralliée
            </li>
          )}
        </ul>
      </div>

      <div className="relative pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-6 left-0 right-0 hidden sm:block sm:left-[11.25rem] sm:right-[10rem]"
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

        <ol className="space-y-1">
          {result.entrants.map((e, i) => (
            <motion.li key={e.id} layout transition={spring}>
              <CandidateRow
                entrant={e}
                rows={rows}
                qualified={finalists.has(e.id)}
                rank={i + 1}
                base={baseOf(e)}
                width={w}
                leaks={result.allianceLeaks}
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
  rows,
  qualified,
  rank,
  base,
  width,
  leaks,
}: {
  entrant: Entrant
  rows: Map<string, FirstRoundRow>
  leaks: AllianceLeak[]
  qualified: boolean
  rank: number
  base: number
  width: (v: number) => string
}) {
  const leader = cand(entrant.id)
  const delta = entrant.score - base
  const label = entrant.members.map((m) => cand(m.candidateId).shortName).join(' + ')

  return (
    <InfoTip content={<RowDetails entrant={entrant} rows={rows} leaks={leaks} />}>
      <div
        tabIndex={0}
        aria-label={`${rank}e : ${label}, ${pct(entrant.score)}`}
        className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 outline-offset-0 hover:bg-sunken/70 sm:grid-cols-[10rem_1fr_4rem_4rem] ${
          qualified ? 'bg-ballpoint-soft/60' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span style={colorVars(leader)} className="cand-fill h-3 w-3 shrink-0 rounded-full" />
          <span className="min-w-0 leading-tight">
            <span className={`block truncate ${qualified ? 'font-semibold' : 'font-medium'}`}>{leader.shortName}</span>
            {entrant.members.length > 1 && (
              <span className="block truncate text-xs text-ink-3">
                avec {entrant.members.slice(1).map((m) => cand(m.candidateId).shortName).join(', ')}
              </span>
            )}
          </span>
        </div>

        <div className="relative order-3 col-span-2 h-[18px] sm:order-none sm:col-span-1">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-r-[4px] bg-ink-3/20"
            animate={{ width: width(base) }}
            transition={spring}
          />
          <motion.div
            className="absolute inset-y-[3px] left-0 flex gap-[2px]"
            animate={{ width: width(entrant.score) }}
            transition={spring}
          >
            {entrant.members.map((m, i) => (
              <div
                key={m.candidateId}
                style={{ ...colorVars(cand(m.candidateId)), flexGrow: m.contribution, flexBasis: 0 }}
                className={`${i === 0 ? 'cand-fill' : 'cand-hatch'} h-full last:rounded-r-[4px]`}
              />
            ))}
          </motion.div>
        </div>

        <span className="num text-right font-semibold">{pct(entrant.score)}</span>
        <span
          className={`num hidden text-right text-sm sm:block ${Math.abs(delta) < 0.05 ? 'text-ink-3' : 'text-ink-2'}`}
        >
          {pts(delta)}
        </span>
      </div>
    </InfoTip>
  )
}

function RowDetails({
  entrant,
  rows,
  leaks,
}: {
  entrant: Entrant
  rows: Map<string, FirstRoundRow>
  leaks: AllianceLeak[]
}) {
  return (
    <div className="space-y-2">
      {entrant.members.map((m) => {
        const r = rows.get(m.candidateId)
        const c = cand(m.candidateId)
        if (!r) return null
        const single = r.references.length === 1 ? r.references[0]!.id : null
        const refLabel = r.references
          .map((p) =>
            r.references.length > 1
              ? `${ref2022Names.get(p.id)} ${pct(p.weight * 100, 0)}`
              : (ref2022Names.get(p.id) ?? p.id),
          )
          .join(' + ')
        return (
          <dl key={m.candidateId} className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            <dt className="col-span-2 font-semibold">{c.name}</dt>
            <dt className="text-ink-3">Moyenne des sondages</dt>
            <dd className="num text-right">{pct(r.base)}</dd>
            {Math.abs(r.projected - r.base) > 1e-9 && (
              <>
                <dt className="text-ink-3">
                  Progression 2022{r.progressionRatio ? ` (${ratio(r.progressionRatio)})` : ''}
                </dt>
                <dd className="num text-right">{pct(r.projected)}</dd>
              </>
            )}
            <dt className="text-ink-3">Référence 2022</dt>
            <dd className="num text-right">
              {r.ratio2022 ? `${refLabel} ${ratio(r.ratio2022)}` : 'aucune'}
            </dd>
            {single && r.ratio2022 && (
              <>
                <dt className="text-ink-3">Sondages → résultat 2022</dt>
                <dd className="num text-right">
                  {pct(reference2022Stats.pollAverage[single] ?? 0)} → {pct(reference2022Stats.result[single] ?? 0)}
                </dd>
              </>
            )}
            <dt className="text-ink-3">Correction{r.isOverride ? ' (manuelle)' : ''}</dt>
            <dd className="num text-right">{pts(r.appliedCorrection)}</dd>
            <dt className="text-ink-3">Après correction</dt>
            <dd className="num text-right">{pct(r.corrected)}</dd>
            {entrant.members.length > 1 && m.rate < 1 && (
              <>
                <dt className="text-ink-3">Électeurs qui suivent le leader</dt>
                <dd className="num text-right">{pct(m.rate * 100, 0)}</dd>
              </>
            )}
            {entrant.members.length > 1 && (
              <>
                <dt className="text-ink-3">Apport à l’alliance</dt>
                <dd className="num text-right">{pct(m.contribution)}</dd>
              </>
            )}
            {leaks
              .filter((l) => l.to === m.candidateId)
              .map((l) => (
                <Fragment key={l.from}>
                  <dt className="text-ink-3">Dont électeurs de {cand(l.from).shortName}</dt>
                  <dd className="num text-right">{pct(l.points)}</dd>
                </Fragment>
              ))}
          </dl>
        )
      })}
    </div>
  )
}
