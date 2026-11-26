import { useCallback, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import type { NewVoterRates } from '../../domain/newVoters'
import type { SecondRoundResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars, transferLabel } from '../candidates'
import { pct } from '../format'
import { abstentionNote, unmeasuredNote } from '../newVotersText'
import { layoutSankey, placeLabels } from '../sankey'
import type { PlacedLabel, SankeyLink, SankeyNode } from '../sankey'
import { InfoTip } from './InfoTip'

const TARGETS = ['a', 'b', 'abstention'] as const
type Target = (typeof TARGETS)[number]

const ABSTENTION_1 = '__abstention1'
const BLANK_NULL_1 = '__blankNull1'
const isGroup = (id: string) => id === ABSTENTION_1 || id === BLANK_NULL_1

const MIN_DRAWN = 0.05
const MIN_WIDTH = 280
const MIN_HEIGHT = 360
const MIN_THICKNESS = 3

type Active =
  | { kind: 'source'; key: string; id: string }
  | { kind: 'target'; key: string; id: Target }
  | { kind: 'link'; key: string; source: string; target: Target }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function useWidth() {
  const [width, setWidth] = useState(640)
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const update = (w: number) => {
      if (w > 0) setWidth(Math.round(w))
    }
    update(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => update(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Diagramme de Sankey des reports en flux bruts (% des inscrits), alimenté directement par `SecondRoundResult`.
 */
export function VoteFlowSankey({
  sr,
  flows,
  rates,
  scores,
  mobilization,
  antiRnShare,
  endogenous,
}: {
  sr: SecondRoundResult
  flows: Flow[]
  rates: Pick<NewVoterRates, 'insee' | 'bnShare' | 'rAbs'>
  scores: Map<string, number>
  mobilization: number
  antiRnShare: number | undefined
  endogenous: boolean
}) {
  const [ref, measured] = useWidth()
  const descId = useId()
  const [hover, setHover] = useState<Active | null>(null)
  const [pinned, setPinned] = useState<Active | null>(null)
  const active = hover ?? pinned

  const a = cand(sr.a)
  const b = cand(sr.b)
  const flowOf = new Map(flows.map((f) => [f.candidateId, f]))
  const targetName = (t: Target) =>
    t === 'a' ? a.shortName : t === 'b' ? b.shortName : 'ne s’expriment pas'
  const pick = (f: Flow, t: Target) => (t === 'a' ? f.toA : t === 'b' ? f.toB : f.abstention)
  const rate = (v: number, share: number) => pct(share > 0 ? (v * 100) / share : 0, 0)
  const { abstainers, blankNull } = sr
  const group = (id: string) => (id === ABSTENTION_1 ? abstainers.volume : blankNull.volume)
  const groupName = (id: string) => (id === ABSTENTION_1 ? 'Abstention au 1er tour' : 'Blancs et nuls au 1er tour')
  const groupPick = (id: string, t: Target) => {
    const g = id === ABSTENTION_1 ? abstainers : blankNull
    return t === 'a' ? g.toA : t === 'b' ? g.toB : g.nonExpressed
  }
  const sourceIds = [...flows.map((f) => f.candidateId), BLANK_NULL_1, ABSTENTION_1]
  const sourceName = (id: string) => (isGroup(id) ? groupName(id) : cand(id).shortName)
  const sourceValue = (id: string, t: Target) => (isGroup(id) ? groupPick(id, t) : pick(flowOf.get(id)!, t))
  const targetTotal = (t: Target) =>
    t === 'a' ? sr.totals.a : t === 'b' ? sr.totals.b : sr.totals.nonExpressed

  const W = Math.max(MIN_WIDTH, measured)
  const compact = W < 520
  const nodeWidth = compact ? 8 : 10
  const labelGap = compact ? 10 : 12
  const sourceX = Math.round(compact ? clamp(W * 0.41, 112, 176) : clamp(W * 0.4, 104, 230))
  const targetX = Math.round(W - clamp(W * 0.26, 104, 150) - nodeWidth)
  const line = compact ? 16 : 20
  const likeLine = compact ? 14 : 16
  const rightHeight = compact ? 72 : 88
  const labelHeight = (id: string) => (isGroup(id) ? 3 * likeLine : flowOf.get(id)!.like ? line + likeLine : line)

  const layout = layoutSankey(
    {
      sources: sourceIds,
      targets: [...TARGETS],
      links: sourceIds.flatMap((id) =>
        TARGETS.map((t) => ({ source: id, target: t, value: sourceValue(id, t) })),
      ),
    },
    {
      sourceX,
      targetX,
      nodeWidth,
      top: 8,
      bottom: Math.max(MIN_HEIGHT, sourceIds.length * 26 + 48) - 8,
      nodePadding: compact ? 5 : 6,
      minDrawnValue: MIN_DRAWN,
      linkGap: 1,
      minLinkWidth: MIN_THICKNESS,
      sourceLabels: { height: labelHeight, gap: 2 },
    },
  )
  const H = Math.ceil(layout.bottom) + 8

  const left: PlacedLabel[] = layout.sources.map((n) => {
    const center = (n.y0 + n.y1) / 2
    const h = labelHeight(n.id)
    return { id: n.id, anchor: center, y0: center - h / 2, y1: center + h / 2 }
  })
  const right = placeLabels(
    layout.targets.map((n) => ({
      id: n.id,
      anchor: (n.y0 + n.y1) / 2,
      height: rightHeight,
      priority: n.value,
    })),
    { top: 0, bottom: H, gap: 4, maxShift: H },
  )

  const isNewVoterLink = (l: SankeyLink) => isGroup(l.source) && (l.target === 'a' || l.target === 'b')
  const sourceActive = (id: string): Active => ({ kind: 'source', key: `s:${id}`, id })
  const targetActive = (t: Target): Active => ({ kind: 'target', key: `t:${t}`, id: t })
  const linkActive = (l: SankeyLink): Active => ({
    kind: 'link',
    key: `l:${l.source}:${l.target}`,
    source: l.source,
    target: l.target as Target,
  })
  const related = (l: SankeyLink, x: Active) =>
    x.kind === 'source'
      ? l.source === x.id
      : x.kind === 'target'
        ? l.target === x.id
        : x.key === linkActive(l).key
  const pointer = (x: Active) => ({
    onPointerEnter: () => setHover(x),
    onPointerLeave: () => setHover(null),
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      setPinned((p) => (p?.key === x.key ? null : x))
    },
  })
  const handlers = (x: Active) => ({
    ...pointer(x),
    onFocus: () => setHover(x),
    onBlur: () => setHover(null),
  })

  const inscrits = (v: number) => `${pct(v)} des inscrits`
  const votants = `${pct(rates.bnShare * 100)} des votants`
  const bnText = `${votants}, soit ${inscrits(blankNull.volume)}`
  const absNote = abstentionNote(rates, mobilization, antiRnShare, endogenous)
  const linkText = (l: SankeyLink) => {
    const t = l.target as Target
    if (l.source === ABSTENTION_1) {
      return `Abstention au 1er tour → ${targetName(t)} : ${inscrits(l.value)} (${rate(l.value, abstainers.volume)} des abstentionnistes du 1er tour). ${t === 'abstention' ? '' : absNote}`.trim()
    }
    if (l.source === BLANK_NULL_1) {
      return `Blancs et nuls au 1er tour → ${targetName(t)} : ${inscrits(l.value)} (${rate(l.value, blankNull.volume)} des blancs et nuls du 1er tour). ${unmeasuredNote(blankNull.volume)}`
    }
    const f = flowOf.get(l.source)!
    return `Électeurs de ${cand(l.source).shortName} → ${targetName(t)} : ${inscrits(l.value)} (${rate(l.value, f.share)} de son électorat).`
  }
  const sourceText = (id: string) => {
    if (id === ABSTENTION_1) {
      return `Abstention au 1er tour : ${inscrits(abstainers.volume)}. ${rate(abstainers.toA, abstainers.volume)} votent ${a.shortName}, ${rate(abstainers.toB, abstainers.volume)} votent ${b.shortName}, ${rate(abstainers.nonExpressed, abstainers.volume)} ne s’expriment pas. ${absNote}`
    }
    if (id === BLANK_NULL_1) {
      return `Blancs et nuls au 1er tour : ${bnText}. ${rate(blankNull.toA, blankNull.volume)} votent ${a.shortName}, ${rate(blankNull.toB, blankNull.volume)} votent ${b.shortName}, ${rate(blankNull.nonExpressed, blankNull.volume)} ne s’expriment pas. ${unmeasuredNote(blankNull.volume)}`
    }
    const f = flowOf.get(id)!
    const who = `Électeurs de ${cand(id).shortName} : ${pct(scores.get(id) ?? 0)} des exprimés, soit ${inscrits(f.share)}${
      f.like ? `, qui se reportent comme ${transferLabel(f.like)}` : ''
    }.`
    return `${who} ${rate(f.toA, f.share)} vers ${a.shortName}, ${rate(f.toB, f.share)} vers ${b.shortName}, ${rate(f.abstention, f.share)} ne s’expriment pas.`
  }
  const targetText = (t: Target) => {
    const total = targetTotal(t)
    const main = sourceIds
      .filter((id) => sourceValue(id, t) >= MIN_DRAWN)
      .sort((x, y) => sourceValue(y, t) - sourceValue(x, t))
      .slice(0, 2)
      .map((id) =>
        `${id === ABSTENTION_1 ? 'les abstentionnistes du 1er tour' : id === BLANK_NULL_1 ? 'les blancs et nuls du 1er tour' : `les électeurs de ${sourceName(id)}`} (${pct(sourceValue(id, t))})`,
      )
    const head =
      t === 'abstention'
        ? `Ne s’expriment pas (abstention, blanc, nul) : ${inscrits(total)}`
        : `${targetName(t)} : ${pct(t === 'a' ? sr.pct.a : sr.pct.b)} des exprimés, soit ${inscrits(total)}`
    return `${head}${main.length > 0 ? `, surtout ${main.join(', ')}` : ''}.`
  }
  const describe = (x: Active) => {
    if (x.kind === 'target') return targetText(x.id)
    if (x.kind === 'source') return sourceText(x.id)
    return linkText(layout.links.find((l) => linkActive(l).key === x.key)!)
  }

  const opacity = (l: SankeyLink) => {
    const strong = isNewVoterLink(l)
    return !active ? (strong ? 0.85 : 0.45) : related(l, active) ? 0.95 : strong ? 0.2 : 0.12
  }
  const nodeBox = (n: SankeyNode) => {
    const h = Math.max(MIN_THICKNESS, n.y1 - n.y0)
    return { x: n.x0, y: (n.y0 + n.y1) / 2 - h / 2, width: n.x1 - n.x0, height: h }
  }
  const leader = (p: PlacedLabel, x0: number, x1: number) => {
    const center = (p.y0 + p.y1) / 2
    if (Math.abs(center - p.anchor) < 2) return null
    return (
      <path
        key={p.id}
        d={`M${x0},${p.anchor.toFixed(1)}L${x1},${center.toFixed(1)}`}
        className="stroke-ink-3"
        fill="none"
      />
    )
  }
  const labelBox = (p: PlacedLabel, x: number, width: number): CSSProperties => ({
    left: x,
    width,
    top: p.y0,
    height: p.y1 - p.y0,
  })

  return (
    <div>
      <div ref={ref} className="overflow-x-auto">
        <div className="relative w-full" style={{ minWidth: MIN_WIDTH, height: H }}>
          <svg
            role="img"
            aria-label={`Reports vers le second tour : à gauche l’électorat de chaque candidat au 1er tour, les blancs et nuls et l’abstention au 1er tour, à droite ${a.shortName} (${pct(sr.pct.a)} des exprimés), ${b.shortName} (${pct(sr.pct.b)} des exprimés) et ceux qui ne s’expriment pas (${inscrits(sr.totals.nonExpressed)}).`}
            aria-describedby={descId}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            className="block select-none"
            onClick={() => setPinned(null)}
          >
            <desc id={descId}>
              {TARGETS.map(targetText).join(' ')} Le mode Tableau donne le report de chaque électorat.
            </desc>
            <g>
              {layout.links
                .filter((l) => l.drawn)
                .map((l) => (
                  <InfoTip key={`${l.source}:${l.target}`} content={linkText(l)}>
                    <path
                      d={l.path}
                      style={isGroup(l.source) ? undefined : colorVars(cand(l.source))}
                      fillOpacity={opacity(l)}
                      stroke="transparent"
                      strokeWidth={4}
                      className={`${isGroup(l.source) ? (isNewVoterLink(l) ? 'fill-new-voters' : 'fill-ink-3') : 'cand-svg'} cursor-pointer outline-none transition-[fill-opacity] duration-150`}
                      {...pointer(linkActive(l))}
                    />
                  </InfoTip>
                ))}
            </g>
            <g>
              {layout.sources.map((n) =>
                isGroup(n.id) ? (
                  <rect key={n.id} {...nodeBox(n)} rx={1.5} className="fill-ink-3/60" />
                ) : (
                  <rect key={n.id} {...nodeBox(n)} rx={1.5} style={colorVars(cand(n.id))} className="cand-svg" />
                ),
              )}
              {layout.targets.map((n) =>
                n.id === 'abstention' ? (
                  <rect key={n.id} {...nodeBox(n)} rx={1.5} className="fill-ink-3/60" />
                ) : (
                  <rect
                    key={n.id}
                    {...nodeBox(n)}
                    rx={1.5}
                    style={colorVars(n.id === 'a' ? a : b)}
                    className="cand-svg"
                  />
                ),
              )}
            </g>
            <g strokeWidth={1}>
              {right.placed.map((p) =>
                leader(p, targetX + nodeWidth + 2, targetX + nodeWidth + labelGap - 2),
              )}
            </g>
          </svg>

          {left.map((p) => {
            const f = isGroup(p.id) ? undefined : flowOf.get(p.id)!
            const x = sourceActive(p.id)
            return (
              <InfoTip key={p.id} content={sourceText(p.id)} side={compact ? 'top' : 'right'}>
                <button
                  type="button"
                  aria-pressed={pinned?.key === x.key}
                  style={labelBox(p, 0, sourceX - labelGap)}
                  className={`absolute flex flex-col justify-center rounded-sm text-right ${compact ? 'text-xs' : 'text-sm'}`}
                  {...handlers(x)}
                >
                  <span className="flex justify-end gap-1" style={{ lineHeight: `${f ? line : likeLine}px` }}>
                    {f ? (
                      <>
                        <span className="truncate font-medium text-ink">{sourceName(p.id)}</span>
                        <span className="num shrink-0 text-ink-3">{pct(scores.get(p.id) ?? 0)}</span>
                      </>
                    ) : (
                      <span className="text-right">
                        <span className="font-medium text-ink">
                          {p.id === ABSTENTION_1 ? 'Abstention' : 'Blancs et nuls'} <br />
                          au 1er tour
                        </span>
                        <span className="num block text-ink-3">
                          {p.id === ABSTENTION_1 ? `${pct(group(p.id))} des inscrits` : votants}
                        </span>
                      </span>
                    )}
                  </span>
                  {f?.like && (
                    <span
                      className={`truncate text-ink-3 ${compact ? 'text-[11px]' : 'text-xs'}`}
                      style={{ lineHeight: `${likeLine}px` }}
                    >
                      comme {transferLabel(f.like)}
                    </span>
                  )}
                </button>
              </InfoTip>
            )
          })}

          {right.placed.map((p) => {
            const t = p.id as Target
            const x = targetActive(t)
            return (
              <InfoTip key={p.id} content={targetText(t)}>
                <button
                  type="button"
                  aria-pressed={pinned?.key === x.key}
                  style={labelBox(p, targetX + nodeWidth + labelGap, W - targetX - nodeWidth - labelGap)}
                  className="absolute flex flex-col justify-center rounded-sm text-left"
                  {...handlers(x)}
                >
                  <span
                    className={`font-medium text-ink ${t === 'abstention' ? '' : 'truncate'} ${compact ? 'text-xs leading-4' : 'text-sm leading-5'}`}
                  >
                    {t === 'abstention' ? (
                      <>
                        Ne s’expriment <br />
                        pas
                      </>
                    ) : (
                      targetName(t)
                    )}
                  </span>
                  {t === 'abstention' ? (
                    <span className={`num text-ink-2 ${compact ? 'text-sm leading-[22px]' : 'text-base leading-7'}`}>
                      {pct(targetTotal(t))}
                      <span className="block text-xs leading-4 text-ink-3">des inscrits</span>
                    </span>
                  ) : (
                    <span className={`figure text-ink ${compact ? 'text-lg leading-[22px]' : 'text-2xl leading-7'}`}>
                      {pct(t === 'a' ? sr.pct.a : sr.pct.b)}
                    </span>
                  )}
                </button>
              </InfoTip>
            )
          })}
        </div>
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm text-ink-2">
        <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full bg-new-voters" />
        <span>
          Nouveaux votants : non-exprimés du 1er tour (abstention, blancs et nuls) qui votent au 2nd ({inscrits(sr.newVoters)})
        </span>
      </p>

      <p aria-live="polite" className="mt-2 min-h-[2.5rem] text-sm text-ink-2">
        {pinned
          ? describe(pinned)
          : 'Survolez ou touchez un nom ou un ruban pour le détail ; le mode Tableau donne tous les reports.'}
      </p>
    </div>
  )
}
