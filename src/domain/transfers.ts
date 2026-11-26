import { BLOCS } from './types'
import type {
  Bloc,
  Candidate,
  CandidateId,
  DeclaredTransferRow,
  DeclaredTransfersData,
  FidelitySplit,
  MinorTransfer,
  ProfileId,
  ProfileWeight,
  ReferencePart,
  RepublicanFrontBloc,
  RepublicanFrontPreset,
  RepublicanFrontSettings,
  ResolvedDuel,
  Settings,
  TransferValues,
  TransfersData,
} from './types'

export type ProfileTable = Record<ProfileId, Record<Bloc, TransferValues>>

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

/**
 * Préréglages du front républicain : interpolation directe entre deux repères mesurés :
 * - `pres2022` (0 %) : niveau des enquêtes « jour du vote » de la présidentielle 2022 ;
 * - `midpoint` (50 %) : mi-chemin entre 2022 et 2024 ;
 * - `leg2024` (100 %) : niveau direct de l'enquête Ipsos-Talan des législatives 2024 ;
 * - `uncertain` : position 50 % à l'affichage, tirée uniformément dans [0 ; 1] (commune aux 3 électorats) à chaque
 *   itération Monte-Carlo (aucune ancre ne permet de trancher entre 2022 et 2024).
 */
export const REPUBLICAN_FRONT_PRESETS: Record<RepublicanFrontPreset, RepublicanFrontSettings> = {
  pres2022: { gauche: 0, centre: 0, droite: 0 },
  midpoint: { gauche: 0.5, centre: 0.5, droite: 0.5 },
  leg2024: { gauche: 1, centre: 1, droite: 1 },
  uncertain: { gauche: 0.5, centre: 0.5, droite: 0.5, uncertain: true },
}

/** Défaut provisoire : législatives 2024 (100 %), seule enquête mesurant directement les 4 paires de finalistes. */
export function defaultRepublicanFront(): RepublicanFrontSettings {
  return { ...REPUBLICAN_FRONT_PRESETS.leg2024 }
}

/** Plage d'incertitude Monte-Carlo [35 ; 75 %] sur le report gauche hors LFI → Mélenchon (non mesuré en présidentielle). */
export const DEFAULT_LFI_LEFT_TRANSFER_RANGE: [number, number] = [35, 75]

/** Position du front républicain (0 = Prés. 2022, 1 = Lég. 2024) pour un électorat éliminé du 1er tour. */
export function frontStrengthForBloc(bloc: Bloc, rf: RepublicanFrontSettings): number {
  if (bloc === 'extreme_droite') return 1
  return clamp(rf[bloc], 0, 1)
}

/**
 * Blocs d'électeurs éliminés modulés par le front républicain sur un profil :
 * - sur `lfi_rn` et `ecolo_ps_pcf_rn`, la gauche est scindée en deux familles distinctes, donc les électeurs de gauche
 *   hors finaliste (ex. gauche hors LFI sur LFI – RN) sont modulés au même titre que le centre et la droite ;
 * - sur `ensemble_rn` (`gauche`, `droite`) et `lr_rn` (`gauche`, `centre`), le bloc du finaliste reste invariant.
 */
export function eliminatedBlocsForProfile(profileId: ProfileId): RepublicanFrontBloc[] {
  if (profileId === 'lfi_rn' || profileId === 'ecolo_ps_pcf_rn') return ['gauche', 'centre', 'droite']
  if (profileId === 'ensemble_rn') return ['gauche', 'droite']
  return ['gauche', 'centre']
}

/** Position moyenne du front républicain (0 = Prés. 2022, 1 = Lég. 2024) des électorats éliminés d'un duel RN (null hors RN). */
export function frontStrengthForDuel(duel: ResolvedDuel, rf: RepublicanFrontSettings): number | null {
  if (duel.kind !== 'rn-sourced' || duel.profileWeights.length === 0) return null
  const totalWeight = duel.profileWeights.reduce((s, w) => s + w.weight, 0)
  if (totalWeight <= 0) return null
  const sum = duel.profileWeights.reduce((s, w) => {
    const blocs = eliminatedBlocsForProfile(w.profileId)
    const avg = blocs.reduce((acc, b) => acc + frontStrengthForBloc(b, rf), 0) / blocs.length
    return s + avg * w.weight
  }, 0)
  return clamp(sum / totalWeight, 0, 1)
}

/**
 * Orientation effective des nouveaux votants (non-exprimés du 1er tour) vers l'adversaire du RN :
 * - `null` (défaut neutre S2) : mode endogène, les nouveaux votants suivent le partage T2 des exprimés du 1er tour ;
 * - valeur numérique manuelle : appliquée dans un duel face au RN (`clamp` dans [0,20 ; 0,85]), `null` (neutre) hors RN.
 */
export function effectiveAbstainerAntiRnShare(baseShare: number | null, strength: number | null): number | null {
  if (baseShare === null || strength === null) return null
  return clamp(baseShare, 0.2, 0.85)
}

/**
 * Interpolation linéaire entre les deux bornes présidentielles admissibles R1.8 pour l'extrême droite hors finaliste :
 * `u = 0` → Dupont-Aignan 2017 (`ipsos_2017` : 27/30/43), `u = 1` → Zemmour 2022 (`r1_1` : 9,5/75,5/15).
 */
export function interpolateExtremeDroite(transfers: TransfersData, u: number): TransferValues {
  const row2017 = transfers.presidentialCenterRn.elections['2017'].extreme_droite
  const row2022 = transfers.presidentialCenterRn.elections['2022'].extreme_droite
  return mixValues(row2017, row2022, u)
}

function mixValues(a: TransferValues, b: TransferValues, weightB: number): TransferValues {
  const w = clamp(weightB, 0, 1)
  return {
    finalist: a.finalist * (1 - w) + b.finalist * w,
    rn: a.rn * (1 - w) + b.rn * w,
    abstention: a.abstention * (1 - w) + b.abstention * w,
  }
}

/** Déplacement logit multinomial (par rapport à l'abstention), préservant strictement [0 ; 100] et la somme à 100. */
export function shiftTransferLogit(row: TransferValues, deltaFinalist: number, deltaRn: number): TransferValues {
  const eps = 1e-4
  const pf = Math.max(eps, row.finalist / 100)
  const pr = Math.max(eps, row.rn / 100)
  const pa = Math.max(eps, row.abstention / 100)
  const uf = Math.log(pf) + deltaFinalist
  const ur = Math.log(pr) + deltaRn
  const ua = Math.log(pa)
  const m = Math.max(uf, ur, ua)
  const ef = Math.exp(uf - m)
  const er = Math.exp(ur - m)
  const ea = Math.exp(ua - m)
  const z = ef + er + ea
  return {
    finalist: (100 * ef) / z,
    rn: (100 * er) / z,
    abstention: (100 * ea) / z,
  }
}

/** Distance politique entre un électorat éliminé et le profil du finaliste opposé au RN. */
type BlocRelation = 'same' | 'neighbor' | 'opposite'

const BLOC_RELATIONS: Record<ProfileId, Record<Exclude<Bloc, 'extreme_droite'>, BlocRelation>> = {
  lfi_rn: { gauche: 'opposite', centre: 'opposite', droite: 'opposite' },
  ecolo_ps_pcf_rn: { gauche: 'opposite', centre: 'neighbor', droite: 'opposite' },
  ensemble_rn: { gauche: 'opposite', centre: 'same', droite: 'neighbor' },
  lr_rn: { gauche: 'opposite', centre: 'neighbor', droite: 'same' },
}

export function logitDelta(from: TransferValues, to: TransferValues): { df: number; dr: number } {
  const eps = 1e-4
  const df =
    Math.log(Math.max(eps, to.finalist) / Math.max(eps, to.abstention)) -
    Math.log(Math.max(eps, from.finalist) / Math.max(eps, from.abstention))
  const dr =
    Math.log(Math.max(eps, to.rn) / Math.max(eps, to.abstention)) -
    Math.log(Math.max(eps, from.rn) / Math.max(eps, from.abstention))
  return { df, dr }
}

/**
 * Interpolation logit linéaire par morceaux entre les 3 ancres triées par position :
 * 2022 (`0`), 2017 (`pos2017`), 2024 (`1`). Aucune extrapolation au-delà des bornes (R2.3).
 */
export function interpolateThreeAnchorsLogit(
  row2022: TransferValues,
  row2017: TransferValues,
  row2024: TransferValues,
  pos2017: number,
  strength: number,
): TransferValues {
  const anchors = [
    { pos: 0, row: row2022 },
    { pos: pos2017, row: row2017 },
    { pos: 1, row: row2024 },
  ].sort((a, b) => a.pos - b.pos)
  const first = anchors[0]!
  const last = anchors[2]!
  const copy = (r: TransferValues): TransferValues => ({
    finalist: r.finalist,
    rn: r.rn,
    abstention: r.abstention,
  })
  if (strength <= first.pos) return copy(first.row)
  if (strength >= last.pos) return copy(last.row)
  const mid = anchors[1]!
  const [lo, hi] = strength <= mid.pos ? [first, mid] : [mid, last]
  const span = hi.pos - lo.pos
  const t = span > 0 ? (strength - lo.pos) / span : 0
  const { df, dr } = logitDelta(lo.row, hi.row)
  return shiftTransferLogit(lo.row, df * t, dr * t)
}

/**
 * Interpolation linéaire par morceaux sur échelle logit entre les trois ancres mesurées (P2, R2.3) :
 * - `strength = 0` (0 %) : enquêtes « jour du vote » admissibles de la présidentielle 2022 ;
 * - `strength = anchor2017Position` (`0,5502`) : enquête admissible de la présidentielle 2017 ;
 * - `strength = 1` (100 %) : enquête Ipsos-Talan des législatives 2024 (`raw2024`).
 *
 * Aucune extrapolation hors des bornes des trois ancres (`[0 ; 1]`).
 * Sur `ensemble_rn`, on interpole directement entre les 3 ancres mesurées.
 * Sur les autres profils (`lfi_rn`, `ecolo_ps_pcf_rn`, `lr_rn`), on applique à `raw2024` le déplacement
 * logit exact entre l'ancre 2024 et la position `strength` sur le bloc de référence de `ensemble_rn`
 * (`gauche` pour `opposite`, `droite` pour `neighbor`). Pour les lignes disposant déjà d'un taux RN élevé
 * en 2024 (≥ 10 %), seul le décalage `df` est appliqué (`dr = 0`) afin de ne pas amplifier artificiellement le vote RN.
 */
export function applyRepublicanFrontRow(
  profileId: ProfileId,
  bloc: Bloc,
  raw2024: TransferValues,
  transfers: TransfersData,
  strength: number,
): TransferValues {
  if (bloc === 'extreme_droite') return raw2024
  const rel = BLOC_RELATIONS[profileId][bloc]
  if (rel === 'same') return raw2024

  if (Math.abs(strength - 1) < 1e-12) {
    return { finalist: raw2024.finalist, rn: raw2024.rn, abstention: raw2024.abstention }
  }

  const ens2024 = transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const ens2022 = transfers.presidentialCenterRn.elections['2022']
  const ens2017 = transfers.presidentialCenterRn.elections['2017']
  const pos2017 = transfers.presidentialCenterRn.anchor2017Position

  if (profileId === 'ensemble_rn') {
    return interpolateThreeAnchorsLogit(ens2022[bloc], ens2017[bloc], raw2024, pos2017, strength)
  }

  const refBloc: 'gauche' | 'droite' = rel === 'opposite' ? 'gauche' : 'droite'
  const ensAtS = interpolateThreeAnchorsLogit(
    ens2022[refBloc],
    ens2017[refBloc],
    ens2024[refBloc],
    pos2017,
    strength,
  )
  const { df, dr } = logitDelta(ens2024[refBloc], ensAtS)
  const appliedDr = raw2024.rn < 10 ? dr : 0
  return shiftTransferLogit(raw2024, df, appliedDr)
}

/**
 * Construit la ligne de report `gauche hors LFI → Mélenchon` (`lfi_rn.gauche`) pour un taux cible `ratePct` (%)
 * en interpolant entre les deux bornes sourcées :
 * - borne haute (`72 %`) : report NFP 2024 (`72 / 3 / 25`) ;
 * - borne basse (`~36 %`) : déclarations 2027 corrigées en logit (`36 / 11 / 53`).
 */
export function lfiLeftTransferRow(
  ratePct: number,
  transfers: TransfersData,
  declaredTransfers: DeclaredTransfersData,
): TransferValues {
  const high = transfers.profiles.find((p) => p.id === 'lfi_rn')!.rows.gauche
  const low = correctDeclaredRowLogit(declaredTransfers.profiles.lfi_rn.gauche, declaredTransfers.logitCorrection)
  const finalist = clamp(ratePct, 5, 95)
  const span = high.finalist - low.finalist
  const t = span > 0 ? clamp((finalist - low.finalist) / span, -0.2, 1.2) : 1
  const rawRn = clamp(low.rn + (high.rn - low.rn) * t, 0, 100 - finalist)
  const abstention = Math.max(0, 100 - finalist - rawRn)
  return { finalist, rn: rawRn, abstention }
}

/**
 * Corrige une ligne de reports déclarés 2027 sur échelle logit multinomial (par rapport à l'abstention) :
 * respecte strictement les bornes [0 ; 100] et évite de déformer les très faibles taux de départ.
 * Les lignes déjà issues d'un repli historique « jour du vote » (ou rattachées à un camp) ne sont pas modifiées.
 */
export function correctDeclaredRowLogit(
  row: DeclaredTransferRow,
  logit: DeclaredTransfersData['logitCorrection'],
): TransferValues {
  if (row.camp || row.historicalFallback) {
    return { finalist: row.finalist, rn: row.rn, abstention: row.abstention }
  }
  return shiftTransferLogit(row, logit.deltaFinalist, logit.deltaRn)
}

/**
 * Applique en duel RN la même correction logit pré-campagne → jour du vote aux fidélités déclarées 2027 (S3).
 * Hors duel RN, la fidélité déclarée est conservée telle quelle.
 */
export function correctDeclaredFidelityLogit(
  fid: FidelitySplit,
  isRnFinalist: boolean,
  isRnDuel: boolean,
  logit: DeclaredTransfersData['logitCorrection'],
): FidelitySplit {
  if (!isRnDuel) return { ...fid }
  if (isRnFinalist) {
    const shifted = shiftTransferLogit(
      { finalist: fid.cross, rn: fid.loyal, abstention: fid.abstention },
      logit.deltaFinalist,
      logit.deltaRn,
    )
    return { loyal: shifted.rn, cross: shifted.finalist, abstention: shifted.abstention }
  }
  const shifted = shiftTransferLogit(
    { finalist: fid.loyal, rn: fid.cross, abstention: fid.abstention },
    logit.deltaFinalist,
    logit.deltaRn,
  )
  return { loyal: shifted.finalist, cross: shifted.rn, abstention: shifted.abstention }
}

export interface FidelitySourceOptions {
  declaredTransfers?: DeclaredTransfersData
  transferSource?: Settings['transferSource']
  declaredWeight?: number
  isRnDuel?: boolean
  isRnFinalist?: boolean
}

/**
 * Fidélité appliquée à un finaliste (S3) :
 * 1. Surcharge manuelle uniforme si définie ;
 * 2. Mode historique (`legislatives2024`, défaut) : fidélité symétrique neutre « jour du vote » (94,75/1,75/3,50 %) ;
 * 3. Mode `declared2027` : fidélités déclarées Harris 2026 corrigées en logit en duel RN ;
 * 4. Mode `blend` : mélange linéaire selon `declaredWeight` entre base historique neutre et déclarations corrigées.
 */
export function fidelityFor(
  candidateId: CandidateId,
  transfers: TransfersData,
  manualFidelity: number | null,
  options: FidelitySourceOptions = {},
): FidelitySplit {
  if (manualFidelity !== null) {
    const loyal = clamp(manualFidelity * 100, 0, 100)
    return { loyal, cross: 0, abstention: 100 - loyal }
  }
  const hist = transfers.fidelity.byCandidate[candidateId] ?? transfers.fidelity.default
  const { declaredTransfers, transferSource } = options
  if (!declaredTransfers || !transferSource || transferSource === 'legislatives2024') {
    return hist
  }
  const rawDecl = declaredTransfers.fidelity.byCandidate[candidateId] ?? declaredTransfers.fidelity.default
  const corrDecl = correctDeclaredFidelityLogit(
    rawDecl,
    Boolean(options.isRnFinalist),
    Boolean(options.isRnDuel),
    declaredTransfers.logitCorrection,
  )
  if (transferSource === 'declared2027') return corrDecl
  const w = clamp(options.declaredWeight ?? 0.5, 0, 1)
  return {
    loyal: hist.loyal * (1 - w) + corrDecl.loyal * w,
    cross: hist.cross * (1 - w) + corrDecl.cross * w,
    abstention: hist.abstention * (1 - w) + corrDecl.abstention * w,
  }
}

/**
 * Profils de reports effectifs au 2nd tour (duels face au RN) :
 * 1. Surcharges manuelles de l'utilisateur (toujours prioritaires).
 * 2. Ligne extrême droite hors finaliste : moyenne mesurée admissible R1.8 (18,25/52,75/29 %, S4).
 * 3. Base historique par défaut : interpolation logit entre Présidentielle 2022 (0 %) et Législatives 2024 (100 %),
 *    pilotée par électorat éliminé (`gauche`, `centre`, `droite`) y compris pour les électeurs de gauche hors LFI
 *    sur `lfi_rn`. L'option `options.lfiLeftTransfer` permet d'évaluer un taux précis sur `lfi_rn.gauche`.
 * 4. Option activable : déclarations 2027 corrigées sur échelle logit (`declared2027`), ou mélange pondéré (`blend`).
 */
export function effectiveProfiles(
  transfers: TransfersData,
  declaredTransfers: DeclaredTransfersData,
  settings: Pick<
    Settings,
    'transferSource' | 'declaredWeight' | 'republicanFront' | 'transferOverrides' | 'fidelity'
  >,
  options: {
    rnId?: CandidateId
    republicanFront?: RepublicanFrontSettings
    /** Surcharge ponctuelle du taux `lfi_rn.gauche` (%) pour l'analyse de sensibilité [35 % ; 75 %]. */
    lfiLeftTransfer?: number
    declaredWeight?: number
  } = {},
): ProfileTable {
  const rf = options.republicanFront ?? settings.republicanFront
  const wDecl = clamp(options.declaredWeight ?? settings.declaredWeight, 0, 1)

  return Object.fromEntries(
    transfers.profiles.map((p) => [
      p.id,
      Object.fromEntries(
        BLOCS.map((b) => {
          const override = settings.transferOverrides[p.id]?.[b]
          if (override) return [b, { ...override }]
          const row = p.rows[b]

          if (settings.transferSource === 'declared2027') {
            return [b, correctDeclaredRowLogit(declaredTransfers.profiles[p.id][b], declaredTransfers.logitCorrection)]
          }

          const strength = frontStrengthForBloc(b, rf)
          const base =
            p.id === 'lfi_rn' && b === 'gauche' && options.lfiLeftTransfer !== undefined
              ? lfiLeftTransferRow(options.lfiLeftTransfer, transfers, declaredTransfers)
              : applyRepublicanFrontRow(
                  p.id,
                  b,
                  { finalist: row.finalist, rn: row.rn, abstention: row.abstention },
                  transfers,
                  strength,
                )

          if (settings.transferSource === 'legislatives2024') return [b, base]
          const decl = correctDeclaredRowLogit(declaredTransfers.profiles[p.id][b], declaredTransfers.logitCorrection)
          return [b, mixValues(base, decl, wDecl)]
        }),
      ),
    ]),
  ) as ProfileTable
}

/** Ligne d'un bloc ; bloc non classé (null) : moyenne des lignes des quatre blocs. */
export function blocRow(rows: Record<Bloc, TransferValues>, bloc: Bloc | null): TransferValues {
  if (bloc) return rows[bloc]
  const avg = (key: keyof TransferValues) => mean(BLOCS.map((b) => rows[b][key]))
  return { finalist: avg('finalist'), rn: avg('rn'), abstention: avg('abstention') }
}

/** Moyenne des lignes de plusieurs profils, pondérée par `weights`. */
export function blendProfiles(table: ProfileTable, weights: ProfileWeight[]): Record<Bloc, TransferValues> {
  return Object.fromEntries(
    BLOCS.map((b) => {
      const row = { finalist: 0, rn: 0, abstention: 0 }
      for (const { profileId, weight } of weights) {
        const source = table[profileId][b]
        row.finalist += source.finalist * weight
        row.rn += source.rn * weight
        row.abstention += source.abstention * weight
      }
      return [b, row]
    }),
  ) as Record<Bloc, TransferValues>
}

/**
 * Détermine la méthode de 2nd tour :
 * - un finaliste RN face à un finaliste doté d'un profil sourcé → `rn-sourced` ;
 * - un duel gauche contre centre ou droite sans RN → `non-rn-presidential` (reports 2007–2012) ;
 * - tout autre duel (ex. deux candidats du même côté) → `non-rn-same-side` (matrice de repli symétrique).
 */
export function resolveDuel(
  aId: CandidateId,
  bId: CandidateId,
  candidatesById: Map<CandidateId, Candidate>,
): ResolvedDuel {
  const a = candidatesById.get(aId)
  const b = candidatesById.get(bId)
  const aRN = Boolean(a?.isRN)
  const bRN = Boolean(b?.isRN)

  if (aRN !== bRN) {
    const [rnId, challengerId] = aRN ? [aId, bId] : [bId, aId]
    const profile = candidatesById.get(challengerId)?.duelProfile
    if (profile) {
      return {
        kind: 'rn-sourced',
        challengerId,
        rnId,
        profileWeights: [{ profileId: profile, weight: 1 }],
      }
    }
  }

  const blocA = a?.bloc ?? null
  const blocB = b?.bloc ?? null
  const isLeft = (bloc: Bloc | null) => bloc === 'gauche'
  const isCenterRight = (bloc: Bloc | null) => bloc === 'centre' || bloc === 'droite'
  if ((isLeft(blocA) && isCenterRight(blocB)) || (isCenterRight(blocA) && isLeft(blocB))) {
    return { kind: 'non-rn-presidential', challengerId: null, rnId: null, profileWeights: [] }
  }

  return { kind: 'non-rn-same-side', challengerId: null, rnId: null, profileWeights: [] }
}

/**
 * Reports pour un duel sans candidat RN :
 * - gauche vs centre/droite : reports sourcés des présidentielles 2007 et 2012 (Ipsos / Ifop) ;
 * - même camp : matrice de repli symétrique documentée.
 */
export function nonRnSplit(
  voterBloc: Bloc | null,
  blocA: Bloc | null,
  blocB: Bloc | null,
  nonRn: TransfersData['nonRnPresidential'],
): { toA: number; toB: number; abstention: number } {
  const voters = voterBloc ? [voterBloc] : BLOCS
  const isLeft = (bloc: Bloc | null) => bloc === 'gauche'
  const isCenterRight = (bloc: Bloc | null) => bloc === 'centre' || bloc === 'droite'

  if ((isLeft(blocA) && isCenterRight(blocB)) || (isCenterRight(blocA) && isLeft(blocB))) {
    const aIsLeft = isLeft(blocA)
    const left = mean(voters.map((v) => nonRn.leftVsCenterRight[v].left))
    const right = mean(voters.map((v) => nonRn.leftVsCenterRight[v].right))
    const abstention = mean(voters.map((v) => nonRn.leftVsCenterRight[v].abstention))
    return { toA: aIsLeft ? left : right, toB: aIsLeft ? right : left, abstention }
  }

  const { sameSide } = nonRn
  const affinity = (target: Bloc | null) =>
    mean(voters.flatMap((v) => (target ? [target] : BLOCS).map((t) => sameSide.affinity[v][t])))
  const abstention = mean(voters.map((v) => sameSide.abstention[v]))
  const affA = affinity(blocA)
  const affB = affinity(blocB)
  const expressed = 100 - abstention
  if (affA + affB <= 0) return { toA: expressed / 2, toB: expressed / 2, abstention }
  return { toA: (expressed * affA) / (affA + affB), toB: (expressed * affB) / (affA + affB), abstention }
}

/** Répartition retenue pour les électeurs d'un petit candidat : choix des réglages, sinon la première. */
export function minorTransfer(c: Candidate, choices: Settings['minorTransfers']): MinorTransfer | null {
  if (!c.minor) return null
  return c.minor.transfers.find((t) => t.id === choices[c.id]) ?? c.minor.transfers[0] ?? null
}

/**
 * Électorats principaux que suivent, au 2nd tour, les électeurs de chaque petit candidat, poids ramenés
 * à un total de 1.
 */
export function minorTransferParts(
  candidates: Candidate[],
  choices: Settings['minorTransfers'],
): Record<CandidateId, ReferencePart[]> {
  return Object.fromEntries(
    candidates.flatMap((c) => {
      const parts = minorTransfer(c, choices)?.parts ?? []
      const total = parts.reduce((s, p) => s + p.weight, 0)
      return total > 0 ? [[c.id, parts.map((p) => ({ id: p.id, weight: p.weight / total }))]] : []
    }),
  )
}
