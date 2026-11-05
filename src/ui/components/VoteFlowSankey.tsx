import { useCallback, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SecondRoundResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars, transferLabel } from '../candidates'
import { pct, points } from '../format'
import { layoutSankey, placeLabels } from '../sankey'
import type { PlacedLabel, SankeyLink, SankeyNode } from '../sankey'
import { InfoTip } from './InfoTip'

const TARGETS = ['a', 'b', 'abstention'] as const
type Target = (typeof TARGETS)[number]

/** Flux plus petits (en points des électeurs du 1er tour) : place gardée dans les nœuds, ruban non tracé. */
const MIN_DRAWN = 0.05
/** En dessous, le graphique défile horizontalement dans son cadre plutôt que d'écraser les rubans. */
const MIN_WIDTH = 280
/** Hauteur minimale du graphique ; au-delà, elle suit le nombre d'électorats et la place de leurs noms. */
const MIN_HEIGHT = 360
/** Épaisseur minimale du tracé des petits rubans et des petits nœuds (px), pour qu'ils restent visibles. */
const MIN_THICKNESS = 3

/** Élément mis en avant : un électorat, un choix du 2nd tour ou un ruban. */
type Active =
  | { kind: 'source'; key: string; id: string }
  | { kind: 'target'; key: string; id: Target }
  | { kind: 'link'; key: string; source: string; target: Target }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Largeur du conteneur (640 px tant qu'elle n'est pas mesurable) : mesurée dès le montage, avant le premier
 * affichage, puis suivie au redimensionnement.
 */
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
 * Diagramme de Sankey des reports : à gauche l'électorat de chaque candidat au 1er tour (dans l'ordre du
 * tableau), à droite les deux finalistes puis les blancs, nuls et abstentions. L'épaisseur d'un ruban est
 * proportionnelle aux points des électeurs du 1er tour qui se reportent. La hauteur n'est pas bornée : le
 * graphique s'allonge pour nommer chaque électorat, même minuscule, en face de son nœud.
 */
export function VoteFlowSankey({ sr, flows }: { sr: SecondRoundResult; flows: Flow[] }) {
  const [ref, measured] = useWidth()
  const descId = useId()
  const [hover, setHover] = useState<Active | null>(null)
  const [pinned, setPinned] = useState<Active | null>(null)
  const active = hover ?? pinned

  const a = cand(sr.a)
  const b = cand(sr.b)
  const flowOf = new Map(flows.map((f) => [f.candidateId, f]))
  const targetName = (t: Target) =>
    t === 'a' ? a.shortName : t === 'b' ? b.shortName : 'blanc, nul ou abstention'
  const pick = (f: Flow, t: Target) => (t === 'a' ? f.toA : t === 'b' ? f.toB : f.abstention)
  const rate = (v: number, share: number) => pct(share > 0 ? (v * 100) / share : 0, 0)

  // Géométrie, en pixels : le SVG est dessiné à la largeur mesurée (viewBox = largeur affichée).
  const W = Math.max(MIN_WIDTH, measured)
  const compact = W < 520
  const nodeWidth = compact ? 8 : 10
  const labelGap = compact ? 10 : 12
  // Sur téléphone, la colonne des noms prend plus de place pour éviter de tronquer les noms courants.
  const sourceX = Math.round(compact ? clamp(W * 0.41, 112, 176) : clamp(W * 0.34, 104, 176))
  const targetX = Math.round(W - clamp(W * 0.22, 76, 136) - nodeWidth)
  const line = compact ? 16 : 20
  const likeLine = compact ? 14 : 16
  const rightHeight = compact ? 38 : 48
  const labelHeight = (id: string) => (flowOf.get(id)!.like ? line + likeLine : line)

  // La hauteur de base fixe l'échelle des rubans ; la mise en page l'allonge ensuite, sans limite, pour
  // que chaque nom tienne en face de son nœud.
  const layout = layoutSankey(
    {
      sources: flows.map((f) => f.candidateId),
      targets: [...TARGETS],
      links: flows.flatMap((f) =>
        TARGETS.map((t) => ({ source: f.candidateId, target: t, value: pick(f, t) })),
      ),
    },
    {
      sourceX,
      targetX,
      nodeWidth,
      top: 8,
      bottom: Math.max(MIN_HEIGHT, flows.length * 26 + 48) - 8,
      nodePadding: compact ? 5 : 6,
      minDrawnValue: MIN_DRAWN,
      linkGap: 1,
      minLinkWidth: MIN_THICKNESS,
      sourceLabels: { height: labelHeight, gap: 2 },
    },
  )
  const H = Math.ceil(layout.bottom) + 8

  // Étiquettes de gauche : la mise en page leur a réservé la place, chacune est centrée sur son nœud.
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
  // Survol et focus mettent en avant ; un clic (ou un toucher, sans infobulle) épingle le détail.
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

  const linkText = (l: SankeyLink) => {
    const f = flowOf.get(l.source)!
    return `Électeurs de ${cand(l.source).shortName} → ${targetName(l.target as Target)} : ${points(l.value, 1, true)} des électeurs du 1er tour (${rate(l.value, f.share)} de son électorat).`
  }
  const sourceText = (f: Flow) => {
    const who = `Électeurs de ${cand(f.candidateId).shortName} : ${pct(f.share)} des électeurs du 1er tour${
      f.like ? `, qui se reportent comme ${transferLabel(f.like)}` : ''
    }.`
    return `${who} ${rate(f.toA, f.share)} vers ${a.shortName}, ${rate(f.toB, f.share)} vers ${b.shortName}, ${rate(f.abstention, f.share)} blanc, nul ou abstention.`
  }
  const targetText = (t: Target) => {
    const total = t === 'a' ? sr.votes.a : t === 'b' ? sr.votes.b : sr.votes.abstention
    const main = flows
      .filter((f) => pick(f, t) >= MIN_DRAWN)
      .sort((x, y) => pick(y, t) - pick(x, t))
      .slice(0, 3)
      .map((f) => `${cand(f.candidateId).shortName} (${points(pick(f, t))})`)
    const head =
      t === 'abstention'
        ? `Blanc, nul ou abstention : ${points(total, 1, true)} des électeurs du 1er tour`
        : `${targetName(t)} : ${pct(t === 'a' ? sr.pct.a : sr.pct.b)} des suffrages exprimés, soit ${points(total, 1, true)} des électeurs du 1er tour`
    return `${head}${main.length > 0 ? `, surtout des électeurs de ${main.join(', ')}` : ''}.`
  }
  const describe = (x: Active) => {
    if (x.kind === 'target') return targetText(x.id)
    if (x.kind === 'source') return sourceText(flowOf.get(x.id)!)
    return linkText(layout.links.find((l) => linkActive(l).key === x.key)!)
  }

  const opacity = (l: SankeyLink) => (!active ? 0.45 : related(l, active) ? 0.85 : 0.12)
  const nodeBox = (n: SankeyNode) => {
    // Un électorat minuscule reste visible, aussi épais que ses rubans ; sa place, elle, est exacte.
    const h = Math.max(MIN_THICKNESS, n.y1 - n.y0)
    return { x: n.x0, y: (n.y0 + n.y1) / 2 - h / 2, width: n.x1 - n.x0, height: h }
  }
  // Trait de rappel entre un nœud de droite et son étiquette, quand celle-ci a dû s'en écarter.
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
            aria-label={`Reports vers le second tour : à gauche l’électorat de chaque candidat au 1er tour, à droite ${a.shortName} (${pct(sr.pct.a)}), ${b.shortName} (${pct(sr.pct.b)}) et blanc, nul ou abstention (${points(sr.votes.abstention)}).`}
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
                      style={colorVars(cand(l.source))}
                      fillOpacity={opacity(l)}
                      stroke="transparent"
                      strokeWidth={4}
                      className="cand-svg cursor-pointer outline-none transition-[fill-opacity] duration-150"
                      {...pointer(linkActive(l))}
                    />
                  </InfoTip>
                ))}
            </g>
            <g>
              {layout.sources.map((n) => (
                <rect
                  key={n.id}
                  {...nodeBox(n)}
                  rx={1.5}
                  style={colorVars(cand(n.id))}
                  className="cand-svg"
                />
              ))}
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
            const f = flowOf.get(p.id)!
            const x = sourceActive(p.id)
            return (
              // Sur grand écran, l'infobulle s'ouvre à droite pour ne pas recouvrir les étiquettes voisines.
              <InfoTip key={p.id} content={sourceText(f)} side={compact ? 'top' : 'right'}>
                <button
                  type="button"
                  aria-pressed={pinned?.key === x.key}
                  style={labelBox(p, 0, sourceX - labelGap)}
                  className={`absolute flex flex-col justify-center rounded-sm text-right ${compact ? 'text-xs' : 'text-sm'}`}
                  {...handlers(x)}
                >
                  <span className="flex justify-end gap-1" style={{ lineHeight: `${line}px` }}>
                    <span className="truncate font-medium text-ink">{cand(f.candidateId).shortName}</span>
                    <span className="num shrink-0 text-ink-3">{pct(f.share)}</span>
                  </span>
                  {f.like && (
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
                    className={`truncate font-medium text-ink ${compact ? 'text-xs leading-4' : 'text-sm leading-5'}`}
                  >
                    {t === 'abstention' ? 'Blanc, abst.' : targetName(t)}
                  </span>
                  {t === 'abstention' ? (
                    <span
                      className={`num text-ink-2 ${compact ? 'text-sm leading-[22px]' : 'text-base leading-7'}`}
                    >
                      {points(sr.votes.abstention)}
                    </span>
                  ) : (
                    <span
                      className={`figure text-ink ${compact ? 'text-lg leading-[22px]' : 'text-2xl leading-7'}`}
                    >
                      {pct(t === 'a' ? sr.pct.a : sr.pct.b)}
                    </span>
                  )}
                </button>
              </InfoTip>
            )
          })}
        </div>
      </div>

      <p aria-live="polite" className="mt-2 min-h-[2.5rem] text-sm text-ink-2">
        {pinned
          ? describe(pinned)
          : 'Survolez ou touchez un nom ou un ruban pour le détail ; le mode Tableau donne tous les reports.'}
      </p>
    </div>
  )
}
