// Option B, étape B2 : évaluation complète de P1-bis (règles S1–S5, R1.2-bis, R1.4-bis)
// sur 2012, 2017, 2022 et législatives 2024, sans modifier le moteur par défaut ni calculer 2027 (R1.5-bis).
// Usage : bun scripts/evaluate-p1-bis.ts [--json]
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { computeP1BisReport } from '../src/domain/secondRoundP1Bis'
import type { P1BisPresidentialEval, P1BisVariantBlock } from '../src/domain/secondRoundP1Bis'

const fmtSigned = (n: number, digits = 2) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits).replace('.', ',')}`
const fmtNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

const report = computeP1BisReport(simulationData, secondRoundReferenceMatrices)

function fmtEval(e: P1BisPresidentialEval) {
  return (
    `Macron ${fmtNum(e.predictedAntiRnPct)} % (${fmtSigned(e.errorPts)} pt) | ` +
    `vol. M ${fmtNum(e.totals.a)} % (${fmtSigned(e.errVolA)}) | ` +
    `vol. LP ${fmtNum(e.totals.b)} % (${fmtSigned(e.errVolB)}) | ` +
    `expr2 ${fmtNum(e.expressed2)} % (${fmtSigned(e.errExpr2)}) | q=${fmtNum(e.endogenousQPct, 1)} %`
  )
}

function printVariantBlock(block: P1BisVariantBlock) {
  console.log(`\n--- ${block.label} ---`)
  for (const year of ['2017', '2022'] as const) {
    const s = block.inSampleStrictMeasuredFid[year]
    console.log(
      `  [Strict fid. mesurée ${year}] ${fmtEval(s.eval)} → ${s.check.passed ? 'R1.2-bis STRICT OK' : `KO (${s.check.violations.join(' ; ')})`}`,
    )
  }
  for (const year of ['2017', '2022'] as const) {
    console.log(`  [Neutre S3 en éch.   ${year}] ${fmtEval(block.inSampleNeutral[year])}`)
  }
  console.log(
    `  [Neutre S3 + ED poolée]    2017: ${fmtSigned(block.inSampleNeutralPooledEd['2017'].errorPts)} pt | ` +
      `2022: ${fmtSigned(block.inSampleNeutralPooledEd['2022'].errorPts)} pt`,
  )
  const cm = block.crossNeutral.metrics
  console.log(
    `  [Croisé neutre S3]         2017: ${fmtSigned(cm.err2017)} | 2022: ${fmtSigned(cm.err2022)} | ` +
      `biais=${fmtSigned(cm.signedBiasPts)} | pire=${fmtNum(cm.worstAbsErrorPts)} | RMSE=${fmtNum(cm.rmsePts)} | MAE=${fmtNum(cm.maePts)}`,
  )
  const dm = block.crossDiagnosticMeasuredFid.metrics
  console.log(
    `  [Croisé diag. fid. mes.]   2017: ${fmtSigned(dm.err2017)} | 2022: ${fmtSigned(dm.err2022)} | ` +
      `biais=${fmtSigned(dm.signedBiasPts)} | pire=${fmtNum(dm.worstAbsErrorPts)} | RMSE=${fmtNum(dm.rmsePts)} | MAE=${fmtNum(dm.maePts)}`,
  )
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('==================== OPTION B (B2) — ÉVALUATION P1-BIS ====================')

  console.log('\n1. Admissibilité comptable R1.8 des enquêtes (S5 / R1.1-bis) :')
  for (const a of report.admissibility) {
    const status = a.feasible ? 'ADMISSIBLE' : `EXCLUE (${a.violations.join(' ; ')})`
    console.log(`  ${a.surveyId.padEnd(12)} (${a.year}, ${a.institute}) : résidu RN = ${Math.round(a.residualRnVotes).toLocaleString('fr-FR')} voix → ${status}`)
  }

  const m = report.inseeMobilization
  console.log(
    `\n2. Paramètres dérivés des sources (sans ajustement) :\n` +
      `  S1 — Mobilisation Insee ajustée : 2017 = ${fmtNum(m.year2017 * 100)} %, 2022 = ${fmtNum(m.year2022 * 100)} %, moyenne = ${fmtNum(m.mean * 100)} % (défaut = ${fmtNum(m.roundedDefault * 100, 1)} % sur nonExpressed1)\n` +
      `  S3 — Fidélité symétrique neutre (admissibles 2022) : ${fmtNum(report.symmetricFidelity.loyal)} / ${fmtNum(report.symmetricFidelity.cross)} / ${fmtNum(report.symmetricFidelity.abstention)} %\n` +
      `  S4 — Extrême droite hors finaliste (admissibles) : 2017=${fmtNum(report.admissibleEdRow.row2017.finalist, 1)}/${fmtNum(report.admissibleEdRow.row2017.rn, 1)}/${fmtNum(report.admissibleEdRow.row2017.abstention, 1)} | ` +
      `2022=${fmtNum(report.admissibleEdRow.row2022.finalist, 1)}/${fmtNum(report.admissibleEdRow.row2022.rn, 1)}/${fmtNum(report.admissibleEdRow.row2022.abstention, 1)} | ` +
      `moyenne=${fmtNum(report.admissibleEdRow.pooled.finalist)}/${fmtNum(report.admissibleEdRow.pooled.rn)}/${fmtNum(report.admissibleEdRow.pooled.abstention)}`,
  )

  console.log('\n  Lignes de bloc admissibles par année :')
  for (const year of ['2017', '2022'] as const) {
    const rows = report.admissibleBlocRows[year]
    console.log(
      `    ${year} : gauche ${fmtNum(rows.gauche.finalist, 1)}/${fmtNum(rows.gauche.rn, 1)}/${fmtNum(rows.gauche.abstention, 1)} | ` +
        `droite ${fmtNum(rows.droite.finalist, 1)}/${fmtNum(rows.droite.rn, 1)}/${fmtNum(rows.droite.abstention, 1)} | ` +
        `ED ${fmtNum(rows.extreme_droite.finalist, 1)}/${fmtNum(rows.extreme_droite.rn, 1)}/${fmtNum(rows.extreme_droite.abstention, 1)}`,
    )
  }

  const b = report.baseline
  console.log(
    `\n3. Référence v2.2 actuelle :\n` +
      `  En échantillon : 2017 ${fmtSigned(b.inSampleErr2017)} pt | 2022 ${fmtSigned(b.inSampleErr2022)} pt\n` +
      `  Croisé         : 2017 ${fmtSigned(b.cross.err2017)} | 2022 ${fmtSigned(b.cross.err2022)} | biais=${fmtSigned(b.cross.signedBiasPts)} | pire=${fmtNum(b.cross.worstAbsErrorPts)} | RMSE=${fmtNum(b.cross.rmsePts)} | MAE=${fmtNum(b.cross.maePts)}\n` +
      `  Lég. 2024      : MAE=${fmtNum(b.leg2024MaePts)} pt | max=${fmtNum(b.leg2024MaxAbsGapPts)} pt`,
  )

  printVariantBlock(report.primary)
  printVariantBlock(report.diagnosticVariants.r1_1)
  printVariantBlock(report.diagnosticVariants.r1_7_r1_1)

  console.log('\n4. Cohérence agrégée Législatives 2024 (S1 + S2 + S3) :')
  for (const r of report.leg2024.rows) {
    console.log(
      `  ${r.profileId.padEnd(16)} : réel ${fmtNum(r.actualPct)} % | v2.2 ${fmtNum(r.baselinePct)} % (${fmtSigned(r.baselineGapPts)}) → ` +
        `P1-bis ${fmtNum(r.candidatePct)} % (${fmtSigned(r.candidateGapPts)}) | Δ|err|=${fmtSigned(r.absDegradationPts)} | ` +
        `drop ${fmtNum(r.candidateNetDropout, 1)} % (réel ${fmtNum(r.actualNetDropout, 1)} %)`,
    )
  }
  console.log(
    `  Synthèse 2024 : MAE=${fmtNum(report.leg2024.maePts)} pt (v2.2 ${fmtNum(b.leg2024MaePts)}) | ` +
      `max=${fmtNum(report.leg2024.maxAbsGapPts)} pt | max Δ|err|=${fmtSigned(report.leg2024.maxAbsDegradationPts)} pt`,
  )

  const d12 = report.diagnostic2012
  console.log(
    `\n5. Contrôle hors-RN 2012 (Hollande – Sarkozy) :\n` +
      `  Hollande ${fmtNum(d12.predictedHollandePct)} % vs réel ${fmtNum(d12.actualHollandePct)} % (${fmtSigned(d12.errorPts)} pt) | ` +
      `expr2 ${fmtNum(d12.predictedExpressed2Pct)} % vs ${fmtNum(d12.actualExpressed2Pct)} % | ` +
      `drop ${fmtNum(d12.predictedNetDropout, 1)} % vs ${fmtNum(d12.actualNetDropout, 1)} %`,
  )

  console.log('\n==================== VERDICT PRÉ-ENREGISTRÉ P1-BIS ====================')
  console.log(
    `  R1.2-bis (en échantillon) : ${report.r12Bis.passed ? 'OK' : 'ÉCHEC'} ` +
      `[strict 2017:${report.r12Bis.strictMeasured2017Ok ? 'OK' : 'KO'} 2022:${report.r12Bis.strictMeasured2022Ok ? 'OK' : 'KO'} | ` +
      `neutre 2017:${report.r12Bis.neutral2017Ok ? 'OK' : 'KO'} 2022:${report.r12Bis.neutral2022Ok ? 'OK' : 'KO'} amélioré:${report.r12Bis.neutralImprovedBothYears ? 'OK' : 'KO'}]`,
  )
  console.log(
    `  R1.4-bis (croisé & 2024)  : ${report.r14Bis.passed ? 'OK' : 'ÉCHEC'} ` +
      `[biais≤1,5 & signes opp.:${report.r14Bis.signedBiasUnder15AndOpposite ? 'OK' : 'KO'} | ` +
      `pire<8,20:${report.r14Bis.worstCrossReduced ? 'OK' : 'KO'} | ` +
      `RMSE≤5,86:${report.r14Bis.crossRmseNotDegraded ? 'OK' : 'KO'} | ` +
      `leg24:${report.r14Bis.leg2024Ok ? 'OK' : 'KO'}]`,
  )
  console.log(`  VERDICT GLOBAL P1-BIS     : ${report.overallPassed ? 'CRITÈRES SATISFAITS (ADOPTABLE)' : 'CRITÈRES NON SATISFAITS'}`)
}
