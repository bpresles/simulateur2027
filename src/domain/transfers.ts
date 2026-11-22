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

/** Préréglages historiques et tendanciels de la force du front républicain (0 = effacé, 0,75 = 2022, 1 = 2017). */
export const REPUBLICAN_FRONT_PRESETS: Record<RepublicanFrontPreset, RepublicanFrontSettings> = {
  none: { centerRight: 0, moderateLeft: 0, lfi: 0 },
  eroded2027: { centerRight: 0.55, moderateLeft: 0.5, lfi: 0.35 },
  level2022: { centerRight: 0.75, moderateLeft: 0.75, lfi: 0.75 },
  level2017: { centerRight: 1, moderateLeft: 1, lfi: 1 },
}

export function defaultRepublicanFront(): RepublicanFrontSettings {
  return { ...REPUBLICAN_FRONT_PRESETS.eroded2027 }
}

export function profileFamily(profileId: ProfileId): RepublicanFrontFamily {
  if (profileId === 'lfi_rn') return 'lfi'
  if (profileId === 'ecolo_ps_pcf_rn') return 'moderateLeft'
  return 'centerRight'
}

export function frontStrengthForProfile(profileId: ProfileId, rf: RepublicanFrontSettings): number {
  return clamp(rf[profileFamily(profileId)], 0, 1)
}

/** Force du front républicain applicable à un duel résolu (null hors duel face au RN). */
export function frontStrengthForDuel(duel: ResolvedDuel, rf: RepublicanFrontSettings): number | null {
  if (duel.kind !== 'rn-sourced' || duel.profileWeights.length === 0) return null
  const totalWeight = duel.profileWeights.reduce((s, w) => s + w.weight, 0)
  if (totalWeight <= 0) return null
  const sum = duel.profileWeights.reduce((s, w) => s + frontStrengthForProfile(w.profileId, rf) * w.weight, 0)
  return clamp(sum / totalWeight, 0, 1)
}

/**
 * Orientation effective des nouveaux votants (abstentionnistes du 1er tour) vers l'adversaire du RN :
 * ancrée au niveau 2022 (F = 0,75 → `baseShare`, 55 % par défaut), elle revient à 50/50 quand le
 * front républicain est effacé (F = 0) et augmente modérément au niveau 2017 (F = 1).
 */
export function effectiveAbstainerAntiRnShare(baseShare: number, strength: number | null): number {
  if (strength === null) return 0.5
  return clamp(0.5 + (baseShare - 0.5) * (clamp(strength, 0, 1) / 0.75), 0.2, 0.85)
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
type BlocRelation = 'same' | 'neighbor' | 'opposite' | 'far'

const BLOC_RELATIONS: Record<ProfileId, Record<Exclude<Bloc, 'extreme_droite'>, BlocRelation>> = {
  lfi_rn: { gauche: 'same', centre: 'opposite', droite: 'far' },
  ecolo_ps_pcf_rn: { gauche: 'same', centre: 'neighbor', droite: 'far' },
  ensemble_rn: { gauche: 'opposite', centre: 'same', droite: 'neighbor' },
  lr_rn: { gauche: 'far', centre: 'neighbor', droite: 'same' },
}

/**
 * Transpose une ligne des législatives 2024 en contexte présidentiel et applique la force du front
 * républicain `strength` (1 = niveau barrage fort 2017/2024, 0,75 = niveau 2022, 0 = effacé).
 *
 * Calibrage empirique (sans aucun calage sur les sondages T2 2027) :
 * - À `strength = 1` (barrage fort), les profils `ensemble_rn`, `ecolo_ps_pcf_rn` et `lfi_rn` partent
 *   directement des taux Ipsos-Talan 2024 — qui reflètent déjà la différence de compatibilité entre candidats
 *   (72 % gauche→centre, 54 % centre→PS/écolo, 43 % centre→LFI) sans double pénalité. Seule la ligne
 *   `gauche → lr_rn` (70 % en 2024, presque égale à `gauche → ensemble_rn` en raison des désistements locaux)
 *   reçoit un léger ajustement de distance politique (δ_f = −0,35, δ_r = +0,55) pour rester sous `gauche → centre`.
 * - L'érosion du front républicain `(1 − strength)` reproduit sur `ensemble_rn` l'écart réel entre 2017 (100 %)
 *   et 2022 (75 %, soit ~58,9 % Macron vs 58,55 % réel). Sur les blocs déjà dotés d'un vote RN significatif
 *   (≥ 6 %), le recul du barrage bascule très majoritairement vers l'abstention/blanc (δ_r modéré à +0,15 / +0,10).
 */
export function applyRepublicanFrontRow(
  profileId: ProfileId,
  bloc: Bloc,
  raw2024: TransferValues,
  _transfers: TransfersData,
  strength: number,
): TransferValues {
  if (bloc === 'extreme_droite') return raw2024
  const rel = BLOC_RELATIONS[profileId][bloc]
  if (rel === 'same') return raw2024

  // Seul ajustement d'ancre à F = 1 : éviter que gauche → LR (70 % en 2024) égale gauche → Centre (72 %).
  const anchor =
    profileId === 'lr_rn' && bloc === 'gauche' ? shiftTransferLogit(raw2024, -0.35, 0.55) : raw2024

  const erosion = 1 - clamp(strength, 0, 1)
  if (erosion === 0) return { ...anchor }
  const df = rel === 'neighbor' ? -0.45 * erosion : rel === 'opposite' ? -1.35 * erosion : -1.5 * erosion
  const dr = rel === 'neighbor' ? 0.1 * erosion : (anchor.rn < 6 ? 1.4 : 0.15) * erosion
  return shiftTransferLogit(anchor, df, dr)
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
 * 3. Base historique par défaut : législatives 2024 (Ipsos-Talan) transposées en présidentielle d'après
 *    2017–2022 et modulées de façon homogène sur les 4 profils par la force du front républicain.
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
    declaredWeight?: number
  } = {},
): ProfileTable {
  const rnFid = fidelityFor(options.rnId ?? 'lepen', transfers, settings.fidelity)
  const rf = options.republicanFront ?? settings.republicanFront
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

            const base = applyRepublicanFrontRow(
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
