import { useCallback, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SecondRoundResult, VoteFlow as Flow } from '../../domain/types'
import { cand, colorVars, transferLabel } from '../candidates'
import { pct, points } from '../format'
import { groupSmall, layoutSankey, placeLabels } from '../sankey'
import type { PlacedLabel, SankeyLink, SankeyNode } from '../sankey'
import { InfoTip } from './InfoTip'

const TARGETS = ['a', 'b', 'abstention'] as const
type Target = (typeof TARGETS)[number]

/** Flux plus petits (en points des électeurs du 1er tour) : place gardée dans les nœuds, ruban non tracé. */
const MIN_DRAWN = 0.05
/** Électorats de moins de 1 point qui se suivent : une seule étiquette « Autres ». */
const SMALL_SHARE = 1
/** En dessous, le graphique défile horizontalement dans son cadre plutôt que d'écraser les rubans. */
const MIN_WIDTH = 280

/** Élément mis en avant : un électorat (ou un groupe d'électorats), un choix du 2nd tour ou un ruban. */
type Active =
  | { kind: 'source'; key: string; ids: string[] }
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
 * proportionnelle aux points des électeurs du 1er tour qui se reportent.
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
  const H = Math.round(clamp(flows.length * 26 + 48, 360, 560))
  const line = compact ? 16 : 20
  const likeLine = compact ? 14 : 16
  const rightHeight = compact ? 38 : 48

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
      bottom: H - 8,
      nodePadding: compact ? 5 : 6,
      minDrawnValue: MIN_DRAWN,
      linkGap: 1,
    },
  )

  // Étiquettes de gauche : les petits électorats consécutifs partagent une étiquette ; faute de place,
  // les moins gros ne sont pas nommés (l'infobulle des rubans et le tableau gardent l'information).
  const groups = groupSmall(layout.sources, (n) => flowOf.get(n.id)!.share, SMALL_SHARE).map((nodes) => {
    const members = nodes.map((n) => flowOf.get(n.id)!)
    const single = members.length === 1 ? members[0]! : undefined
    return {
      key: single ? single.candidateId : `autres-${members[0]!.candidateId}`,
      nodes,
      members,
      single,
      share: members.reduce((s, f) => s + f.share, 0),
    }
  })
  type Group = (typeof groups)[number]
  const left = placeLabels(
    groups.map((g) => ({
      id: g.key,
      anchor: (g.nodes[0]!.y0 + g.nodes.at(-1)!.y1) / 2,
      height: g.single?.like ? line + likeLine : line,
      priority: g.share,
    })),
    { top: 0, bottom: H, gap: 2, maxShift: compact ? 30 : 40 },
  )
  const right = placeLabels(
    layout.targets.map((n) => ({
      id: n.id,
      anchor: (n.y0 + n.y1) / 2,
      height: rightHeight,
      priority: n.value,
    })),
    { top: 0, bottom: H, gap: 4, maxShift: H },
  )
  const groupOf = new Map(groups.map((g) => [g.key, g]))
  const hiddenNames = left.hidden.flatMap((key) =>
    groupOf.get(key)!.members.map((f) => cand(f.candidateId).shortName),
  )

  const sourceActive = (g: Group): Active => ({
    kind: 'source',
    key: `s:${g.key}`,
    ids: g.members.map((f) => f.candidateId),
  })
  const targetActive = (t: Target): Active => ({ kind: 'target', key: `t:${t}`, id: t })
  const linkActive = (l: SankeyLink): Active => ({
    kind: 'link',
    key: `l:${l.source}:${l.target}`,
    source: l.source,
    target: l.target as Target,
  })
  const related = (l: SankeyLink, x: Active) =>
    x.kind === 'source'
      ? x.ids.includes(l.source)
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
  const sourceText = (g: Group) => {
    const sum = (t: Target) => g.members.reduce((s, f) => s + pick(f, t), 0)
    const who = g.single
      ? `Électeurs de ${cand(g.single.candidateId).shortName} : ${pct(g.share)} des électeurs du 1er tour${
          g.single.like ? `, qui se reportent comme ${transferLabel(g.single.like)}` : ''
        }.`
      : `Électeurs de ${g.members.map((f) => `${cand(f.candidateId).shortName} (${pct(f.share)})`).join(', ')} : ${pct(g.share)} des électeurs du 1er tour.`
    return `${who} ${rate(sum('a'), g.share)} vers ${a.shortName}, ${rate(sum('b'), g.share)} vers ${b.shortName}, ${rate(sum('abstention'), g.share)} blanc, nul ou abstention.`
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
    if (x.kind === 'source') return sourceText(groups.find((g) => `s:${g.key}` === x.key)!)
    return linkText(layout.links.find((l) => linkActive(l).key === x.key)!)
  }

  const opacity = (l: SankeyLink) => (!active ? 0.45 : related(l, active) ? 0.85 : 0.12)
  const nodeBox = (n: SankeyNode) => {
    // Un électorat minuscule reste visible (1 px) ; sa place dans la colonne, elle, est exacte.
    const h = Math.max(1, n.y1 - n.y0)
    return { x: n.x0, y: (n.y0 + n.y1) / 2 - h / 2, width: n.x1 - n.x0, height: h }
  }
  const leader = (p: PlacedLabel, x0: number, x1: number, fromLabel: boolean) => {
    const center = (p.y0 + p.y1) / 2
    if (Math.abs(center - p.anchor) < 2) return null
    const [y0, y1] = fromLabel ? [center, p.anchor] : [p.anchor, center]
    return (
      <path
        key={p.id}
        d={`M${x0},${y0.toFixed(1)}L${x1},${y1.toFixed(1)}`}
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
              {left.placed.map((p) => leader(p, sourceX - labelGap + 2, sourceX - 2, true))}
              {right.placed.map((p) =>
                leader(p, targetX + nodeWidth + 2, targetX + nodeWidth + labelGap - 2, false),
              )}
            </g>
          </svg>

          {left.placed.map((p) => {
            const g = groupOf.get(p.id)!
            const x = sourceActive(g)
            const name = g.single ? cand(g.single.candidateId).shortName : `Autres (${g.members.length})`
            return (
              // Sur grand écran, l'infobulle s'ouvre à droite pour ne pas recouvrir les étiquettes voisines.
              <InfoTip key={p.id} content={sourceText(g)} side={compact ? 'top' : 'right'}>
                <button
                  type="button"
                  aria-pressed={pinned?.key === x.key}
                  style={labelBox(p, 0, sourceX - labelGap)}
                  className={`absolute flex flex-col justify-center rounded-sm text-right ${compact ? 'text-xs' : 'text-sm'}`}
                  {...handlers(x)}
                >
                  <span className="flex justify-end gap-1" style={{ lineHeight: `${line}px` }}>
                    <span className="truncate font-medium text-ink">{name}</span>
                    <span className="num shrink-0 text-ink-3">{pct(g.share)}</span>
                  </span>
                  {g.single?.like && (
                    <span
                      className={`truncate text-ink-3 ${compact ? 'text-[11px]' : 'text-xs'}`}
                      style={{ lineHeight: `${likeLine}px` }}
                    >
                      comme {transferLabel(g.single.like)}
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
      {hiddenNames.length > 0 && (
        <p className="mt-1 text-sm text-ink-3">
          Faute de place, non nommés sur le graphique : {hiddenNames.join(', ')} (voir leurs rubans ou le mode
          Tableau).
        </p>
      )}
    </div>
  )
}
