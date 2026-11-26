import { daysBetween } from './pollAverage'
import {
  applyRepublicanFrontRow,
  effectiveProfiles,
  fidelityFor,
  frontStrengthForBloc,
  interpolateExtremeDroite,
  lfiLeftTransferRow,
  nonRnSplit,
  resolveDuel,
} from './transfers'
import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  CandidateId,
  CandidateUncertainty,
  DuelUncertainty,
  FidelitySplit,
  MonteCarloSummary,
  ProfileId,
  ReferencePart,
  Settings,
  SimulationData,
  TransferValues,
} from './types'

export const MONTE_CARLO_ITERATIONS = 2000
export const MONTE_CARLO_SEED = 2027

/** Horizon de référence (jours) pour la volatilité de campagne. */
export const CAMPAIGN_REF_DAYS = 156
/**
 * Écart-type de choc de campagne sur l'échelle log-ratio à J−156 (~5 mois), fixé par règle écrite (voir
 * `docs/changelog-methode.md`, v2.2, second amendement du 23/11/2026 à la règle 3) : valeur de la grille 0,30–1,20
 * (pas 0,005) dont la couverture [P10 ; P90] des scores de 1er tour, moyenne simple des élections 2012, 2017 et 2022
 * (dates J−150 à J−24 tous les 14 jours, prévision par défaut), est la plus proche de 80 % ; à égalité, la plus
 * petite. Valeur et diagnostics (CRPS, couverture poolée, leave-one-out) : `src/data/sigma-calibration.json`, produit
 * par `scripts/calibrate-sigma.ts` (à relancer si les données historiques ou le moteur changent). Limites : la
 * couverture tous points confondus n'est que de ≈ 69 % (2012 ne compte qu'une date, toujours couverte) et le
 * leave-one-out est instable ; l'erreur de centrage par candidat n'est pas modélisée (voir
 * `docs/plan-incertitude-par-candidat.md`).
 */
export const SIGMA_CAMPAIGN_REF = 0.825
/** Plancher d'erreur de sondage (dernière semaine avant le scrutin, ~1,5–2,5 pts). */
export const SIGMA_POLLING_FLOOR = 0.14
/** Concentration Dirichlet des lignes de reports de 2nd tour (κ = 40 → ±5 à 7 pts). */
const DIRICHLET_CONCENTRATION = 40
/** Degrés de liberté Student-t (queues modérément épaisses, bornées à ±3,5 σ pour éviter les valeurs extrêmes). */
const STUDENT_DF = 8
const STUDENT_CAP = 3.5

const PROFILE_IDS: readonly ProfileId[] = ['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn']
const BLOC_INDEX: Record<Bloc, number> = { gauche: 0, centre: 1, droite: 2, extreme_droite: 3 }
const PROFILE_INDEX: Record<ProfileId, number> = { lfi_rn: 0, ecolo_ps_pcf_rn: 1, ensemble_rn: 2, lr_rn: 3 }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** PRNG déterministe rapide (Mulberry32) : mêmes entrées → résultats strictement identiques. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Générateur normal standard (Marsaglia polar, met en cache la seconde valeur). */
function createNormalSampler(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u: number
    let v: number
    let s: number
    do {
      u = rng() * 2 - 1
      v = rng() * 2 - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const mul = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * mul
    return u * mul
  }
}

/** Tirage Gamma(alpha, 1) par Marsaglia & Tsang (2000). */
function sampleGamma(alpha: number, rng: () => number, nextNormal: () => number): number {
  if (alpha <= 0) return 0
  if (alpha < 1) {
    const u = Math.max(1e-12, rng())
    return sampleGamma(alpha + 1, rng, nextNormal) * u ** (1 / alpha)
  }
  const d = alpha - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  while (true) {
    let x = nextNormal()
    let v = 1 + c * x
    while (v <= 0) {
      x = nextNormal()
      v = 1 + c * x
    }
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Tirage Student-t(df) normalisé à variance unitaire, borné à ±STUDENT_CAP. */
function sampleUnitStudentT(df: number, rng: () => number, nextNormal: () => number): number {
  const z = nextNormal()
  const chi2 = 2 * sampleGamma(df / 2, rng, nextNormal)
  const t = (z / Math.sqrt(chi2 / df)) * Math.sqrt((df - 2) / df)
  return clamp(t, -STUDENT_CAP, STUDENT_CAP)
}

function sampleDirichlet3(
  p1: number,
  p2: number,
  p3: number,
  kappa: number,
  rng: () => number,
  nextNormal: () => number,
): [number, number] {
  const g1 = p1 > 1e-4 ? sampleGamma((p1 / 100) * kappa, rng, nextNormal) : 0
  const g2 = p2 > 1e-4 ? sampleGamma((p2 / 100) * kappa, rng, nextNormal) : 0
  const g3 = p3 > 1e-4 ? sampleGamma((p3 / 100) * kappa, rng, nextNormal) : 0
  const total = g1 + g2 + g3
  if (total <= 0) return [p1 / 100, p2 / 100]
  return [g1 / total, g2 / total]
}

function sampleTriangular(min: number, max: number, mode: number, u: number): number {
  if (max <= min) return min
  const m = clamp(mode, min, max)
  const fc = (m - min) / (max - min)
  if (u < fc) return min + Math.sqrt(u * (max - min) * (m - min))
  return max - Math.sqrt((1 - u) * (max - min) * (max - m))
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = clamp(q, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

/** Clé canonique d'un duel : le candidat mieux classé en base en premier. */
export function duelKey(a: CandidateId, b: CandidateId, rankOf: Map<CandidateId, number>): [CandidateId, CandidateId, string] {
  const ra = rankOf.get(a) ?? 999
  const rb = rankOf.get(b) ?? 999
  return ra <= rb ? [a, b, `${a}|${b}`] : [b, a, `${b}|${a}`]
}

export interface CandidacyScenario {
  id: string
  weight: number
  scores: Record<CandidateId, number>
}

export interface MonteCarloInput {
  data: SimulationData
  settings: Settings
  baseScores: Record<CandidateId, number>
  candidatesById: Map<CandidateId, Candidate>
  minorTransfers: Record<CandidateId, ReferencePart[]>
  blankNullShare: number
  displayedDuel: [CandidateId, CandidateId]
  /** Scénarios de candidatures pondérés optionnels (quand `candidacyUncertaintyEnabled` est activé). */
  candidacyScenarios?: CandidacyScenario[]
  /** Surcharges de dates (utilisées par le backtest de couverture sur 2017 et 2022). */
  asOfOverride?: string
  electionDateOverride?: string
  iterations?: number
  seed?: number
  /** Surcharge de `SIGMA_CAMPAIGN_REF` (calibration de la couverture dans le backtest). */
  sigmaCampaignRefOverride?: number
  /** Renvoie aussi les tirages de score de 1er tour par candidat (`firstRoundSamples`), pour le calcul du CRPS. */
  returnSamples?: boolean
  /**
   * N'évalue pas le 2nd tour (calage de σ sur le 1er tour uniquement) : les tirages de 1er tour ne dépendent
   * alors que de la graine et de σ, donc sont strictement communs à toutes les valeurs de σ.
   * Les champs `topDuels` et `displayedDuel` du résultat ne sont pas significatifs dans ce mode.
   */
  firstRoundOnly?: boolean
}

/**
 * Simulation Monte-Carlo déterministe (2 000 tirages) propageant :
 * - au 1er tour : tirage optionnel du scénario de candidatures, puis chocs de campagne Student-t(8) de moyenne
 *   nulle en log-ratio (σ_ref = 0,825 à J−156, voir `SIGMA_CAMPAIGN_REF`), décomposés en choc de bloc (50 %), vote utile intra-bloc à somme
 *   nulle (30 %) et choc idiosyncrasique (20 %), dont la variance décroît linéairement jusqu'au scrutin ;
 * - au 2nd tour : incertitude Dirichlet(κ = 40) sur les matrices de reports, incertitude sur la position
 *   2022 ↔ 2024 du front républicain par électorat, tirage triangulaire du report gauche hors LFI → Mélenchon
 *   sur sa plage dédiée (35–75 % par défaut) centré sur la position du curseur gauche, participation P,
 *   mobilisation a et orientation q des abstentionnistes, fidélité des finalistes (±2,5 pts) et choc commun
 *   national η (σ = 3,0 pts face au RN, 2,0 pts hors RN).
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloSummary {
  const {
    data,
    settings,
    baseScores,
    candidatesById,
    minorTransfers,
    blankNullShare,
    displayedDuel,
    candidacyScenarios,
  } = input
  const iterations = input.iterations ?? MONTE_CARLO_ITERATIONS
  const seed = input.seed ?? MONTE_CARLO_SEED
  const rng = mulberry32(seed)
  const nextNormal = createNormalSampler(rng)

  const idSet = new Set(Object.keys(baseScores))
  if (candidacyScenarios) {
    for (const sc of candidacyScenarios) for (const id of Object.keys(sc.scores)) idSet.add(id)
  }
  const activeIds = [...idSet].sort((x, y) => (baseScores[y] ?? 0) - (baseScores[x] ?? 0))
  const n = activeIds.length
  const indexOf = new Map(activeIds.map((id, i) => [id, i]))
  const rnId = data.polls.candidates.find((c) => c.isRN)?.id ?? 'lepen'

  const refAsOf = input.asOfOverride ?? data.polls.asOf
  const refElectionDate = input.electionDateOverride ?? data.polls.electionDate
  const daysToElection = Math.max(0, daysBetween(refAsOf, refElectionDate))
  const sigmaLogit = Math.sqrt(
    (input.sigmaCampaignRefOverride ?? SIGMA_CAMPAIGN_REF) ** 2 * (daysToElection / CAMPAIGN_REF_DAYS) + SIGMA_POLLING_FLOOR ** 2,
  )
  const sdBloc = sigmaLogit * Math.sqrt(0.5)
  const sdIntra = sigmaLogit * Math.sqrt(0.3)
  const sdIdio = sigmaLogit * Math.sqrt(0.2)

  const baseLog = new Float64Array(n)
  const basePresent = new Uint8Array(n)
  const blocIdx = new Int8Array(n)
  const baseFidHist: FidelitySplit[] = new Array(n)
  const baseFidDeclRn: FidelitySplit[] = new Array(n)
  const baseFidDeclNonRn: FidelitySplit[] = new Array(n)
  const minorIdx: (readonly { idx: number; weight: number }[] | null)[] = new Array(n)
  const blocMembers: number[][] = [[], [], [], []]

  for (let i = 0; i < n; i++) {
    const id = activeIds[i]!
    const c = candidatesById.get(id)
    const sc = baseScores[id]
    basePresent[i] = sc !== undefined && sc > 0 ? 1 : 0
    baseLog[i] = Math.log(Math.max(1e-5, (sc ?? 0) / 100))
    const bi = c?.bloc ? BLOC_INDEX[c.bloc] : -1
    blocIdx[i] = bi
    if (bi >= 0) blocMembers[bi]!.push(i)
    baseFidHist[i] = fidelityFor(id, data.transfers, settings.fidelity)
    baseFidDeclRn[i] = fidelityFor(id, data.transfers, settings.fidelity, {
      declaredTransfers: data.declaredTransfers,
      transferSource: 'declared2027',
      isRnDuel: true,
      isRnFinalist: Boolean(c?.isRN),
    })
    baseFidDeclNonRn[i] = fidelityFor(id, data.transfers, settings.fidelity, {
      declaredTransfers: data.declaredTransfers,
      transferSource: 'declared2027',
      isRnDuel: false,
      isRnFinalist: false,
    })
    const parts = minorTransfers[id]
    minorIdx[i] = parts ? parts.filter((p) => indexOf.has(p.id)).map((p) => ({ idx: indexOf.get(p.id)!, weight: p.weight })) : null
  }

  // Pré-calcul des scénarios de candidatures pondérés si fournis
  const compiledScenarios = (() => {
    if (!candidacyScenarios || candidacyScenarios.length === 0) return null
    const totalW = candidacyScenarios.reduce((s, x) => s + Math.max(0, x.weight), 0)
    if (totalW <= 0) return null
    let cum = 0
    return candidacyScenarios
      .filter((x) => x.weight > 0)
      .map((x) => {
        cum += x.weight / totalW
        const logs = new Float64Array(n)
        const present = new Uint8Array(n)
        for (let i = 0; i < n; i++) {
          const v = x.scores[activeIds[i]!]
          present[i] = v !== undefined && v > 0 ? 1 : 0
          logs[i] = Math.log(Math.max(1e-5, (v ?? 0) / 100))
        }
        return { cum, logs, present }
      })
  })()

  const baseDeclProfiles = effectiveProfiles(
    data.transfers,
    data.declaredTransfers,
    { ...settings, transferSource: 'declared2027' },
    { rnId },
  )
  const rawProfilesById = Object.fromEntries(data.transfers.profiles.map((p) => [p.id, p])) as Record<
    ProfileId,
    (typeof data.transfers.profiles)[number]
  >

  const duelCache = new Map<number, { kind: 0 | 1 | 2; challengerIsA: boolean; prof: number }>()
  const resolveFast = (ai: number, bi: number) => {
    const key = ai * 128 + bi
    let cached = duelCache.get(key)
    if (!cached) {
      const r = resolveDuel(activeIds[ai]!, activeIds[bi]!, candidatesById)
      cached = {
        kind: r.kind === 'rn-sourced' ? 0 : r.kind === 'non-rn-presidential' ? 1 : 2,
        challengerIsA: r.challengerId === activeIds[ai],
        prof: r.profileWeights[0] ? PROFILE_INDEX[r.profileWeights[0].profileId] : -1,
      }
      duelCache.set(key, cached)
    }
    return cached
  }

  const nonRnSameSide = data.transfers.nonRnPresidential
  const sameSideCache = new Map<number, [number, number]>()
  const sameSideSplit = (vBloc: number, bA: number, bB: number): [number, number] => {
    const key = (vBloc + 1) * 64 + (bA + 1) * 8 + (bB + 1)
    let hit = sameSideCache.get(key)
    if (!hit) {
      const split = nonRnSplit(
        vBloc >= 0 ? BLOCS[vBloc]! : null,
        bA >= 0 ? BLOCS[bA]! : null,
        bB >= 0 ? BLOCS[bB]! : null,
        nonRnSameSide,
      )
      hit = [split.toA / 100, split.toB / 100]
      sameSideCache.set(key, hit)
    }
    return hit
  }

  const scoreSamples: Float64Array[] = Array.from({ length: n }, () => new Float64Array(iterations))
  const qualifCounts = new Int32Array(n)
  const winCounts = new Int32Array(n)
  const duelStats = new Map<string, { a: CandidateId; b: CandidateId; aScores: number[]; aWins: number }>()
  const displayedScores = new Float64Array(iterations)
  let displayedAWins = 0

  const dispAIdx = indexOf.get(displayedDuel[0]) ?? 0
  const dispBIdx = indexOf.get(displayedDuel[1]) ?? 1

  const blocShock = new Float64Array(4)
  const intraShock = new Float64Array(n)
  const logits = new Float64Array(n)
  const drawn = new Float64Array(n)
  const rawIntra = new Float64Array(n)
  const profF = new Float64Array(16)
  const profR = new Float64Array(16)
  const profSampledAt = new Int32Array(4).fill(-1)
  const nrLeft = new Float64Array(4)
  const nrRight = new Float64Array(4)
  let nrSampledAt = -1
  const bnClamped = clamp(blankNullShare, 0, 0.5)

  const ensureProfile = (p: number, iter: number, rfShock: number, wDecl: number, lfiLeftU: number, edU: number) => {
    if (profSampledAt[p] === iter) return
    profSampledAt[p] = iter
    const pid = PROFILE_IDS[p]!
    const rawProfile = rawProfilesById[pid]
    for (let b = 0; b < 4; b++) {
      const bloc = BLOCS[b]!
      const strength = clamp(frontStrengthForBloc(bloc, settings.republicanFront) + rfShock, 0, 1)
      const override = settings.transferOverrides[pid]?.[bloc]
      const rawRow = rawProfile.rows[bloc]
      let row: TransferValues
      if (override) {
        row = override
      } else if (bloc === 'extreme_droite') {
        // S4 : tirage uniforme entre les deux bornes présidentielles admissibles R1.8 (2017 NDA et 2022 Zemmour).
        row = interpolateExtremeDroite(data.transfers, edU)
      } else if (settings.transferSource === 'declared2027') {
        row = baseDeclProfiles[pid][bloc]
      } else {
        const shifted = applyRepublicanFrontRow(pid, bloc, rawRow, data.transfers, strength)
        if (pid === 'lfi_rn' && bloc === 'gauche') {
          const rate = sampleTriangular(lfiLeftMin, lfiLeftMax, shifted.finalist, lfiLeftU)
          row = lfiLeftTransferRow(rate, data.transfers, data.declaredTransfers)
        } else {
          row = shifted
        }
        if (settings.transferSource === 'blend') {
          const decl = baseDeclProfiles[pid][bloc]
          row = {
            finalist: row.finalist * (1 - wDecl) + decl.finalist * wDecl,
            rn: row.rn * (1 - wDecl) + decl.rn * wDecl,
            abstention: row.abstention * (1 - wDecl) + decl.abstention * wDecl,
          }
        }
      }
      const [f, r] = sampleDirichlet3(row.finalist, row.rn, row.abstention, DIRICHLET_CONCENTRATION, rng, nextNormal)
      profF[p * 4 + b] = f
      profR[p * 4 + b] = r
    }
  }

  const ensureNonRn = (iter: number) => {
    if (nrSampledAt === iter) return
    nrSampledAt = iter
    for (let b = 0; b < 4; b++) {
      const row = nonRnSameSide.leftVsCenterRight[BLOCS[b]!]
      const [l, r] = sampleDirichlet3(row.left, row.right, row.abstention, DIRICHLET_CONCENTRATION, rng, nextNormal)
      nrLeft[b] = l
      nrRight[b] = r
    }
  }

  const pickFidelity = (idx: number, isRnDuel: boolean, wDecl: number): FidelitySplit => {
    if (settings.transferSource === 'legislatives2024' || settings.fidelity !== null) return baseFidHist[idx]!
    const decl = isRnDuel ? baseFidDeclRn[idx]! : baseFidDeclNonRn[idx]!
    if (settings.transferSource === 'declared2027') return decl
    const hist = baseFidHist[idx]!
    return {
      loyal: hist.loyal * (1 - wDecl) + decl.loyal * wDecl,
      cross: hist.cross * (1 - wDecl) + decl.cross * wDecl,
      abstention: hist.abstention * (1 - wDecl) + decl.abstention * wDecl,
    }
  }

  const evalPairFast = (
    ai: number,
    bi: number,
    iter: number,
    rfShock: number,
    wDecl: number,
    lfiLeftU: number,
    edU: number,
    scale: number,
    nonExpressed1: number,
    mob: number,
    qDelta: number,
    fidDeltaA: number,
    fidDeltaB: number,
    commonShockRn: number,
    commonShockNonRn: number,
  ): number => {
    const d = resolveFast(ai, bi)
    if (d.kind === 0) ensureProfile(d.prof, iter, rfShock, wDecl, lfiLeftU, edU)
    else if (d.kind === 1) ensureNonRn(iter)

    const isRnDuel = d.kind === 0
    const fidA0 = pickFidelity(ai, isRnDuel, wDecl)
    const fidB0 = pickFidelity(bi, isRnDuel, wDecl)
    const loyalA = clamp(fidA0.loyal + fidDeltaA, 80, 99)
    const restA = 100 - loyalA
    const baseRestA = fidA0.cross + fidA0.abstention
    const crossA = baseRestA > 0 ? (restA * fidA0.cross) / baseRestA : 0

    const loyalB = clamp(fidB0.loyal + fidDeltaB, 80, 99)
    const restB = 100 - loyalB
    const baseRestB = fidB0.cross + fidB0.abstention
    const crossB = baseRestB > 0 ? (restB * fidB0.cross) / baseRestB : 0

    const fALoyal = loyalA / 100
    const fACross = crossA / 100
    const fBLoyal = loyalB / 100
    const fBCross = crossB / 100

    const bA = blocIdx[ai]!
    const bB = blocIdx[bi]!
    const aIsLeft = bA === 0
    const pBase = d.prof * 4

    const addBlocFlow = (share: number, vb: number): [number, number] => {
      if (d.kind === 0) {
        let rf: number
        let rr: number
        if (vb >= 0) {
          rf = profF[pBase + vb]!
          rr = profR[pBase + vb]!
        } else {
          rf = (profF[pBase]! + profF[pBase + 1]! + profF[pBase + 2]! + profF[pBase + 3]!) * 0.25
          rr = (profR[pBase]! + profR[pBase + 1]! + profR[pBase + 2]! + profR[pBase + 3]!) * 0.25
        }
        return d.challengerIsA ? [share * rf, share * rr] : [share * rr, share * rf]
      }
      if (d.kind === 1) {
        let rl: number
        let rr: number
        if (vb >= 0) {
          rl = nrLeft[vb]!
          rr = nrRight[vb]!
        } else {
          rl = (nrLeft[0]! + nrLeft[1]! + nrLeft[2]! + nrLeft[3]!) * 0.25
          rr = (nrRight[0]! + nrRight[1]! + nrRight[2]! + nrRight[3]!) * 0.25
        }
        return aIsLeft ? [share * rl, share * rr] : [share * rr, share * rl]
      }
      const [sA, sB] = sameSideSplit(vb, bA, bB)
      return [share * sA, share * sB]
    }

    const addCandFlow = (ci: number, share: number): [number, number] => {
      if (ci === ai) return [share * fALoyal, share * fACross]
      if (ci === bi) return [share * fBCross, share * fBLoyal]
      return addBlocFlow(share, blocIdx[ci]!)
    }

    let totA = 0
    let totB = 0
    for (let i = 0; i < n; i++) {
      const share = drawn[i]! * scale
      const isFin = i === ai || i === bi
      const like = isFin ? null : minorIdx[i]
      if (!like || like.length === 0) {
        const [ta, tb] = addCandFlow(i, share)
        totA += ta
        totB += tb
      } else {
        for (let k = 0; k < like.length; k++) {
          const p = like[k]!
          const [ta, tb] = addCandFlow(p.idx, share * p.weight)
          totA += ta
          totB += tb
        }
      }
    }

    const r1Expr2 = totA + totB
    const qNeutralA = r1Expr2 > 0 ? totA / r1Expr2 : 0.5
    const newVoters = nonExpressed1 * mob
    let qA: number
    if (d.kind === 0 && settings.abstainerAntiRnShare !== null) {
      const antiRnQ = clamp(settings.abstainerAntiRnShare + qDelta, 0.2, 0.85)
      qA = d.challengerIsA ? antiRnQ : 1 - antiRnQ
    } else {
      qA = clamp(qNeutralA + qDelta, 0.2, 0.8)
    }
    totA += newVoters * qA
    totB += newVoters * (1 - qA)

    const expressed2 = totA + totB
    const rawPctA = expressed2 > 0 ? (100 * totA) / expressed2 : 50
    const shock = d.kind === 0 ? (d.challengerIsA ? commonShockRn : -commonShockRn) : commonShockNonRn
    return clamp(rawPctA + shock, 1, 99)
  }

  const [lfiLeftMin, lfiLeftMax] = [
    clamp(Math.min(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1]), 5, 95),
    clamp(Math.max(settings.lfiLeftTransferRange[0], settings.lfiLeftTransferRange[1]), 5, 95),
  ]

  for (let iter = 0; iter < iterations; iter++) {
    let iterLogs = baseLog
    let iterPresent = basePresent
    if (compiledScenarios) {
      const u = rng()
      const picked = compiledScenarios.find((s) => u <= s.cum) ?? compiledScenarios.at(-1)!
      iterLogs = picked.logs
      iterPresent = picked.present
    }

    for (let b = 0; b < 4; b++) blocShock[b] = sampleUnitStudentT(STUDENT_DF, rng, nextNormal) * sdBloc
    for (let b = 0; b < 4; b++) {
      const members = blocMembers[b]!.filter((idx) => iterPresent[idx] === 1)
      const k = members.length
      if (k === 1) {
        intraShock[members[0]!] = 0
      } else if (k > 1) {
        let sum = 0
        for (let j = 0; j < k; j++) {
          const v = sampleUnitStudentT(STUDENT_DF, rng, nextNormal)
          rawIntra[j] = v
          sum += v
        }
        const avg = sum / k
        const mult = Math.sqrt(k / (k - 1)) * sdIntra
        for (let j = 0; j < k; j++) intraShock[members[j]!] = (rawIntra[j]! - avg) * mult
      }
    }

    let maxLogit = -Infinity
    for (let i = 0; i < n; i++) {
      if (iterPresent[i] === 0) {
        logits[i] = -Infinity
        continue
      }
      const bi = blocIdx[i]!
      const s =
        iterLogs[i]! +
        (bi >= 0 ? blocShock[bi]! : 0) +
        (bi >= 0 ? intraShock[i]! : 0) +
        sampleUnitStudentT(STUDENT_DF, rng, nextNormal) * sdIdio
      logits[i] = s
      if (s > maxLogit) maxLogit = s
    }
    let sumExp = 0
    for (let i = 0; i < n; i++) {
      const e = iterPresent[i] === 1 ? Math.exp(logits[i]! - maxLogit) : 0
      drawn[i] = e
      sumExp += e
    }
    const invSum = sumExp > 0 ? 100 / sumExp : 0
    for (let i = 0; i < n; i++) {
      const sc = drawn[i]! * invSum
      drawn[i] = sc
      scoreSamples[i]![iter] = sc
    }

    let firstIdx = 0
    let secondIdx = 1
    if (drawn[1]! > drawn[0]!) {
      firstIdx = 1
      secondIdx = 0
    }
    for (let i = 2; i < n; i++) {
      const sc = drawn[i]!
      if (sc > drawn[firstIdx]!) {
        secondIdx = firstIdx
        firstIdx = i
      } else if (sc > drawn[secondIdx]!) {
        secondIdx = i
      }
    }
    qualifCounts[firstIdx]! += 1
    qualifCounts[secondIdx]! += 1
    if (input.firstRoundOnly) continue

    const normalRfShock = clamp(nextNormal() * 0.25, -0.5, 0.5)
    // Préréglage « incertain » : tirage uniforme commun U[0 ; 1] (le curseur vaut 0,5, donc position = U).
    // Le tirage supplémentaire n'a lieu que dans ce mode : les autres préréglages gardent leur flux aléatoire.
    const rfShock = settings.republicanFront.uncertain ? rng() - 0.5 : normalRfShock
    const wDecl = clamp(settings.declaredWeight + (rng() - 0.5), 0, 1)
    const lfiLeftU = rng()
    const edU = rng()
    const turnout = clamp(settings.firstRoundTurnout + (rng() * 10 - 5), 55, 88)
    const expressed1 = turnout * (1 - bnClamped)
    const nonExpressed1 = 100 - expressed1
    const scale = expressed1 / 100
    const mob = clamp(settings.abstainerMobilization + (rng() * 0.17 - 0.085), 0.05, 0.45)
    const qDelta = rng() * 0.16 - 0.08
    const fidDeltaA = rng() * 5 - 2.5
    const fidDeltaB = rng() * 5 - 2.5
    const commonShockRn = nextNormal() * 3.0
    const commonShockNonRn = nextNormal() * 2.0

    const canonAIdx = firstIdx <= secondIdx ? firstIdx : secondIdx
    const canonBIdx = firstIdx <= secondIdx ? secondIdx : firstIdx
    const aScore = evalPairFast(
      canonAIdx,
      canonBIdx,
      iter,
      rfShock,
      wDecl,
      lfiLeftU,
      edU,
      scale,
      nonExpressed1,
      mob,
      qDelta,
      fidDeltaA,
      fidDeltaB,
      commonShockRn,
      commonShockNonRn,
    )
    const winnerIdx = aScore >= 50 ? canonAIdx : canonBIdx
    winCounts[winnerIdx]! += 1
    const key = `${activeIds[canonAIdx]}|${activeIds[canonBIdx]}`
    let stat = duelStats.get(key)
    if (!stat) {
      stat = { a: activeIds[canonAIdx]!, b: activeIds[canonBIdx]!, aScores: [], aWins: 0 }
      duelStats.set(key, stat)
    }
    stat.aScores.push(aScore)
    if (aScore >= 50) stat.aWins += 1

    const dispScore =
      dispAIdx === canonAIdx && dispBIdx === canonBIdx
        ? aScore
        : dispAIdx === canonBIdx && dispBIdx === canonAIdx
          ? 100 - aScore
          : evalPairFast(
              dispAIdx,
              dispBIdx,
              iter,
              rfShock,
              wDecl,
              lfiLeftU,
              edU,
              scale,
              nonExpressed1,
              mob,
              qDelta,
              fidDeltaA,
              fidDeltaB,
              commonShockRn,
              commonShockNonRn,
            )
    displayedScores[iter] = dispScore
    if (dispScore >= 50) displayedAWins += 1
  }

  const candidates: Record<CandidateId, CandidateUncertainty> = Object.fromEntries(
    activeIds.map((id, i) => {
      const sorted = Array.from(scoreSamples[i]!).sort((x, y) => x - y)
      return [
        id,
        {
          candidateId: id,
          median: quantile(sorted, 0.5),
          p10: quantile(sorted, 0.1),
          p90: quantile(sorted, 0.9),
          qualifProb: (100 * qualifCounts[i]!) / iterations,
          winProb: (100 * winCounts[i]!) / iterations,
        },
      ]
    }),
  )

  const topDuels: DuelUncertainty[] = [...duelStats.entries()]
    .map(([id, s]) => {
      const sorted = s.aScores.sort((x, y) => x - y)
      return {
        id,
        a: s.a,
        b: s.b,
        frequency: (100 * sorted.length) / iterations,
        aWinProb: (100 * s.aWins) / sorted.length,
        aScoreMedian: quantile(sorted, 0.5),
        aScoreP10: quantile(sorted, 0.1),
        aScoreP90: quantile(sorted, 0.9),
      }
    })
    .filter((d) => d.frequency >= 2)
    .sort((x, y) => y.frequency - x.frequency)

  const firstRoundSamples = input.returnSamples
    ? (Object.fromEntries(activeIds.map((id, i) => [id, scoreSamples[i]!])) as Record<CandidateId, Float64Array>)
    : undefined
  const displayedDuelSamples = input.returnSamples ? displayedScores : undefined

  const sortedDisp = Array.from(displayedScores).sort((x, y) => x - y)

  return {
    iterations,
    seed,
    daysToElection,
    sigmaLogit,
    candidates,
    ...(firstRoundSamples ? { firstRoundSamples } : {}),
    ...(displayedDuelSamples ? { displayedDuelSamples } : {}),
    topDuels,
    displayedDuel: {
      a: displayedDuel[0],
      b: displayedDuel[1],
      aWinProb: (100 * displayedAWins) / iterations,
      aScoreMedian: quantile(sortedDisp, 0.5),
      aScoreP10: quantile(sortedDisp, 0.1),
      aScoreP90: quantile(sortedDisp, 0.9),
    },
  }
}
