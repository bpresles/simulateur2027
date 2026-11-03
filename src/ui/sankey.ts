/**
 * Mise en page d'un diagramme de Sankey à deux colonnes (électorats du 1er tour → choix au 2nd tour).
 * Fonctions pures, sans React, en pixels : le composant mesure sa largeur et dessine le résultat.
 */

export interface SankeyLinkInput {
  source: string
  target: string
  value: number
}

export interface SankeyInput {
  /** Nœuds de gauche, de haut en bas. */
  sources: string[]
  /** Nœuds de droite, de haut en bas. */
  targets: string[]
  links: SankeyLinkInput[]
}

export interface SankeyOptions {
  /** Bord gauche des nœuds de gauche. */
  sourceX: number
  /** Bord gauche des nœuds de droite. */
  targetX: number
  nodeWidth: number
  top: number
  bottom: number
  /** Espace minimal entre deux nœuds d'une même colonne. */
  nodePadding: number
  /** En dessous de cette valeur, un flux garde sa place dans les nœuds mais n'est pas dessiné. */
  minDrawnValue: number
  /**
   * Liseré laissé entre deux rubans voisins (px) : retiré du tracé seulement, jamais des épaisseurs ni des
   * positions, et au plus la moitié de l'épaisseur d'un ruban.
   */
  linkGap?: number
}

export interface SankeyNode {
  id: string
  /** Rang dans sa colonne, après retrait des nœuds vides. */
  index: number
  value: number
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface SankeyLink extends SankeyLinkInput {
  /** Épaisseur du ruban (valeur × échelle). */
  width: number
  /** Haut du ruban au départ (nœud de gauche). */
  y0: number
  /** Haut du ruban à l'arrivée (nœud de droite). */
  y1: number
  /** Faux pour un flux négligeable : sa place reste comptée, mais aucun ruban n'est tracé. */
  drawn: boolean
  /** Contour du ruban, liseré déduit. */
  path: string
}

export interface SankeyLayout {
  sources: SankeyNode[]
  targets: SankeyNode[]
  links: SankeyLink[]
  /** Pixels par unité de valeur, commune aux deux colonnes. */
  scale: number
}

const EPS = 1e-9
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)
const round = (v: number) => Math.round(v * 100) / 100

/**
 * Positions des nœuds et des rubans. La hauteur d'un nœud est la somme de ses flux (les valeurs nulles,
 * négatives ou non finies sont ignorées ; un nœud sans flux disparaît). L'échelle est la même à gauche et
 * à droite : la colonne la plus chargée en nœuds garde l'espacement minimal, l'autre répartit la hauteur
 * restante entre ses nœuds. Au départ, les rubans suivent l'ordre des nœuds de droite ; à l'arrivée,
 * celui des nœuds de gauche, ce qui limite les croisements.
 */
export function layoutSankey(input: SankeyInput, o: SankeyOptions): SankeyLayout {
  const sourceIds = new Set(input.sources)
  const targetIds = new Set(input.targets)
  const valid = input.links.filter(
    (l) => Number.isFinite(l.value) && l.value > 0 && sourceIds.has(l.source) && targetIds.has(l.target),
  )
  const valued = (ids: string[], key: 'source' | 'target') =>
    ids
      .map((id) => ({ id, value: sum(valid.filter((l) => l[key] === id).map((l) => l.value)) }))
      .filter((n) => n.value > 0)
  const left = valued(input.sources, 'source')
  const right = valued(input.targets, 'target')

  const height = Math.max(0, o.bottom - o.top)
  const fit = (col: { value: number }[]) =>
    col.length === 0
      ? Infinity
      : Math.max(0, height - o.nodePadding * (col.length - 1)) / sum(col.map((n) => n.value))
  const fitted = Math.min(fit(left), fit(right))
  const scale = Number.isFinite(fitted) ? fitted : 0

  const column = (col: { id: string; value: number }[], x0: number): SankeyNode[] => {
    const free = height - scale * sum(col.map((n) => n.value))
    const gap = col.length > 1 ? free / (col.length - 1) : 0
    let y = o.top + (col.length > 1 ? 0 : free / 2)
    return col.map((n, index) => {
      const node = { ...n, index, x0, x1: x0 + o.nodeWidth, y0: y, y1: y + n.value * scale }
      y = node.y1 + gap
      return node
    })
  }
  const sources = column(left, o.sourceX)
  const targets = column(right, o.targetX)
  const sourceOf = new Map(sources.map((n) => [n.id, n]))
  const targetOf = new Map(targets.map((n) => [n.id, n]))

  const links = valid.map((l) => ({
    ...l,
    width: l.value * scale,
    y0: 0,
    y1: 0,
    drawn: l.value >= o.minDrawnValue,
    path: '',
  }))
  const stack = (nodes: SankeyNode[], key: 'source' | 'target', order: (l: SankeyLink) => number) => {
    for (const node of nodes) {
      let y = node.y0
      for (const l of links.filter((x) => x[key] === node.id).sort((p, q) => order(p) - order(q))) {
        if (key === 'source') l.y0 = y
        else l.y1 = y
        y += l.width
      }
    }
  }
  stack(sources, 'source', (l) => targetOf.get(l.target)!.index)
  stack(targets, 'target', (l) => sourceOf.get(l.source)!.index)
  for (const l of links) {
    const inset = Math.min((o.linkGap ?? 0) / 2, l.width / 4)
    l.path = ribbonPath(o.sourceX + o.nodeWidth, l.y0 + inset, o.targetX, l.y1 + inset, l.width - 2 * inset)
  }

  return { sources, targets, links, scale }
}

/**
 * Ruban plein d'épaisseur verticale `width`, de (x0, y0) à (x1, y1) (haut du ruban à chaque bout) : deux
 * courbes de Bézier cubiques aux tangentes horizontales, points de contrôle au milieu.
 */
export function ribbonPath(x0: number, y0: number, x1: number, y1: number, width: number): string {
  const xm = round((x0 + x1) / 2)
  const [a, b, c, d] = [x0, x1, y0, y1].map(round) as [number, number, number, number]
  const [cw, dw] = [round(y0 + width), round(y1 + width)]
  return `M${a},${c}C${xm},${c} ${xm},${d} ${b},${d}L${b},${dw}C${xm},${dw} ${xm},${cw} ${a},${cw}Z`
}

/**
 * Regroupe les suites d'au moins deux éléments consécutifs de valeur inférieure à `threshold` ; les autres
 * restent seuls. L'ordre est conservé.
 */
export function groupSmall<T>(items: T[], value: (item: T) => number, threshold: number): T[][] {
  const groups: T[][] = []
  let run: T[] = []
  const flush = () => {
    if (run.length >= 2) groups.push(run)
    else groups.push(...run.map((item) => [item]))
    run = []
  }
  for (const item of items) {
    if (value(item) < threshold) run.push(item)
    else {
      flush()
      groups.push([item])
    }
  }
  flush()
  return groups
}

export interface LabelRequest {
  id: string
  /** Position souhaitée du centre de l'étiquette (centre du nœud). */
  anchor: number
  height: number
  /** Les étiquettes prioritaires sont placées d'abord ; les autres sont masquées faute de place. */
  priority: number
}

export interface PlacedLabel {
  id: string
  anchor: number
  y0: number
  y1: number
}

export interface LabelOptions {
  top: number
  bottom: number
  /** Espace minimal entre deux étiquettes. */
  gap: number
  /** Décalage maximal du centre d'une étiquette par rapport à son ancre. */
  maxShift: number
}

/**
 * Étiquettes sans chevauchement, au plus près de leur ancre. On les ajoute par priorité décroissante ;
 * une étiquette qui ferait sortir le groupe des bornes ou décaler une étiquette de plus de `maxShift` est
 * masquée (son contenu reste dans l'infobulle et le tableau). Résultat dans l'ordre des ancres.
 */
export function placeLabels(
  requests: LabelRequest[],
  o: LabelOptions,
): { placed: PlacedLabel[]; hidden: string[] } {
  const accepted: LabelRequest[] = []
  const hidden: string[] = []
  for (const r of [...requests].sort((p, q) => q.priority - p.priority)) {
    const trial = arrange([...accepted, r], o)
    if (trial && trial.every((p) => Math.abs((p.y0 + p.y1) / 2 - p.anchor) <= o.maxShift + EPS))
      accepted.push(r)
    else hidden.push(r.id)
  }
  return { placed: arrange(accepted, o) ?? [], hidden }
}

/**
 * Placement en une dimension : chaque étiquette part de sa position idéale ; deux groupes qui se
 * chevauchent fusionnent et se calent sur la moyenne de leurs positions idéales (ce qui minimise la somme
 * des carrés des décalages), dans les bornes. Null si les étiquettes ne tiennent pas dans la hauteur.
 */
function arrange(requests: LabelRequest[], o: LabelOptions): PlacedLabel[] | null {
  const items = [...requests].sort((p, q) => p.anchor - q.anchor)
  if (sum(items.map((r) => r.height)) + o.gap * Math.max(0, items.length - 1) > o.bottom - o.top + EPS)
    return null
  interface Cluster {
    items: LabelRequest[]
    offsets: number[]
    height: number
    start: number
  }
  const clamp = (start: number, h: number) => Math.min(Math.max(start, o.top), o.bottom - h)
  const clusters: Cluster[] = []
  for (const item of items) {
    let c: Cluster = {
      items: [item],
      offsets: [0],
      height: item.height,
      start: clamp(item.anchor - item.height / 2, item.height),
    }
    for (
      let prev = clusters.at(-1);
      prev && prev.start + prev.height + o.gap > c.start + EPS;
      prev = clusters.at(-1)
    ) {
      clusters.pop()
      const shift = prev.height + o.gap
      const merged = [...prev.items, ...c.items]
      const offsets = [...prev.offsets, ...c.offsets.map((off) => off + shift)]
      const height = shift + c.height
      const ideal = sum(merged.map((r, i) => r.anchor - r.height / 2 - offsets[i]!)) / merged.length
      c = { items: merged, offsets, height, start: clamp(ideal, height) }
    }
    clusters.push(c)
  }
  return clusters.flatMap((c) =>
    c.items.map((r, i) => ({
      id: r.id,
      anchor: r.anchor,
      y0: c.start + c.offsets[i]!,
      y1: c.start + c.offsets[i]! + r.height,
    })),
  )
}
