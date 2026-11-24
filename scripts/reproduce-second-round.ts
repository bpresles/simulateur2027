// P1, étape 1 : reproduction partielle en voix des seconds tours 2017 et 2022 sans le moteur
// (règles R1.1, R1.6, R1.7 et R1.8, docs/plan-front-republicain.md).
// Usage : bun scripts/reproduce-second-round.ts [--json]
import { secondRoundReferenceMatrices, simulationData } from '../src/data/schema'
import { newVoterRates } from '../src/domain/newVoters'
import {
  ALL_REPRODUCTION_VARIANTS,
  reproduceReferenceElection,
} from '../src/domain/secondRoundReproduction'
import type { PartialReproductionResult, ReproductionVariant } from '../src/domain/secondRoundReproduction'
import type { ReferenceMatrixYear } from '../src/domain/types'

const VARIANT_LABELS: Record<ReproductionVariant, string> = {
  r1_1: 'R1.1 (moyenne Ipsos/Ifop publiés)',
  ipsos_only: 'R1.6 — Ipsos seul (repli Ifop si absent)',
  ifop_only: 'R1.6 — Ifop seul (publié)',
  r1_7_r1_1: 'R1.7 sur R1.1 (non-exprimé Ifop = abstention tableau participation)',
  r1_7_ifop_only: 'R1.7 sur Ifop seul (non-exprimé Ifop = abstention tableau participation)',
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtSignedInt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('fr-FR')}`
const fmtPct = (n: number, digits = 2) => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits).replace('.', ',')} %`

const rates = newVoterRates(simulationData)
const inseeByYear = new Map(rates.insee.map((x) => [String(x.year), x.share]))

const refs = {
  '2017': simulationData.reference2017,
  '2022': simulationData.reference2022,
} as const

const allResults: Record<ReferenceMatrixYear, Record<ReproductionVariant, PartialReproductionResult>> = {
  '2017': Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      reproduceReferenceElection('2017', refs['2017'], secondRoundReferenceMatrices, v),
    ]),
  ) as Record<ReproductionVariant, PartialReproductionResult>,
  '2022': Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      reproduceReferenceElection('2022', refs['2022'], secondRoundReferenceMatrices, v),
    ]),
  ) as Record<ReproductionVariant, PartialReproductionResult>,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ inseeAbstainersVotingPct: Object.fromEntries(inseeByYear), results: allResults }, null, 2))
} else {
  for (const year of ['2017', '2022'] as const) {
    const r11 = allResults[year].r1_1
    const insee = inseeByYear.get(year)
    console.log(`\n==================== PRÉSIDENTIELLE ${year} ====================`)
    console.log(
      `Couverture : ${fmtInt(r11.coveredFirstRoundVotes)} voix (${fmtPct(r11.coveredFirstRoundExpressedPct)} des exprimés T1)`,
    )
    console.log(
      `Petits candidats sans ligne : ${fmtInt(r11.uncoveredCandidatesVotes)} voix (${fmtPct(r11.uncoveredCandidatesExpressedPct)} des exprimés T1)`,
    )
    console.log(
      `Non-exprimés T1 (abstention + blancs/nuls) : ${fmtInt(r11.firstRoundNonExpressedVotes)} (${fmtPct(r11.firstRoundNonExpressedRegisteredPct)} des inscrits T1)`,
    )
    console.log(
      `Population résiduelle T1 : ${fmtInt(r11.residualPopulation)} (${fmtPct(r11.residualPopulationRegisteredPct)} des inscrits T1) ; écart inscrits T2 − T1 : ${fmtSignedInt(r11.registeredDiff)} → pop. résiduelle T2 : ${fmtInt(r11.residualPopulationT2)}`,
    )
    console.log(
      `Officiel T2 : Macron ${fmtInt(r11.officialSecondRound.antiRn)} | Le Pen ${fmtInt(r11.officialSecondRound.rn)} | Non-exprimé ${fmtInt(r11.officialSecondRound.nonExpressed)}`,
    )

    console.log('\n--- Lignes et contributions R1.1 (en voix) ---')
    for (const c of r11.coveredContributions) {
      console.log(
        `  ${c.candidateId.padEnd(14)} T1=${fmtInt(c.firstRoundVotes).padStart(10)} | ` +
          `(${c.row.antiRn.toFixed(1)}/${c.row.rn.toFixed(1)}/${c.row.nonExpressed.toFixed(1)}) [${c.sourcesUsed.join(', ')}] → ` +
          `Macron ${fmtInt(c.votes.antiRn).padStart(10)} | Le Pen ${fmtInt(c.votes.rn).padStart(10)} | Non-expr. ${fmtInt(c.votes.nonExpressed).padStart(10)}`,
      )
    }

    console.log('\n--- Synthèse des variantes et contrôle R1.8 ---')
    for (const variant of ALL_REPRODUCTION_VARIANTS) {
      const res = allResults[year][variant]
      const status = res.feasibility.feasible
        ? res.feasibility.strictlyFeasible
          ? 'RÉALISABLE'
          : 'RÉALISABLE (dans la tolérance d’écart d’inscrits)'
        : `NON RÉALISABLE (${res.feasibility.violations.join(' ; ')})`
      console.log(`\n[${variant}] ${VARIANT_LABELS[variant]}`)
      if (res.fallbackCandidates.length > 0) {
        console.log(`  Repli sur l'autre institut (R1.6) : ${res.fallbackCandidates.join(', ')}`)
      }
      console.log(
        `  Contributions : Macron ${fmtInt(res.coveredTotals.antiRn)} | Le Pen ${fmtInt(res.coveredTotals.rn)} | Non-expr. ${fmtInt(res.coveredTotals.nonExpressed)}`,
      )
      console.log(
        `  Résidu (voix) : Macron ${fmtSignedInt(res.residual.antiRn)} | Le Pen ${fmtSignedInt(res.residual.rn)} | Non-expr. ${fmtSignedInt(res.residual.nonExpressed)}`,
      )
      console.log(
        `  Résidu (% pop. résiduelle) : Macron ${fmtPct((100 * res.residual.antiRn) / res.residualPopulation)} | Le Pen ${fmtPct((100 * res.residual.rn) / res.residualPopulation)} | Non-expr. ${fmtPct((100 * res.residual.nonExpressed) / res.residualPopulation)}`,
      )
      const splitStr =
        res.residualAntiRnOfExpressedPct !== null
          ? `${fmtPct(res.residualAntiRnOfExpressedPct, 1)} Macron / ${fmtPct(100 - res.residualAntiRnOfExpressedPct, 1)} Le Pen`
          : 'n/a'
      console.log(
        `  Part exprimée du résidu : ${fmtPct(res.residualExpressedSharePct)} (${splitStr}) — repère indicatif Insee (abstentionnistes T1 votant T2, tous votes) : ${insee !== undefined ? fmtPct(insee, 1) : 'n/a'}`,
      )
      console.log(`  Contrôle R1.8 : ${status}`)
    }
  }
}

const failedR11 = (['2017', '2022'] as const).filter((y) => !allResults[y].r1_1.feasibility.feasible)
if (failedR11.length > 0) {
  console.error(`\nARRÊT R1.8 : résidu R1.1 non réalisable pour ${failedR11.join(', ')}.`)
  process.exitCode = 1
}
