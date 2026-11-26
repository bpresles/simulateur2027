// Script reproductible B4 (P2) : calcul de s_2017 (R2.5), variantes, 3 ancres et leave-one-out R2.4 sur P1-bis.
// Exécution : bun scripts/evaluate-p2.ts
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { evaluateP2Report } from '../src/domain/secondRoundP2'

const r = evaluateP2Report(simulationData, secondRoundReferenceMatrices)

const f = (n: number, d = 2) => n.toFixed(d)
const sgn = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`

console.log('=== P2 (B4) — POSITION s_2017 SUR L’ÉCHELLE LOGIT 2022 (0) ↔ 2024 (1) ===\n')
console.log(
  'Mode fidélité'.padEnd(14),
  'ED'.padEnd(14),
  'Pred(0)'.padStart(8),
  'Pred(0.5)'.padStart(10),
  'Pred(1)'.padStart(8),
  's_2017'.padStart(10),
  'Plus proche'.padStart(12),
  'R2.2 défaut'.padStart(12),
  'Étendue / Pic',
)
for (const e of r.estimates) {
  const sStr = e.s2017 !== null ? f(e.s2017, 3) : `>pic(${f(e.peakOnGrid.pred)})`
  const extra =
    e.s2017 !== null
      ? `[${f(e.scaleBounds[0], 3)} ; ${f(e.scaleBounds[1], 3)}]`
      : `max ${f(e.peakOnGrid.pred)} % à s=${f(e.peakOnGrid.s, 2)}`
  console.log(
    e.fidelityMode.padEnd(14),
    e.edMode.padEnd(14),
    f(e.predAt0).padStart(8),
    f(e.predAt05).padStart(10),
    f(e.predAt1).padStart(8),
    sStr.padStart(10),
    e.closestPreset.padStart(12),
    e.r22Default.padStart(12),
    extra,
  )
}

for (const sc of [r.scenarios.r25MeasuredEd, r.scenarios.r25PooledEd]) {
  console.log(`\n=== SCÉNARIO : ${sc.label} (s_2017 = ${f(sc.s2017, 3)}) ===`)
  for (const s of sc.samples) {
    console.log(
      `  s = ${f(s.s, 3).padStart(5)} | gauche: ${f(s.gauche.finalist, 1)}/${f(s.gauche.rn, 1)}/${f(s.gauche.abstention, 1)} | droite: ${f(s.droite.finalist, 1)}/${f(s.droite.rn, 1)}/${f(s.droite.abstention, 1)} | pred17(S3): ${f(s.pred2017Neutral)} | pred22(S3): ${f(s.pred2022Neutral)}`,
    )
  }
  console.log('  -- Leave-one-out R2.4 --')
  for (const [label, loo] of Object.entries(sc.leaveOneOut)) {
    console.log(`  [${label}]`)
    for (const year of ['2017', '2022'] as const) {
      const y = loo[year]
      const ancStr = Object.entries(y.byAnchor)
        .map(([id, v]) => `${id}: ${f(v.pred)} (${sgn(v.err)})`)
        .join(' | ')
      console.log(
        `    ${year} (réel ${f(y.actualAntiRn)} %, ancres [${y.availableAnchors.join(', ')}], étendue [${f(y.span[0], 3)} ; ${f(y.span[1], 3)}]): ${ancStr}`,
      )
      console.log(
        `       Incertain milieu (s=${f(y.uncertainMidpoint.position, 3)}) : ${f(y.uncertainMidpoint.pred)} (${sgn(y.uncertainMidpoint.err)}) | Moy. U : ${f(y.uncertainMean.pred)} (${sgn(y.uncertainMean.err)}) [plage ${f(y.uncertainMean.min)}–${f(y.uncertainMean.max)}]`,
      )
    }
  }
}

console.log('\n=== CHECK R2.2 → R1.4-bis (moteur P1-bis neutre) ===')
console.log(r.r14BisCheck)
