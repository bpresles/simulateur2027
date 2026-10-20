// Source des sondages et outils communs : instituts harmonisés, candidats associés aux identifiants.
import type { Candidate, OtherCandidate } from '../domain/types'

export const FEEDS = {
  wikipedia: {
    label: 'Wikipedia – Liste de sondages sur l’élection présidentielle française de 2027',
    url: 'https://fr.wikipedia.org/w/index.php?title=Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027&action=raw',
    page: 'https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027',
  },
} as const

// ——— Instituts et candidats ———

const INSTITUTES: [RegExp, string][] = [
  [/ifop/i, 'Ifop-Fiducial'],
  [/harris|toluna/i, 'Harris Interactive (Toluna)'],
  [/ipsos|bva/i, 'Ipsos BVA'],
  [/elabe/i, 'Elabe'],
  [/odoxa/i, 'Odoxa'],
  [/opinion\s*way/i, 'OpinionWay'],
  [/yougov/i, 'YouGov'],
  [/cluster\s*17/i, 'Cluster17'],
  [/verian|kantar/i, 'Verian'],
  [/\bcsa\b/i, 'CSA'],
  [/viavoice/i, 'Viavoice'],
]

/** Nom harmonisé d'un institut connu, repéré dans un texte. */
export function knownInstitute(text: string): string | undefined {
  return INSTITUTES.find(([re]) => re.test(text))?.[1]
}

/** Nom d'institut harmonisé, pour regrouper les appellations différentes d'un même institut. */
export function canonicalInstitute(name: string): string {
  return knownInstitute(name) ?? name.trim()
}

/** Date ISO d'un jour donné (mois de 0 à 11), ou undefined si ce jour n'existe pas. */
export function isoDate(year: number, month: number, day: number): string | undefined {
  const d = new Date(Date.UTC(year, month, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day
    ? d.toISOString().slice(0, 10)
    : undefined
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Associe les noms de la source aux identifiants du simulateur. Un candidat inconnu est ajouté aux
 * candidats non simulés (il est retiré des hypothèses lors de la moyenne, comme Villepin ou Polony).
 */
export class CandidateResolver {
  private readonly byKey = new Map<string, string>()
  readonly others: OtherCandidate[]

  constructor(candidates: Candidate[], others: OtherCandidate[]) {
    this.others = [...others]
    for (const c of candidates) [c.id, c.name, c.shortName].forEach((k) => this.byKey.set(fold(k), c.id))
    for (const c of others) [c.id, c.name].forEach((k) => this.byKey.set(fold(k), c.id))
  }

  resolve(keys: string[], name: string, newId: string): string {
    for (const k of keys) {
      const id = this.byKey.get(fold(k))
      if (id) return id
    }
    const id = slugify(newId)
    this.others.push({ id, name })
    ;[id, name, ...keys].forEach((k) => this.byKey.set(fold(k), id))
    return id
  }
}

export const pollId = (institute: string, end: string) => `${slugify(institute)}-${end.replaceAll('-', '')}`
