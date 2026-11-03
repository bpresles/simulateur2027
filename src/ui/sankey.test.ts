import { simulationData } from '../data/schema'
import { defaultSettings, simulate } from '../domain/simulate'
import { groupSmall, layoutSankey, placeLabels, ribbonPath } from './sankey'
import type { SankeyInput, SankeyLayout, SankeyLink, SankeyOptions } from './sankey'

const options: SankeyOptions = {
  sourceX: 100,
  targetX: 500,
  nodeWidth: 10,
  top: 10,
  bottom: 410,
  nodePadding: 6,
  minDrawnValue: 0.05,
}

const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-6)

/** Électorats du 1er tour → finalistes et blanc/abstention, avec les réglages par défaut. */
function defaultInput(): SankeyInput {
  const sr = simulate(simulationData, defaultSettings()).secondRound
  const flows = [...sr.flows].sort((x, y) => y.share - x.share)
  const ordered = [...flows.filter((f) => f.isFinalistVoter), ...flows.filter((f) => !f.isFinalistVoter)]
  return {
    sources: ordered.map((f) => f.candidateId),
    targets: ['a', 'b', 'abstention'],
    links: ordered.flatMap((f) => [
      { source: f.candidateId, target: 'a', value: f.toA },
      { source: f.candidateId, target: 'b', value: f.toB },
      { source: f.candidateId, target: 'abstention', value: f.abstention },
    ]),
  }
}

/** Chaque nœud est exactement rempli par ses rubans, empilés sans trou ni recouvrement. */
function expectConservation(layout: SankeyLayout) {
  for (const [nodes, key, y] of [
    [layout.sources, 'source', 'y0'],
    [layout.targets, 'target', 'y1'],
  ] as const) {
    for (const node of nodes) {
      const links = layout.links.filter((l) => l[key] === node.id).sort((p, q) => p[y] - q[y])
      close(
        links.reduce((s, l) => s + l.width, 0),
        node.y1 - node.y0,
      )
      close(node.value * layout.scale, node.y1 - node.y0)
      let cursor = node.y0
      for (const l of links) {
        close(l[y], cursor)
        cursor += l.width
      }
      close(cursor, node.y1)
    }
  }
}

function expectNoOverlap(layout: SankeyLayout, o: SankeyOptions) {
  for (const column of [layout.sources, layout.targets]) {
    column.forEach((node, i) => {
      expect(node.y0).toBeGreaterThanOrEqual(o.top - 1e-6)
      expect(node.y1).toBeLessThanOrEqual(o.bottom + 1e-6)
      const next = column[i + 1]
      if (next) expect(next.y0 - node.y1).toBeGreaterThanOrEqual(o.nodePadding - 1e-6)
    })
  }
}

describe('mise en page du diagramme de Sankey', () => {
  it('conserve les hauteurs : un nœud mesure la somme de ses rubans, au départ comme à l’arrivée', () => {
    const layout = layoutSankey(defaultInput(), options)
    expect(layout.sources.length).toBeGreaterThan(10)
    expect(layout.targets.map((n) => n.id)).toEqual(['a', 'b', 'abstention'])
    expectConservation(layout)
    // Les voix se conservent : les deux colonnes ont la même hauteur totale, à la même échelle.
    const height = (nodes: { y0: number; y1: number }[]) => nodes.reduce((s, n) => s + n.y1 - n.y0, 0)
    close(height(layout.sources), height(layout.targets))
  })

  it('ne fait se chevaucher aucun nœud et reste dans la hauteur disponible', () => {
    const layout = layoutSankey(defaultInput(), options)
    expectNoOverlap(layout, options)
    // La colonne la plus fournie occupe toute la hauteur avec l’espacement minimal.
    const first = layout.sources[0]!
    const last = layout.sources.at(-1)!
    close(first.y0, options.top)
    close(last.y1, options.bottom)
    // Même serrée, sur un téléphone, la mise en page reste valide.
    const tight = { ...options, top: 0, bottom: 200, nodePadding: 4 }
    const small = layoutSankey(defaultInput(), tight)
    expectNoOverlap(small, tight)
    expectConservation(small)
  })

  it('garde l’ordre des nœuds et, à l’arrivée, empile les rubans dans l’ordre des nœuds de gauche', () => {
    const input = defaultInput()
    const layout = layoutSankey(input, options)
    expect(layout.sources.map((n) => n.id)).toEqual(
      input.sources.filter((id) => layout.sources.some((n) => n.id === id)),
    )
    for (const target of layout.targets) {
      const arriving = layout.links.filter((l) => l.target === target.id).sort((p, q) => p.y1 - q.y1)
      const rank = arriving.map((l) => input.sources.indexOf(l.source))
      expect(rank).toEqual([...rank].sort((p, q) => p - q))
    }
    // Au départ, les rubans suivent l’ordre des nœuds de droite.
    for (const source of layout.sources) {
      const leaving = layout.links.filter((l) => l.source === source.id).sort((p, q) => p.y0 - q.y0)
      const rank = leaving.map((l) => input.targets.indexOf(l.target))
      expect(rank).toEqual([...rank].sort((p, q) => p - q))
    }
  })

  it('ignore les flux nuls, négatifs ou non finis, et retire un nœud sans flux', () => {
    const layout = layoutSankey(
      {
        sources: ['x', 'y', 'vide'],
        targets: ['a', 'b', 'abstention'],
        links: [
          { source: 'x', target: 'a', value: 30 },
          { source: 'x', target: 'b', value: 0 },
          { source: 'x', target: 'abstention', value: 10 },
          { source: 'y', target: 'a', value: -2 },
          { source: 'y', target: 'b', value: 60 },
          { source: 'y', target: 'abstention', value: Number.NaN },
          { source: 'vide', target: 'a', value: 0 },
          { source: 'inconnu', target: 'a', value: 5 },
        ],
      },
      options,
    )
    expect(layout.sources.map((n) => [n.id, n.value])).toEqual([
      ['x', 40],
      ['y', 60],
    ])
    expect(layout.targets.map((n) => [n.id, n.value])).toEqual([
      ['a', 30],
      ['b', 60],
      ['abstention', 10],
    ])
    expect(layout.links).toHaveLength(3)
    expect(layout.links.every((l) => l.width > 0 && Number.isFinite(l.width))).toBe(true)
    expectConservation(layout)
    expectNoOverlap(layout, options)
  })

  it('sans aucun flux, ne dessine rien', () => {
    const layout = layoutSankey(
      { sources: ['x'], targets: ['a'], links: [{ source: 'x', target: 'a', value: 0 }] },
      options,
    )
    expect(layout).toEqual({ sources: [], targets: [], links: [], scale: 0 })
  })

  it('compte la place d’un flux négligeable sans tracer son ruban, sans fausser les totaux', () => {
    const layout = layoutSankey(
      {
        sources: ['x'],
        targets: ['a', 'b'],
        links: [
          { source: 'x', target: 'a', value: 99.97 },
          { source: 'x', target: 'b', value: 0.03 },
        ],
      },
      options,
    )
    const tiny = layout.links.find((l) => l.target === 'b')!
    expect(tiny.drawn).toBe(false)
    expect(tiny.width).toBeGreaterThan(0)
    expect(layout.links.find((l) => l.target === 'a')!.drawn).toBe(true)
    expectConservation(layout)
  })

  it('centre un nœud seul dans sa colonne', () => {
    const layout = layoutSankey(
      {
        sources: ['x', 'y'],
        targets: ['a'],
        links: [
          { source: 'x', target: 'a', value: 50 },
          { source: 'y', target: 'a', value: 50 },
        ],
      },
      options,
    )
    const [a] = layout.targets
    close((a!.y0 + a!.y1) / 2, (options.top + options.bottom) / 2)
    expectNoOverlap(layout, options)
  })

  it('trace chaque ruban avec deux courbes de Bézier cubiques aux tangentes horizontales', () => {
    expect(ribbonPath(10, 20, 110, 60, 5)).toBe('M10,20C60,20 60,60 110,60L110,65C60,65 60,25 10,25Z')
    expect(ribbonPath(0, 1 / 3, 1, 2 / 3, 0.1)).toBe(
      'M0,0.33C0.5,0.33 0.5,0.67 1,0.67L1,0.77C0.5,0.77 0.5,0.43 0,0.43Z',
    )
    const layout = layoutSankey(defaultInput(), options)
    for (const l of layout.links) expect(l.path).toMatch(/^M[\d.,]+C[\d., ]+L[\d.,]+C[\d., ]+Z$/)
  })

  it('retire le liseré entre rubans du tracé seulement', () => {
    const input: SankeyInput = {
      sources: ['x'],
      targets: ['a', 'b'],
      links: [
        { source: 'x', target: 'a', value: 50 },
        { source: 'x', target: 'b', value: 0.1 },
      ],
    }
    const plain = layoutSankey(input, options)
    const gapped = layoutSankey(input, { ...options, linkGap: 2 })
    expect(gapped.links.map((l) => [l.y0, l.y1, l.width])).toEqual(
      plain.links.map((l) => [l.y0, l.y1, l.width]),
    )
    const [big, thin] = gapped.links as [SankeyLink, SankeyLink]
    expect(big.path).toBe(
      ribbonPath(options.sourceX + options.nodeWidth, big.y0 + 1, options.targetX, big.y1 + 1, big.width - 2),
    )
    // Un ruban fin garde au moins la moitié de son épaisseur.
    expect(thin.path).toBe(
      ribbonPath(
        options.sourceX + options.nodeWidth,
        thin.y0 + thin.width / 4,
        options.targetX,
        thin.y1 + thin.width / 4,
        thin.width / 2,
      ),
    )
  })
})

describe('regroupement des petits électorats', () => {
  it('regroupe les suites d’au moins deux éléments sous le seuil, dans l’ordre', () => {
    const groups = groupSmall([5, 0.4, 0.3, 2, 0.2, 0.1, 0.05], (v) => v, 1)
    expect(groups).toEqual([[5], [0.4, 0.3], [2], [0.2, 0.1, 0.05]])
  })

  it('laisse seul un petit élément isolé', () => {
    expect(groupSmall([5, 0.4, 2], (v) => v, 1)).toEqual([[5], [0.4], [2]])
    expect(groupSmall([], (v: number) => v, 1)).toEqual([])
  })
})

describe('placement des étiquettes', () => {
  const labelOptions = { top: 0, bottom: 300, gap: 4, maxShift: 40 }

  function expectSeparated(placed: { y0: number; y1: number }[], o = labelOptions) {
    const sorted = [...placed].sort((p, q) => p.y0 - q.y0)
    sorted.forEach((p, i) => {
      expect(p.y0).toBeGreaterThanOrEqual(o.top - 1e-6)
      expect(p.y1).toBeLessThanOrEqual(o.bottom + 1e-6)
      const next = sorted[i + 1]
      if (next) expect(next.y0 - p.y1).toBeGreaterThanOrEqual(o.gap - 1e-6)
    })
  }

  it('centre une étiquette sur son ancre quand la place le permet', () => {
    const { placed, hidden } = placeLabels(
      [
        { id: 'a', anchor: 50, height: 20, priority: 1 },
        { id: 'b', anchor: 200, height: 20, priority: 1 },
      ],
      labelOptions,
    )
    expect(hidden).toEqual([])
    expect(placed).toEqual([
      { id: 'a', anchor: 50, y0: 40, y1: 60 },
      { id: 'b', anchor: 200, y0: 190, y1: 210 },
    ])
  })

  it('écarte symétriquement deux étiquettes trop proches', () => {
    const { placed } = placeLabels(
      [
        { id: 'a', anchor: 100, height: 20, priority: 1 },
        { id: 'b', anchor: 104, height: 20, priority: 1 },
      ],
      labelOptions,
    )
    expectSeparated(placed)
    const centers = placed.map((p) => (p.y0 + p.y1) / 2)
    close((centers[0]! + centers[1]!) / 2, 102)
  })

  it('reste dans les bornes près des bords', () => {
    const { placed } = placeLabels(
      [
        { id: 'a', anchor: 2, height: 20, priority: 1 },
        { id: 'b', anchor: 298, height: 20, priority: 1 },
      ],
      labelOptions,
    )
    expect(placed.map((p) => [p.y0, p.y1])).toEqual([
      [0, 20],
      [280, 300],
    ])
  })

  it('masque les étiquettes les moins prioritaires plutôt que de les faire se chevaucher ou dériver', () => {
    const requests = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      anchor: 150 + i,
      height: 18,
      priority: 12 - i,
    }))
    const { placed, hidden } = placeLabels(requests, labelOptions)
    expectSeparated(placed)
    expect(placed.length + hidden.length).toBe(12)
    expect(hidden.length).toBeGreaterThan(0)
    // Les plus prioritaires sont gardées, et aucune ne s’éloigne de plus de maxShift de son ancre.
    expect(placed.map((p) => p.id)).toContain('n0')
    for (const p of placed) expect(Math.abs((p.y0 + p.y1) / 2 - p.anchor)).toBeLessThanOrEqual(40 + 1e-6)
    expect(hidden).toContain('n11')
  })

  it('masque tout ce qui ne tient pas dans la hauteur', () => {
    const { placed, hidden } = placeLabels(
      [
        { id: 'a', anchor: 10, height: 30, priority: 2 },
        { id: 'b', anchor: 20, height: 30, priority: 1 },
      ],
      { top: 0, bottom: 40, gap: 4, maxShift: 100 },
    )
    expect(placed.map((p) => p.id)).toEqual(['a'])
    expect(hidden).toEqual(['b'])
  })
})
