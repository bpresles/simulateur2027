import { useMemo, useState } from 'react'
import type { CandidateId, SimulationResult, TrajectoryPoint } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { date, integer, pct } from '../format'
import { Segmented } from './controls'

const W = 780
const H = 300
const PAD = { top: 18, right: 94, bottom: 32, left: 42 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const shortMonthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const shortMonth = (iso: string) => shortMonthFmt.format(new Date(`${iso}T00:00:00Z`))

/**
 * Graphique de trajectoire temporelle :
 * - courbes pleines : moyenne pondérée glissante des sondages passés (2025–2026) ;
 * - ligne verticale « Aujourd'hui » ;
 * - courbes en pointillés : projection vers le 1er tour d'avril 2027 (ou maintien si photographie actuelle) ;
 * - cône translucide : intervalle d'incertitude à 80 % (P10–P90) pour le candidat sélectionné.
 */
export function CampaignTrajectory({ result }: { result: SimulationResult }) {
  const { trajectory, projection } = result
  const projectionEnabled = useSettings((s) => s.projection.enabled)
  const setProjectionEnabled = useSettings((s) => s.setProjectionEnabled)

  const [focusedId, setFocusedId] = useState<CandidateId | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const points = trajectory.points
  const tracked = trajectory.trackedIds
  const activeFocus = focusedId && tracked.includes(focusedId) ? focusedId : tracked[0] ?? null

  const { minTs, maxTs, maxY, xOf, yOf, ticksX, ticksY, nowX } = useMemo(() => {
    const ts = points.map((p) => Date.parse(`${p.date}T00:00:00Z`))
    const minT = ts[0] ?? Date.parse(`${trajectory.asOf}T00:00:00Z`)
    const maxT = ts.at(-1) ?? Date.parse(`${trajectory.electionDate}T00:00:00Z`)
    const spanT = Math.max(1, maxT - minT)

    let peak = 35
    for (const pt of points) {
      for (const id of tracked) {
        peak = Math.max(peak, pt.scores[id] ?? 0, pt.p90?.[id] ?? 0)
      }
    }
    const ceilY = Math.min(60, Math.ceil(peak / 5) * 5)

    const x = (iso: string) => {
      const t = Date.parse(`${iso}T00:00:00Z`)
      return PAD.left + ((t - minT) / spanT) * PLOT_W
    }
    const y = (v: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(ceilY, v)) / ceilY) * PLOT_H

    // Repères temporels (tous les ~2–3 mois)
    const tickCount = 6
    const tx: { iso: string; x: number; label: string }[] = []
    for (let i = 0; i <= tickCount; i++) {
      const t = minT + (spanT * i) / tickCount
      const iso = new Date(t).toISOString().slice(0, 10)
      tx.push({ iso, x: PAD.left + (PLOT_W * i) / tickCount, label: shortMonth(iso) })
    }
    const stepY = ceilY > 40 ? 10 : 5
    const ty: number[] = []
    for (let v = 0; v <= ceilY; v += stepY) ty.push(v)

    return { minTs: minT, maxTs: maxT, maxY: ceilY, xOf: x, yOf: y, ticksX: tx, ticksY: ty, nowX: x(trajectory.asOf) }
  }, [points, tracked, trajectory.asOf, trajectory.electionDate])

  if (points.length < 2 || tracked.length === 0) return null

  const histPoints = points.filter((p) => p.kind === 'history' || p.kind === 'now')
  const futurePoints = points.filter((p) => p.kind === 'now' || p.kind === 'projection')

  const linePath = (list: TrajectoryPoint[], id: CandidateId) => {
    let d = ''
    for (const pt of list) {
      const v = pt.scores[id]
      if (v === undefined) continue
      const cmd = d === '' ? 'M' : 'L'
      d += `${cmd}${xOf(pt.date).toFixed(1)},${yOf(v).toFixed(1)}`
    }
    return d
  }

  const conePath = (id: CandidateId) => {
    const valid = futurePoints.filter((pt) => pt.p10?.[id] !== undefined && pt.p90?.[id] !== undefined)
    if (valid.length < 2) return ''
    const upper = valid.map((pt) => `${xOf(pt.date).toFixed(1)},${yOf(pt.p90![id]!).toFixed(1)}`).join(' L')
    const lower = [...valid]
      .reverse()
      .map((pt) => `${xOf(pt.date).toFixed(1)},${yOf(pt.p10![id]!).toFixed(1)}`)
      .join(' L')
    return `M${upper} L${lower} Z`
  }

  // Étiquettes de droite (évitement simple de chevauchement sur le score final)
  const lastPt = points.at(-1)!
  const endLabels = tracked
    .map((id) => ({ id, score: lastPt.scores[id] ?? 0, y: yOf(lastPt.scores[id] ?? 0) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < endLabels.length; i++) {
    const prev = endLabels[i - 1]!
    const cur = endLabels[i]!
    if (cur.y - prev.y < 14) cur.y = prev.y + 14
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] ?? null : null
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const ratio = (svgX - PAD.left) / PLOT_W
    if (ratio < -0.02 || ratio > 1.02) {
      setHoverIndex(null)
      return
    }
    const targetTs = minTs + Math.max(0, Math.min(1, ratio)) * (maxTs - minTs)
    let bestIdx = 0
    let bestDist = Infinity
    points.forEach((pt, idx) => {
      const d = Math.abs(Date.parse(`${pt.date}T00:00:00Z`) - targetTs)
      if (d < bestDist) {
        bestDist = d
        bestIdx = idx
      }
    })
    setHoverIndex(bestIdx)
  }

  return (
    <section aria-labelledby="trajectory-title" className="mt-10 rounded-xl bg-surface p-5 shadow-[var(--ballot-shadow)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="trajectory-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            Évolution et trajectoire vers avril 2027
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {projectionEnabled
              ? `Projection structurelle jusqu’au ${date(trajectory.electionDate)} (vote utile par bloc, léger amortissement et tendance amortie sur ${integer(trajectory.historyPollCount)} vagues passées).`
              : `Courbe lissée sur ${integer(trajectory.historyPollCount)} vagues passées (demi-vie 14 j), prolongée à scores constants avec le cône d’incertitude à 80 %.`}
          </p>
        </div>
        <Segmented<'now' | 'projected'>
          label="Horizon de la simulation"
          value={projectionEnabled ? 'projected' : 'now'}
          onValueChange={(v) => setProjectionEnabled(v === 'projected')}
          options={[
            { value: 'now', label: 'Photographie actuelle' },
            { value: 'projected', label: 'Projection avril 2027' },
          ]}
        />
      </div>

      {/* Sélecteur de candidat pour le cône d'incertitude 80 % */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Candidat mis en avant pour le cône d’incertitude">
        <span className="mr-1 text-xs text-ink-3">Cône 80 % :</span>
        {tracked.map((id) => {
          const c = cand(id)
          const active = activeFocus === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFocusedId(id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-ballpoint bg-ballpoint-soft text-ink'
                  : 'border-rule bg-paper text-ink-2 hover:border-ink-3'
              }`}
            >
              <span style={colorVars(c)} className="cand-fill h-2 w-2 rounded-full" />
              {c.shortName}
            </button>
          )
        })}
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          role="img"
          aria-label={`Trajectoire des intentions de vote du ${date(points[0]!.date)} au ${date(trajectory.electionDate)}`}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[560px] select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* Grille horizontale */}
          {ticksY.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yOf(v)}
                y2={yOf(v)}
                className="stroke-rule"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={yOf(v) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px]">
                {v} %
              </text>
            </g>
          ))}

          {/* Zone future légèrement teintée */}
          <rect
            x={nowX}
            y={PAD.top}
            width={Math.max(0, W - PAD.right - nowX)}
            height={PLOT_H}
            className="fill-sunken/45"
          />

          {/* Repère vertical « Aujourd'hui » */}
          <line
            x1={nowX}
            x2={nowX}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            className="stroke-ink-3"
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
          <text x={nowX} y={PAD.top - 5} textAnchor="middle" className="fill-ink-2 text-[10px] font-medium">
            Aujourd’hui ({date(trajectory.asOf)})
          </text>

          {/* Cône d'incertitude 80 % du candidat sélectionné */}
          {activeFocus && conePath(activeFocus) && (
            <path
              d={conePath(activeFocus)}
              style={colorVars(cand(activeFocus))}
              className="cand-svg"
              fillOpacity={0.16}
            />
          )}

          {/* Courbes historiques (traits pleins) */}
          {tracked.map((id) => {
            const c = cand(id)
            const isFocus = activeFocus === id
            const d = linePath(histPoints, id)
            if (!d) return null
            return (
              <path
                key={`hist-${id}`}
                d={d}
                fill="none"
                style={{ stroke: 'var(--c)', ...colorVars(c) }}
                strokeWidth={isFocus ? 2.5 : 1.5}
                strokeOpacity={isFocus ? 1 : 0.65}
              />
            )
          })}

          {/* Courbes futures (pointillés) */}
          {tracked.map((id) => {
            const c = cand(id)
            const isFocus = activeFocus === id
            const d = linePath(futurePoints, id)
            if (!d) return null
            return (
              <path
                key={`fut-${id}`}
                d={d}
                fill="none"
                style={{ stroke: 'var(--c)', ...colorVars(c) }}
                strokeWidth={isFocus ? 2.5 : 1.5}
                strokeOpacity={isFocus ? 1 : 0.65}
                strokeDasharray="5 4"
              />
            )
          })}

          {/* Étiquettes de droite à la date du 1er tour */}
          {endLabels.map(({ id, score, y }) => {
            const c = cand(id)
            const isFocus = activeFocus === id
            return (
              <text
                key={`lbl-${id}`}
                x={W - PAD.right + 6}
                y={Math.min(PAD.top + PLOT_H, Math.max(PAD.top + 8, y + 3.5))}
                className={`text-[11px] ${isFocus ? 'fill-ink font-semibold' : 'fill-ink-2'}`}
              >
                {c.shortName} {pct(score, 0)}
              </text>
            )
          })}

          {/* Axe des dates */}
          {ticksX.map((t) => (
            <text key={t.iso} x={t.x} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[10px]">
              {t.label}
            </text>
          ))}

          {/* Curseur au survol */}
          {hovered && (
            <g pointerEvents="none">
              <line
                x1={xOf(hovered.date)}
                x2={xOf(hovered.date)}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                className="stroke-ballpoint"
                strokeWidth={1}
              />
              {tracked.map((id) => {
                const v = hovered.scores[id]
                if (v === undefined) return null
                return (
                  <circle
                    key={`dot-${id}`}
                    cx={xOf(hovered.date)}
                    cy={yOf(v)}
                    r={activeFocus === id ? 4 : 2.5}
                    style={colorVars(cand(id))}
                    className="cand-svg stroke-surface"
                    strokeWidth={1.5}
                  />
                )
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Bandeau de lecture au survol ou résumé de l'horizon */}
      <div className="mt-2 min-h-[2rem] text-xs text-ink-2" aria-live="polite">
        {hovered ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-ink">
              {date(hovered.date)} (
              {hovered.kind === 'history'
                ? 'historique lissé'
                : hovered.kind === 'now'
                  ? 'aujourd’hui'
                  : projectionEnabled
                    ? 'projection'
                    : 'maintien + incertitude'}
              ) :
            </span>
            {tracked.map((id) => {
              const v = hovered.scores[id]
              if (v === undefined) return null
              const lo = hovered.p10?.[id]
              const hi = hovered.p90?.[id]
              return (
                <span key={id} className="num">
                  <strong>{cand(id).shortName}</strong> {pct(v)}
                  {activeFocus === id && lo !== undefined && hi !== undefined && ` [${pct(lo, 0)}–${pct(hi, 0)}]`}
                </span>
              )
            })}
          </div>
        ) : (
          <p className="text-ink-3">
            Survolez la courbe pour lire les scores à chaque date. Trait plein : moyenne glissante des vagues publiées ;
            pointillés : {projectionEnabled ? 'trajectoire projetée' : 'scores actuels constants'} jusqu’au{' '}
            {date(trajectory.electionDate)} (J−{projection.daysRemaining}).
            {maxY > 0 && ' Le cône ombré représente l’intervalle à 80 % (P10–P90) du candidat sélectionné.'}
          </p>
        )}
      </div>
    </section>
  )
}
