import { frozenData as data } from '../test/frozenData'
import { actualRow, actualTransfers, boundAndNormalize, correctedTransfer, correctionUncertainty } from './transferCorrection'
import { allianceSplit2024, effectiveProfiles } from './transfers'
import type { Candidate } from './types'

const { transfers, secondRoundDropout } = data
const profiles = secondRoundDropout.legislatives2024.profiles

describe('correctionUncertainty', () => {
  it('erreurs types des seules lignes corrigées (1,6 à 5,9 points) et circonscriptions des quatre types de duel', () => {
    const u = correctionUncertainty(transfers, secondRoundDropout)
    expect(u.minSe).toBeCloseTo(1.6, 1)
    expect(u.maxSe).toBeCloseTo(5.9, 1)
    expect(u.constituencies).toBe(48 + 104 + 132 + 58)
  })
})

describe('actualTransfers (régression écologique sur les votes réels de 2024)', () => {
  // Valeurs de contrôle : estimation (finaliste / RN / abandon) et erreur type, en %.
  const expected = [
    ['lfi_rn', 'centre', [63.1, 13.3, 23.5], [5.9, 3.5, 5.1]],
    ['lfi_rn', 'droite', [51.3, 21.9, 26.8], [5.2, 3.2, 4.5]],
    ['ecolo_ps_pcf_rn', 'centre', [59.0, 16.4, 24.5], [2.4, 1.6, 2.5]],
    ['ecolo_ps_pcf_rn', 'droite', [58.7, 25.6, 15.7], [3.4, 2.3, 3.6]],
    ['ensemble_rn', 'gauche', [83.3, 6.9, 9.8], [3.8, 3.7, 2.3]],
    ['ensemble_rn', 'droite', [61.5, 33.7, 4.8], [3.7, 3.6, 2.2]],
    ['lr_rn', 'gauche', [89.2, -11.1, 22.0], [3.5, 4.7, 3.1]],
    ['lr_rn', 'centre', [75.2, 25.2, -0.3], [3.3, 4.4, 2.9]],
  ] as const
  it.each(expected)('%s, %s', (id, bloc, est, se) => {
    const a = actualTransfers(profiles[id])[bloc]
    expect(a.estimate.finalist).toBeCloseTo(est[0], 0)
    expect(a.estimate.rn).toBeCloseTo(est[1], 0)
    expect(a.estimate.abstention).toBeCloseTo(est[2], 0)
    expect(a.se.finalist).toBeCloseTo(se[0], 0)
    expect(a.se.rn).toBeCloseTo(se[1], 0)
    expect(a.se.abstention).toBeCloseTo(se[2], 0)
  })
})

describe('bornage et renormalisation', () => {
  it('borne à [0 ; 100] puis ramène à 100', () => {
    const r = boundAndNormalize({ finalist: 89.2, rn: -11.1, abstention: 22 })!
    expect(r.finalist).toBeCloseTo(80.2, 1)
    expect(r.rn).toBe(0)
    expect(r.abstention).toBeCloseTo(19.8, 1)
    expect(r.finalist + r.rn + r.abstention).toBeCloseTo(100, 10)
  })
  it('lr_rn centre : ≈ 74,9 / 25,1 / 0', () => {
    const r = actualRow(profiles.lr_rn, 'centre')!
    expect([r.finalist, r.rn, r.abstention].map((v) => Math.round(v * 10) / 10)).toEqual([74.9, 25.1, 0])
  })
  it('tout nul : pas de ligne', () => {
    expect(boundAndNormalize({ finalist: -1, rn: -2, abstention: 0 })).toBeNull()
  })
})

describe('correctedTransfer', () => {
  const ipsos = transfers.profiles.find((p) => p.id === 'lfi_rn')!.rows.centre
  const at = (k: number) => correctedTransfer(transfers, secondRoundDropout, 'lfi_rn', 'centre', k)!

  it('intensité 0 : valeurs de l’enquête ; 1 : valeurs réelles ; 1,5 : au-delà, bornées et renormalisées', () => {
    expect(at(0)).toEqual({ finalist: ipsos.finalist, rn: ipsos.rn, abstention: ipsos.abstention })
    const actual = actualRow(profiles.lfi_rn, 'centre')!
    expect(at(1).finalist).toBeCloseTo(actual.finalist, 10)
    const r = at(1.5)
    expect(r.finalist).toBeGreaterThan(at(1).finalist)
    expect(r.finalist + r.rn + r.abstention).toBeCloseTo(100, 10)
    for (const v of [r.finalist, r.rn, r.abstention]) expect(v).toBeGreaterThanOrEqual(0)
  })
  it('les blocs du duel (camp d’un finaliste) ne sont pas corrigés', () => {
    expect(correctedTransfer(transfers, secondRoundDropout, 'lfi_rn', 'gauche', 1)).toBeNull()
    expect(correctedTransfer(transfers, secondRoundDropout, 'lfi_rn', 'extreme_droite', 1)).toBeNull()
    expect(correctedTransfer(transfers, secondRoundDropout, 'lr_rn', 'droite', 1)).toBeNull()
  })
})

describe('effectiveProfiles avec correction', () => {
  const correction = { dropout: secondRoundDropout, intensity: 1 }
  it('sans option : profils de l’enquête', () => {
    expect(effectiveProfiles(transfers, {}, 1).lfi_rn.centre).toEqual({ finalist: 43, rn: 19, abstention: 38 })
  })
  it('avec l’option : lignes corrigées hors blocs du duel, camp inchangé', () => {
    const p = effectiveProfiles(transfers, {}, 1, correction)
    expect(p.lfi_rn.centre.finalist).toBeCloseTo(63.1, 0)
    expect(p.lfi_rn.gauche).toEqual({ finalist: 72, rn: 3, abstention: 25 })
  })
  it('une surcharge saisie reste prioritaire sur la correction', () => {
    const override = { finalist: 10, rn: 20, abstention: 70 }
    const p = effectiveProfiles(transfers, { lfi_rn: { centre: override } }, 1, correction)
    expect(p.lfi_rn.centre).toEqual(override)
  })
  it('les taux d’alliance utilisent les profils corrigés', () => {
    const cand = (id: string, bloc: Candidate['bloc'], duelProfile: Candidate['duelProfile']) =>
      ({ id, bloc, duelProfile }) as Candidate
    const leader = cand('philippe', 'centre', 'lfi_rn')
    const joining = cand('x', 'droite', null)
    const raw = allianceSplit2024(leader, joining, effectiveProfiles(transfers, {}, 1))
    const fixed = allianceSplit2024(leader, joining, effectiveProfiles(transfers, {}, 1, correction))
    expect(raw.leader).toBeCloseTo(0.26, 10)
    expect(fixed.leader).toBeCloseTo(0.513, 2)
  })
})
