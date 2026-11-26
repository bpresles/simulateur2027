// P1, étape 3 : sélection des corrections selon R1.3, R1.12 et R1.14, et évaluation complète de R1.4
// (avec les variantes R1.6 et R1.7), sans modifier aucun réglage par défaut.
// Usage : bun scripts/step3-evaluation.ts [--json]
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { ALL_REPRODUCTION_VARIANTS } from '../src/domain/secondRoundReproduction'
import { computeStep3Report } from '../src/domain/secondRoundStep3'
import type { R14EvaluationResult } from '../src/domain/secondRoundStep3'

const fmtSigned = (n: number, digits = 2) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits).replace('.', ',')}`
const fmtNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

const report = computeStep3Report(simulationData, secondRoundReferenceMatrices)

function printEvalLine(label: string, r: R14EvaluationResult) {
  const verdict = r.r14Passed ? 'R1.4 ADOPTÉ' : 'R1.4 ÉCHOUÉ'
  const flags = [
    `éch≤1:${r.conditions.inSampleBothUnder1Pt ? 'OK' : 'KO'}`,
    `croisé:${r.conditions.crossMeanNotDegraded ? 'OK' : 'KO'}`,
    `leg24:${r.conditions.leg2024StableWithin05Pt ? 'OK' : 'KO'}`,
  ].join(' ')
  console.log(
    `  ${label.padEnd(16)} | éch 2017: ${fmtNum(r.inSample['2017'].predictedAntiRnPct)} (${fmtSigned(r.inSample['2017'].errorPts)}) ` +
      `2022: ${fmtNum(r.inSample['2022'].predictedAntiRnPct)} (${fmtSigned(r.inSample['2022'].errorPts)}) | ` +
      `croisé 2017: ${fmtSigned(r.cross['2017'].errorPts)} 2022: ${fmtSigned(r.cross['2022'].errorPts)} ` +
      `moy|err|=${fmtNum(r.crossMeanAbsErrorPts, 3)} | maxΔ24=${fmtNum(r.leg2024.maxAbsDeltaPts, 3)} | ${flags} → ${verdict}`,
  )
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const b = report.baseline
  console.log('==================== P1 ÉTAPE 3 — ÉVALUATION R1.4 ====================')
  console.log(`Simplifications passant R1.3 (≥ 0,5 pt, hors (f) par R1.11) : ${report.r13SelectedKeys.map((k) => `(${k})`).join(', ')}`)
  console.log(`Simplifications sous le seuil R1.3 : ${report.r13ExcludedByThreshold.map((k) => `(${k})`).join(', ')}`)
  const ed = report.r13ByVariant.r1_1.r114PooledExtremeDroiteRow
  console.log(
    `Ligne R1.14 extrême droite hors finaliste (moyenne simple NDA 2017 + Zemmour 2022) : ${fmtNum(ed.finalist, 2)} / ${fmtNum(ed.rn, 2)} / ${fmtNum(ed.abstention, 2)}`,
  )
  console.log(
    `\nRéférence moteur actuel : éch 2017 ${fmtNum(b.inSample['2017'].predictedAntiRnPct)} (${fmtSigned(b.inSample['2017'].errorPts)}) | ` +
      `éch 2022 ${fmtNum(b.inSample['2022'].predictedAntiRnPct)} (${fmtSigned(b.inSample['2022'].errorPts)}) | ` +
      `croisé 2017 ${fmtSigned(b.cross['2017'].errorPts)} | croisé 2022 ${fmtSigned(b.cross['2022'].errorPts)} | ` +
      `moy|err| croisée = ${fmtNum(b.crossMeanAbsErrorPts, 3)}`,
  )

  console.log('\n--- Correction R1.3 stricte : (b) seul selon R1.14 (critère strict R1.11) ---')
  for (const v of ALL_REPRODUCTION_VARIANTS) {
    printEvalLine(v, report.r13ByVariant[v])
  }
  const r11 = report.r13ByVariant.r1_1
  console.log(
    `  [contrôle ED poolée R1.14 en échantillon] 2017 : ${fmtNum(r11.inSampleWithPooledEd['2017'].predictedAntiRnPct)} (${fmtSigned(r11.inSampleWithPooledEd['2017'].errorPts)}) | ` +
      `2022 : ${fmtNum(r11.inSampleWithPooledEd['2022'].predictedAntiRnPct)} (${fmtSigned(r11.inSampleWithPooledEd['2022'].errorPts)})`,
  )
  console.log(
    `  [contrôle diagnostique hors (f), fidélités mesurées] éch 2017 : ${fmtSigned(r11.diagnosticWithoutF.inSample['2017'].errorPts)} | ` +
      `éch 2022 : ${fmtSigned(r11.diagnosticWithoutF.inSample['2022'].errorPts)} | ` +
      `croisé 2017 : ${fmtSigned(r11.diagnosticWithoutF.cross['2017'].errorPts)} | croisé 2022 : ${fmtSigned(r11.diagnosticWithoutF.cross['2022'].errorPts)} | ` +
      `moy|err| = ${fmtNum(r11.diagnosticWithoutF.crossMeanAbsErrorPts, 3)}`,
  )

  console.log('\n--- Contrôle informatif : (a) + (b) (blocs R1.1 dont Fillon/Jadot + ED R1.14) ---')
  for (const v of ALL_REPRODUCTION_VARIANTS) {
    printEvalLine(v, report.controls.aPlusB[v])
  }

  console.log('\n--- Contrôle informatif : (a) + (b) + (d) (avec a = 0,14, q = 0,59) ---')
  printEvalLine('r1_1', report.controls.aPlusBPlusDR11)
  console.log('  Détail législatives 2024 (a+b+d vs actuel) :')
  for (const row of report.controls.aPlusBPlusDR11.leg2024.rows) {
    console.log(
      `    ${row.profileId.padEnd(16)} : ${fmtNum(row.baselinePct)} → ${fmtNum(row.candidatePct)} (${fmtSigned(row.deltaPts, 3)} pt)`,
    )
  }
}
