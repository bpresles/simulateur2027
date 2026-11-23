import { CROSS_BLOC_LEAK, TARGET_CONCENTRATION } from './campaignProjection'
import { simulate } from './simulate'
import type { SimulateOptions } from './simulate'
import { REPUBLICAN_FRONT_PRESETS } from './transfers'
import type { Settings, SimulationData } from './types'

/**
 * Bornes de la fourchette de repères de la mobilisation des abstentionnistes (« ~14–22 % », Ifop 2022 /
 * Insee 2017–2022), telle que documentée dans `SettingsSheet.tsx` (aide du curseur de mobilisation).
 */
const MOBILIZATION_REFERENCE_RANGE = [0.14, 0.22] as const

const fmtPct = (v: number) => `${String(Math.round(v * 1000) / 10).replace('.', ',')}\u202f%`

export interface SensitivityVariant {
  label: string
  /** Score central déterministe de A (% des exprimés) avec la valeur alternative. */
  scoreA: number
  /** Écart à la valeur active (points). */
  delta: number
}

export interface SensitivityRow {
  id: string
  label: string
  /** Valeur active, telle qu'affichée. */
  active: string
  /** Vrai si le réglage n'a aucun effet dans la configuration actuelle (ex. projection désactivée). */
  inactive?: string
  variants: SensitivityVariant[]
}

/**
 * Tableau de sensibilité, sans Monte-Carlo (1 tirage, jamais lu) : pour chaque réglage non mesuré, le score
 * central déterministe du duel affiché avec les valeurs alternatives déjà documentées (changelog v2.2).
 * Chaque ligne ne change qu'un réglage à la fois. Les poids des scénarios de candidatures n'agissent que dans
 * Monte-Carlo : ils n'y figurent donc pas.
 */
export function computeSensitivity(data: SimulationData, settings: Settings): SensitivityRow[] {
  const run = (s: Settings, o: SimulateOptions = {}, d: SimulationData = data) =>
    simulate(d, s, { ...o, monteCarloIterations: 1 })
  const base = run(settings)
  const a = base.secondRound.a
  const b = base.secondRound.b
  const baseA = base.secondRound.pct.a
  const pinned: Settings = { ...settings, selectedDuel: `${a}|${b}` }
  const variant = (label: string, s: Settings, o?: SimulateOptions, d?: SimulationData): SensitivityVariant => {
    const res = run({ ...s, selectedDuel: pinned.selectedDuel }, o, d)
    return { label, scoreA: res.secondRound.pct.a, delta: res.secondRound.pct.a - baseA }
  }
  const rows: SensitivityRow[] = []
  const rf = settings.republicanFront
  const front = (['pres2022', 'midpoint', 'leg2024'] as const)
    .filter((k) => !(['gauche', 'centre', 'droite'] as const).every((x) => REPUBLICAN_FRONT_PRESETS[k][x] === rf[x] && !rf.uncertain))
    .map((k) =>
      variant(
        k === 'pres2022' ? 'Présidentielle 2022 (0 %)' : k === 'midpoint' ? 'Position médiane (50 %)' : 'Législatives 2024 (100 %)',
        { ...pinned, republicanFront: { ...REPUBLICAN_FRONT_PRESETS[k] } },
      ),
    )
  rows.push({
    id: 'front',
    label: 'Front républicain (3 électorats ensemble)',
    active: rf.uncertain ? 'incertain (0,5 en déterministe)' : `${Math.round(rf.gauche * 100)} / ${Math.round(rf.centre * 100)} / ${Math.round(rf.droite * 100)} %`,
    variants: front,
  })
  const projOn = settings.projection.enabled
  rows.push({
    id: 'projection',
    label: 'Projection de campagne vers le 1er tour',
    active: projOn ? 'activée (défaut)' : 'désactivée',
    variants: [
      variant(projOn ? 'Désactivée' : 'Activée (défaut)', {
        ...pinned,
        projection: { ...settings.projection, enabled: !projOn },
      }),
    ],
  })
  const inactive = projOn ? undefined : 'sans effet : projection désactivée'
  const projSettings = pinned
  rows.push({
    id: 'leak',
    label: 'Fuite inter-blocs du vote utile',
    active: String(CROSS_BLOC_LEAK).replace('.', ','),
    inactive,
    variants: projOn ? [0.06, 0.18].map((v) => variant(String(v).replace('.', ','), projSettings, { crossBlocLeak: v })) : [],
  })
  rows.push({
    id: 'centre',
    label: 'Concentration du centre au vote utile',
    active: String(TARGET_CONCENTRATION.centre).replace('.', ','),
    inactive,
    variants: projOn ? [0.65, 0.85].map((v) => variant(String(v).replace('.', ','), projSettings, { projectionTargets: { centre: v } })) : [],
  })
  rows.push({
    id: 'abstainers',
    label: 'Nouveaux votants allant à l’adversaire du RN',
    active: `${Math.round(settings.abstainerAntiRnShare * 100)} %`,
    variants: [0.5].filter((v) => v !== settings.abstainerAntiRnShare).map((v) =>
      variant('50 % (valeur hors duel RN)', { ...pinned, abstainerAntiRnShare: v }),
    ),
  })
  const mobRange = MOBILIZATION_REFERENCE_RANGE
  rows.push({
    id: 'mobilization',
    label: 'Mobilisation des abstentionnistes du 1er tour',
    active: fmtPct(settings.abstainerMobilization),
    variants: mobRange
      .filter((v) => Math.abs(v - settings.abstainerMobilization) > 1e-9)
      .map((v) => variant(`${fmtPct(v)} (repère ${v === mobRange[0] ? 'bas' : 'haut'})`, { ...pinned, abstainerMobilization: v })),
  })
  const uniformFid = settings.fidelity !== null
  const df = data.transfers.fidelity.default
  rows.push({
    id: 'fidelity',
    label: 'Fidélité des électorats finalistes',
    active: uniformFid
      ? `uniforme ${fmtPct(settings.fidelity!)}`
      : `différenciée (Le Pen ${data.transfers.fidelity.byCandidate.lepen?.loyal ?? df.loyal}\u202f%, Mélenchon ${data.transfers.fidelity.byCandidate.melenchon?.loyal ?? df.loyal}\u202f%)`,
    variants: [
      uniformFid
        ? variant('Différenciée par finaliste (données)', { ...pinned, fidelity: null })
        : variant(
            `Uniforme ${df.loyal} / ${String(df.cross).replace('.', ',')} / ${String(df.abstention).replace('.', ',')}\u202f% pour tous`,
            pinned,
            undefined,
            { ...data, transfers: { ...data.transfers, fidelity: { ...data.transfers.fidelity, byCandidate: {} } } },
          ),
    ],
  })
  const lfi = base.secondRound.lfiLeftSensitivity
  if (lfi) {
    const rnIsA = base.secondRound.duel.rnId === a
    const toA = (rn: number) => (rnIsA ? rn : 100 - rn)
    rows.push({
      id: 'lfi-left',
      label: 'Report gauche hors LFI → Mélenchon',
      active: `${lfi.currentRate} %`,
      variants: [
        { label: `${lfi.lowRate} %`, scoreA: toA(lfi.rnAtLow), delta: toA(lfi.rnAtLow) - baseA },
        { label: `${lfi.highRate} %`, scoreA: toA(lfi.rnAtHigh), delta: toA(lfi.rnAtHigh) - baseA },
      ],
    })
  }
  return rows
}
