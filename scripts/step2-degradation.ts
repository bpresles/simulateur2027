// P1, étape 2 : configuration de référence (contrôle R1.2), dégradations (a), (b), (d), (f)
// dans les deux ordres et borne de (c) (R1.9), docs/plan-front-republicain.md.
// Usage : bun scripts/step2-degradation.ts [--json] [--strict]
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { computeStep2Report } from '../src/domain/secondRoundDegradation'
import { ALL_REPRODUCTION_VARIANTS } from '../src/domain/secondRoundReproduction'
import type { ReferenceMatrixYear } from '../src/domain/types'

const fmtSigned = (n: number, digits = 2) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits).replace('.', ',')}`
const fmtNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

const reports = {
  '2017': computeStep2Report('2017', simulationData.reference2017, secondRoundReferenceMatrices, simulationData.transfers),
  '2022': computeStep2Report('2022', simulationData.reference2022, secondRoundReferenceMatrices, simulationData.transfers),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(reports, null, 2))
} else {
  for (const year of ['2017', '2022'] as const satisfies readonly ReferenceMatrixYear[]) {
    const rep = reports[year]
    const r = rep.reference
    const c = rep.currentEngine
    console.log(`\n==================== ÉTAPE 2 — PRÉSIDENTIELLE ${year} ====================`)
    console.log(
      `Officiel T2 : Macron ${fmtNum(r.actual.antiRnPct)} % exprimés | volumes inscrits : Macron ${fmtNum(r.actual.antiRnVolumePct)} %, Le Pen ${fmtNum(r.actual.rnVolumePct)} %, exprimés ${fmtNum(r.actual.expressed2VolumePct)} %`,
    )
    console.log('\n--- Lignes de bloc R1.9 (petits candidats sans ligne) ---')
    for (const bloc of ['gauche', 'centre', 'droite', 'extreme_droite'] as const) {
      const row = rep.r19BlocRows[bloc]
      console.log(
        `  ${bloc.padEnd(15)} : ${fmtNum(row.antiRn, 1)} / ${fmtNum(row.rn, 1)} / ${fmtNum(row.nonExpressed, 1)}`,
      )
    }

    console.log('\n--- Configuration de référence (a = 0,14, q = 0,59) et contrôle R1.2 (±1 pt) ---')
    for (const variant of ALL_REPRODUCTION_VARIANTS) {
      const v = rep.referenceVariants[variant]
      const verdict = v.r12.passed ? 'R1.2 OK' : `HORS R1.2 (${v.r12.violations.join(' ; ')})`
      console.log(
        `  ${variant.padEnd(15)} : Macron ${fmtNum(v.antiRnPct)} % (${fmtSigned(v.r12.errAntiRnPct)} pt) | ` +
          `vol. M ${fmtNum(v.totals.a)} % (${fmtSigned(v.r12.errAntiRnVolumePct)}) | ` +
          `vol. LP ${fmtNum(v.totals.b)} % (${fmtSigned(v.r12.errRnVolumePct)}) | ` +
          `expr. ${fmtNum(v.expressed2)} % → ${verdict}`,
      )
    }

    console.log('\n--- Diagnostic du résidu sur la configuration de référence R1.1 (% des inscrits) ---')
    const rb = r.residualBreakdown
    console.log(
      `  Petits candidats : Macron +${fmtNum(rb.smallCandidatesA)} %, Le Pen +${fmtNum(rb.smallCandidatesB)} %`,
    )
    console.log(`  Nouveaux votants : Macron +${fmtNum(rb.newVotersA)} %, Le Pen +${fmtNum(rb.newVotersB)} %`)
    console.log(
      `  Résidu moteur    : Macron +${fmtNum(rb.predictedResidualA)} %, Le Pen +${fmtNum(rb.predictedResidualB)} % ` +
        `vs résidu officiel : Macron +${fmtNum(rb.actualResidualA)} %, Le Pen +${fmtNum(rb.actualResidualB)} %`,
    )

    console.log(
      `\n--- Moteur actuel en échantillon : Macron ${fmtNum(c.antiRnPct)} % (${fmtSigned(c.r12.errAntiRnPct)} pt) | ` +
        `vol. M ${fmtNum(c.totals.a)} %, LP ${fmtNum(c.totals.b)} %, expr. ${fmtNum(c.expressed2)} % ---`,
    )
    console.log(
      `Écart total (moteur actuel − référence) : ${fmtSigned(rep.totalDegradationPts)} pt (somme effets ajoutés : ${fmtSigned(rep.sumAddedToReferencePts)} pt)`,
    )

    console.log('\n--- Tableau des dégradations (pts d’exprimés sur la part de Macron) ---')
    for (const d of rep.degradations) {
      console.log(
        `  (${d.key}) ajouté à réf : ${fmtSigned(d.addedToReferencePts, 3).padStart(7)} pt | ` +
          `retiré du moteur actuel : ${fmtSigned(d.removedFromCurrentGainPts, 3).padStart(7)} pt ` +
          `(contrib. : ${fmtSigned(d.contributionAtCurrentPts, 3).padStart(7)} pt) — ${d.label}`,
      )
    }
    console.log(
      `  (c) borne R1.9 : ${rep.boundC.uncoveredVotes.toLocaleString('fr-FR')} / ${rep.boundC.secondRoundExpressed.toLocaleString('fr-FR')} = ${fmtNum(rep.boundC.maxEffectPts)} pts d’exprimés T2`,
    )
  }
}

const r12Failed = (['2017', '2022'] as const).filter((y) => !reports[y].reference.r12.passed)
if (r12Failed.length > 0) {
  console.error(
    `\nARRÊT IMMÉDIAT R1.2 : tolérance ±1 pt non respectée sur la configuration de référence R1.1 pour ${r12Failed.join(', ')}.`,
  )
  if (process.argv.includes('--strict')) process.exitCode = 1
}
