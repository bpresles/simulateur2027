import { frozenData as simulationData } from '../test/frozenData'
import { alliancesConflict, applyAlliances, resolveActiveAlliances } from './alliances'
import type { Alliance } from './types'

const alliance: Alliance = { id: 'al', label: 'T rejoint M', members: ['m', 't'], leader: 'm' }
const byId = (id: string) => simulationData.polls.alliances.find((a) => a.id === id)!
const follow = (leader: number, rn = 0) => () => ({ leader, rn })

describe('applyAlliances', () => {
  it('sans alliance active, chaque candidat reste seul', () => {
    const { entrants } = applyAlliances({ m: 20, t: 3, x: 77 }, [alliance], {}, follow(1), null)
    expect(entrants.map((e) => e.id)).toEqual(['x', 'm', 't'])
  })

  it('fusionne les scores et calcule les poids (20 + 3 → 0,87 / 0,13)', () => {
    const { entrants } = applyAlliances({ m: 20, t: 3, x: 77 }, [alliance], { al: true }, follow(1), null)
    const m = entrants.find((e) => e.id === 'm')!
    expect(m.score).toBeCloseTo(23, 8)
    expect(m.allianceIds).toEqual(['al'])
    expect(m.members[0]!.weight).toBeCloseTo(20 / 23, 8)
    expect(m.members[1]!.weight).toBeCloseTo(3 / 23, 8)
    expect(entrants.find((e) => e.id === 't')).toBeUndefined()
  })

  it('la part qui ne suit pas le leader s’abstient : redistribution proportionnelle (total 100)', () => {
    const { entrants } = applyAlliances({ m: 20, t: 4, x: 76 }, [alliance], { al: true }, follow(0.5), null)
    expect(entrants.reduce((s, e) => s + e.score, 0)).toBeCloseTo(100, 8)
    expect(entrants.find((e) => e.id === 'm')!.score).toBeCloseTo((22 * 100) / 98, 8)
    expect(entrants.find((e) => e.id === 'm')!.members[1]!.rate).toBe(0.5)
  })

  it('la part qui vote RN rejoint le score du candidat RN', () => {
    const { entrants, leaks } = applyAlliances(
      { m: 20, t: 10, rn: 30, x: 40 },
      [alliance],
      { al: true },
      follow(0.7, 0.2),
      'rn',
    )
    // m : 20 + 7, rn : 30 + 2, 1 point s'abstient → total 99
    expect(entrants.find((e) => e.id === 'rn')!.score).toBeCloseTo((32 * 100) / 99, 8)
    expect(entrants.find((e) => e.id === 'm')!.score).toBeCloseTo((27 * 100) / 99, 8)
    expect(leaks).toEqual([{ from: 't', to: 'rn', points: expect.closeTo((2 * 100) / 99, 8) }])
  })

  it('sans leader fixe, le mieux placé mène l’alliance', () => {
    const duo: Alliance = { id: 'duo', label: 'P – G', members: ['p', 'g'] }
    expect(applyAlliances({ p: 17, g: 11, x: 72 }, [duo], { duo: true }, follow(1), null).entrants[1]!.id).toBe('p')
    expect(applyAlliances({ p: 9, g: 11, x: 80 }, [duo], { duo: true }, follow(1), null).entrants[1]!.id).toBe('g')
  })

  it('cumule deux alliances qui partagent le même leader', () => {
    const second: Alliance = { id: 'al2', label: 'R rejoint M', members: ['m', 'r'], leader: 'm' }
    const scores = { m: 20, t: 3, r: 2, x: 75 }
    const m = applyAlliances(scores, [alliance, second], { al: true, al2: true }, follow(1), null).entrants[1]!
    expect(m.members.map((x) => x.candidateId)).toEqual(['m', 't', 'r'])
    expect(m.allianceIds).toEqual(['al', 'al2'])
  })
})

describe('incompatibilités entre alliances (données réelles)', () => {
  it('Roussel ne peut rejoindre qu’une seule alliance', () => {
    expect(alliancesConflict(byId('roussel-melenchon'), byId('roussel-glucksmann'))).toBe(true)
  })
  it('Tondelier et Roussel peuvent rejoindre Mélenchon ensemble', () => {
    expect(alliancesConflict(byId('tondelier-melenchon'), byId('roussel-melenchon'))).toBe(false)
  })
  it('Roussel et Philippe peuvent rejoindre Glucksmann ensemble', () => {
    expect(alliancesConflict(byId('roussel-glucksmann'), byId('philippe-glucksmann'))).toBe(false)
  })
  it('Glucksmann ne peut pas rejoindre Philippe et accueillir Roussel', () => {
    expect(alliancesConflict(byId('glucksmann-philippe'), byId('roussel-glucksmann'))).toBe(true)
    expect(alliancesConflict(byId('glucksmann-philippe'), byId('roussel-melenchon'))).toBe(false)
  })
  it('Philippe et Glucksmann ne peuvent pas se rallier l’un à l’autre en même temps', () => {
    expect(alliancesConflict(byId('philippe-glucksmann'), byId('glucksmann-philippe'))).toBe(true)
  })
  it('si deux alliances incompatibles sont actives, la première dans les données l’emporte', () => {
    const scores = { melenchon: 20, roussel: 2, glucksmann: 11, x: 67 }
    const active = { 'roussel-melenchon': true, 'roussel-glucksmann': true }
    expect(resolveActiveAlliances(scores, simulationData.polls.alliances, active).map((a) => a.id)).toEqual([
      'roussel-melenchon',
    ])
  })
})
