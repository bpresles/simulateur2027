// Script reproductible P3 : décomposition de variance du 2nd tour, contrôle de double emploi et
// calage conditionnel de σ_η (grille 0 à 5 pts, pas 0,25, LOO R2.4, finalistes R2.5).
// Exécution : bun scripts/evaluate-p3.ts [--write]
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { computeP3Report, serializeP3AuditJson } from '../src/domain/secondRoundP3'
import type { EtaCalibrationCurve } from '../src/domain/secondRoundP3'

const report = computeP3Report(simulationData, secondRoundReferenceMatrices)
if (process.argv.includes('--write')) {
  const outPath = resolve(import.meta.dirname, '../src/data/second-round-p3-audit.json')
  const json = serializeP3AuditJson(report, simulationData.polls.asOf)
  writeFileSync(outPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  console.log(`Écrit : ${outPath}`)
}
const f = (n: number, d = 2) => n.toFixed(d)
const sgn = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`

console.log('=== P3 ÉTAPE 1 — DÉCOMPOSITION DE VARIANCE À 1ER TOUR FIXÉ (N = 2 000, graine 2027) ===\n')
for (const c of report.varianceFixedR1) {
  console.log(
    `${c.label}\n  Base : moy=${f(c.baseline.mean)}% | sd=${f(c.baseline.sd)} | var=${f(c.baseline.variance)} | [P10;P90]=[${f(c.baseline.p10)}; ${f(c.baseline.p90)}] (larg=${f(c.baseline.width80)} pts)`,
  )
  const sorted = [...c.rows].sort((a, b) => b.deltaVar - a.deltaVar)
  for (const row of sorted) {
    if (Math.abs(row.deltaVar) < 0.01 && Math.abs(row.deltaWidth80) < 0.02) continue
    console.log(
      `    - sans ${row.cut.padEnd(10)} : sd=${f(row.stats.sd).padStart(5)} | larg=${f(row.stats.width80).padStart(5)} (Δlarg=${sgn(-row.deltaWidth80).padStart(6)}) | ΔVar=${f(row.deltaVar).padStart(5)} (${f(row.deltaVarPct, 1).padStart(5)} %)`,
    )
  }
}

console.log('\n=== P3 ÉTAPE 1b — PART DU 2ND TOUR ET DE η DANS L’INCERTITUDE TOTALE (CAMPAGNE + 2ND TOUR) ===\n')
for (const row of report.campaignVsSecondRound) {
  console.log(
    `${row.label}\n  Total [P10;P90]=${f(row.fullWidth80)} pts | 2nd tour seul=${f(row.r2OnlyWidth80)} pts (${f(row.r2ShareOfFullVarPct, 1)}% var tot.) | 2nd tour sans η=${f(row.r2OnlyNoEtaWidth80)} pts | η = ${f(row.etaShareOfR2VarPct, 1)}% var T2 (${f(row.etaShareOfFullVarPct, 1)}% var tot.)`,
  )
}

function printCurve(title: string, curve: EtaCalibrationCurve, fullTable = false) {
  console.log(`\n=== ${title} (N=${curve.iterations}) ===`)
  const cur = curve.currentAt3
  console.log(
    `Actuel σ_η=3,00 : 2017 [${f(cur.y2017.p10)}; ${f(cur.y2017.p90)}] (${cur.y2017.covered ? 'OK' : 'KO'}, CRPS ${f(cur.y2017.crps, 3)}) | 2022 [${f(cur.y2022.p10)}; ${f(cur.y2022.p90)}] (${cur.y2022.covered ? 'OK' : 'KO'}, CRPS ${f(cur.y2022.crps, 3)}) | larg moy=${f(cur.meanWidth80)} | CRPS moy=${f(cur.meanCrps, 3)}`,
  )
  if (curve.selected) {
    const s = curve.selected
    console.log(
      `Retenu σ_η=${f(s.sigmaEta, 2)} : 2017 [${f(s.y2017.p10)}; ${f(s.y2017.p90)}] (CRPS ${f(s.y2017.crps, 3)}) | 2022 [${f(s.y2022.p10)}; ${f(s.y2022.p90)}] (CRPS ${f(s.y2022.crps, 3)}) | larg moy=${f(s.meanWidth80)} (${sgn(s.meanWidth80 - cur.meanWidth80)}) | CRPS moy=${f(s.meanCrps, 3)} (${sgn(s.crpsDeltaVs3Pct, 2)} %)`,
    )
  } else {
    console.log('Retenu : AUCUN σ_η dans [0 ; 5] ne couvre simultanément 2017 et 2022.')
  }
  console.log('Critères §5.3 :', curve.adoptionCriteria)
  if (fullTable) {
    console.log('  σ_η  | 2017 [P10;P90] (cov, CRPS)        | 2022 [P10;P90] (cov, CRPS)        | Larg.moy | CRPS moy | ΔCRPS/3')
    for (const g of curve.grid) {
      const m = curve.selected?.sigmaEta === g.sigmaEta ? ' *' : ''
      console.log(
        `  ${f(g.sigmaEta, 2)} | [${f(g.y2017.p10, 1).padStart(4)}; ${f(g.y2017.p90, 1).padStart(4)}] (${g.y2017.covered ? 'OK' : 'KO'}, ${f(g.y2017.crps, 3)}) | [${f(g.y2022.p10, 1).padStart(4)}; ${f(g.y2022.p90, 1).padStart(4)}] (${g.y2022.covered ? 'OK' : 'KO'}, ${f(g.y2022.crps, 3)}) | ${f(g.meanWidth80, 2).padStart(8)} | ${f(g.meanCrps, 3).padStart(8)} | ${sgn(g.crpsDeltaVs3Pct, 2).padStart(6)}%${m}`,
      )
    }
  }
}

printCurve('PRIMAIRE — leg2024 LOO + finalistes mesurés R2.5', report.calibration.primary_leg2024_r25, true)
printCurve('PARALLÈLE — uncertain LOO + finalistes mesurés R2.5', report.calibration.parallel_uncertain_r25, true)
printCurve('CONTRÔLE 10k — leg2024 LOO + R2.5', report.calibration.primary_leg2024_r25_10k, false)
printCurve('CONTRÔLE 10k — uncertain LOO + R2.5', report.calibration.parallel_uncertain_r25_10k, false)
printCurve('COMPARAISON — leg2024 LOO + S3 neutre (94,75/1,75)', report.calibration.comparison_leg2024_s3, true)
printCurve('COMPARAISON — uncertain LOO + S3 neutre (94,75/1,75)', report.calibration.comparison_uncertain_s3, true)
printCurve('COMPARAISON — leg2024 LOO + Harris 2026', report.calibration.comparison_leg2024_harris, false)
printCurve('COMPARAISON — uncertain LOO + Harris 2026', report.calibration.comparison_uncertain_harris, false)

console.log('\n=== HORS RN (2012) ===')
console.log(report.nonRn2012Note)
