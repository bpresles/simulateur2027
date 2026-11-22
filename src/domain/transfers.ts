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
  RepublicanFrontFamily,
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
 * - `leg2024` (100 %) : niveau direct de l'enquête Ipsos-Talan des législatives 2024.
 */
export const REPUBLICAN_FRONT_PRESETS: Record<RepublicanFrontPreset, RepublicanFrontSettings> = {
  pres2022: { centerRight: 0, moderateLeft: 0, lfi: 0 },
  midpoint: { centerRight: 0.5, moderateLeft: 0.5, lfi: 0.5 },
  leg2024: { centerRight: 1, moderateLeft: 1, lfi: 1 },
}

/** Défaut provisoire : législatives 2024 (100 %), seule enquête mesurant directement les 4 types de duels. */
export function defaultRepublicanFront(): RepublicanFrontSettings {
  return { ...REPUBLICAN_FRONT_PRESETS.leg2024 }
}

/** Défaut provisoire du report gauche hors LFI → Mélenchon (72 % = repère 2024) et plage Monte-Carlo [35 ; 75 %]. */
export const DEFAULT_LFI_LEFT_TRANSFER = 72
export const DEFAULT_LFI_LEFT_TRANSFER_RANGE: [number, number] = [35, 75]

export function profileFamily(profileId: ProfileId): RepublicanFrontFamily {
  if (profileId === 'lfi_rn') return 'lfi'
  if (profileId === 'ecolo_ps_pcf_rn') return 'moderateLeft'
  return 'centerRight'
}

export function frontStrengthForProfile(profileId: ProfileId, rf: RepublicanFrontSettings): number {
  return clamp(rf[profileFamily(profileId)], 0, 1)
}

/** Position du front républicain (0 = Prés. 2022, 1 = Lég. 2024) pour un duel résolu (null hors duel RN). */
export function frontStrengthForDuel(duel: ResolvedDuel, rf: RepublicanFrontSettings): number | null {
  if (duel.kind !== 'rn-sourced' || duel.profileWeights.length === 0) return null
  const totalWeight = duel.profileWeights.reduce((s, w) => s + w.weight, 0)
  if (totalWeight <= 0) return null
  const sum = duel.profileWeights.reduce((s, w) => s + frontStrengthForProfile(w.profileId, rf) * w.weight, 0)
  return clamp(sum / totalWeight, 0, 1)
}

/**
 * Orientation effective des nouveaux votants (abstentionnistes du 1er tour) vers l'adversaire du RN :
 * `baseShare` (défaut 55 %, repère 2022) dans un duel face au RN, 50 % hors duel RN.
 */
export function effectiveAbstainerAntiRnShare(baseShare: number, strength: number | null): number {
  if (strength === null) return 0.5
  return clamp(baseShare, 0.2, 0.85)
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
  lfi_rn: { gauche: 'same', centre: 'opposite', droite: 'opposite' },
  ecolo_ps_pcf_rn: { gauche: 'same', centre: 'neighbor', droite: 'opposite' },
  ensemble_rn: { gauche: 'opposite', centre: 'same', droite: 'neighbor' },
  lr_rn: { gauche: 'opposite', centre: 'neighbor', droite: 'same' },
}

function logitDelta(from: TransferValues, to: TransferValues): { df: number; dr: number } {
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
 * Interpolation directe sur échelle logit entre les deux repères mesurés :
 * - `strength = 1` (100 %) : enquête Ipsos-Talan des législatives 2024 (`raw2024`) ;
 * - `strength = 0` (0 %) : transposition au niveau des enquêtes « jour du vote » de la présidentielle 2022
 *   (`transfers.presidentialCenterRn.elections['2022']`), sans coefficients ad hoc ni extrapolation sous 2022.
 *
 * Pour `ensemble_rn`, les deux extrémités sont directement mesurées (`raw2024` et `2022`).
 * Pour les autres profils, on applique à proportion `(1 − strength)` l'écart logit 2024 → 2022 mesuré sur
 * `ensemble_rn` (bloc opposé `gauche` ou bloc voisin `droite`). Pour les lignes disposant déjà d'un taux RN
 * élevé en 2024 (≥ 10 %, ex. centre/droite face à la gauche), seul le recul du barrage `df` est appliqué
 * (`dr = 0` par rapport à l'abstention) afin de ne pas amplifier artificiellement le vote RN.
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

  const w2022 = 1 - clamp(strength, 0, 1)
  if (w2022 === 0) return { ...raw2024 }

  const ens2024 = transfers.profiles.find((p) => p.id === 'ensemble_rn')!.rows
  const ens2022 = transfers.presidentialCenterRn.elections['2022']

  if (profileId === 'ensemble_rn') {
    const target = ens2022[bloc]
    const { df, dr } = logitDelta(raw2024, target)
    return shiftTransferLogit(raw2024, df * w2022, dr * w2022)
  }

  const refBloc: 'gauche' | 'droite' = rel === 'opposite' ? 'gauche' : 'droite'
  const { df, dr } = logitDelta(ens2024[refBloc], ens2022[refBloc])
  const appliedDr = raw2024.rn < 10 ? dr * w2022 : 0
  return shiftTransferLogit(raw2024, df * w2022, appliedDr)
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
 * Les lignes rattachées au camp RN ne sont pas modifiées.
 */
export function correctDeclaredRowLogit(
  row: DeclaredTransferRow,
  logit: DeclaredTransfersData['logitCorrection'],
): TransferValues {
  if (row.camp) return { finalist: row.finalist, rn: row.rn, abstention: row.abstention }
  return shiftTransferLogit(row, logit.deltaFinalist, logit.deltaRn)
}

/** Fidélité appliquée à un finaliste : surcharge manuelle uniforme si définie, sinon fidélité différenciée des données. */
export function fidelityFor(
  candidateId: CandidateId,
  transfers: TransfersData,
  manualFidelity: number | null,
): FidelitySplit {
  if (manualFidelity !== null) {
    const loyal = clamp(manualFidelity * 100, 0, 100)
    return { loyal, cross: 0, abstention: 100 - loyal }
  }
  return transfers.fidelity.byCandidate[candidateId] ?? transfers.fidelity.default
}

/**
 * Profils de reports effectifs au 2nd tour (duels face au RN) :
 * 1. Surcharges manuelles de l'utilisateur (toujours prioritaires).
 * 2. Lignes « camp RN » (Reconquête / DLF) : suivent la fidélité du camp RN.
 * 3. Ligne `lfi_rn.gauche` (gauche hors LFI → Mélenchon) : suit le curseur dédié `lfiLeftTransfer` en base historique.
 * 4. Base historique par défaut : interpolation logit entre Présidentielle 2022 (0 %) et Législatives 2024 (100 %).
 * 5. Option activable : déclarations 2027 corrigées sur échelle logit (`declared2027`), ou mélange pondéré (`blend`).
 */
export function effectiveProfiles(
  transfers: TransfersData,
  declaredTransfers: DeclaredTransfersData,
  settings: Pick<
    Settings,
    'transferSource' | 'declaredWeight' | 'republicanFront' | 'lfiLeftTransfer' | 'transferOverrides' | 'fidelity'
  >,
  options: {
    rnId?: CandidateId
    republicanFront?: RepublicanFrontSettings
    lfiLeftTransfer?: number
    declaredWeight?: number
  } = {},
): ProfileTable {
  const rnFid = fidelityFor(options.rnId ?? 'lepen', transfers, settings.fidelity)
  const rf = options.republicanFront ?? settings.republicanFront
  const lfiLeft = options.lfiLeftTransfer ?? settings.lfiLeftTransfer
  const wDecl = clamp(options.declaredWeight ?? settings.declaredWeight, 0, 1)

  return Object.fromEntries(
    transfers.profiles.map((p) => {
      const strength = frontStrengthForProfile(p.id, rf)
      return [
        p.id,
        Object.fromEntries(
          BLOCS.map((b) => {
            const override = settings.transferOverrides[p.id]?.[b]
            if (override) return [b, { ...override }]
            const row = p.rows[b]
            if (row.camp === 'rn') return [b, { finalist: 0, rn: rnFid.loyal, abstention: 100 - rnFid.loyal }]

            if (settings.transferSource === 'declared2027') {
              return [b, correctDeclaredRowLogit(declaredTransfers.profiles[p.id][b], declaredTransfers.logitCorrection)]
            }

            const base =
              p.id === 'lfi_rn' && b === 'gauche'
                ? lfiLeftTransferRow(lfiLeft, transfers, declaredTransfers)
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
      ]
    }),
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
