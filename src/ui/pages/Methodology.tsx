import type { ReactNode } from 'react'
import p3AuditJson from '../../data/second-round-p3-audit.json'
import sigmaCalibrationJson from '../../data/sigma-calibration.json'
import { secondRoundReferenceMatrices, simulationData } from '../../data/schema'
import { availableAlliances, testedOptions } from '../../domain/alliances'
import {
  CANDIDATE_FLOOR,
  CROSS_BLOC_LEAK,
  MAX_PRIOR_WEIGHT,
  MAX_TREND_PTS,
  MERGED_CENTER_RIGHT_TARGET,
  PRIOR_BLOC_SHARES,
  PROJECTION_HORIZON_DAYS,
  TARGET_CONCENTRATION,
  TREND_DAMPING_DAYS,
} from '../../domain/campaignProjection'
import { CAMPAIGN_REF_DAYS, SIGMA_CAMPAIGN_REF, SIGMA_POLLING_FLOOR } from '../../domain/monteCarlo'
import { parseSigmaCalibration } from '../../domain/sigmaCalibration'
import type { CoverageStat } from '../../domain/sigmaCalibration'
import {
  MIN_MINOR_INSTITUTES,
  POLL_HALF_LIFE_DAYS,
  SAMPLE_SIZE_CAP,
  windowDaysOf,
} from '../../domain/pollAverage'
import { noIntentionRange, presidentialDropout, secondRoundDropout } from '../../domain/secondRound'
import { computeStep2Report } from '../../domain/secondRoundDegradation'
import { parseP3AuditJson } from '../../domain/secondRoundP3'
import { ALL_REPRODUCTION_VARIANTS, reproduceReferenceElection } from '../../domain/secondRoundReproduction'
import type { ReproductionVariant } from '../../domain/secondRoundReproduction'
import { computeStep3Report } from '../../domain/secondRoundStep3'
import {
  REPUBLICAN_FRONT_PRESETS,
  correctDeclaredRowLogit,
  effectiveProfiles,
  frontStrengthForBloc,
} from '../../domain/transfers'
import type { PollOrigin, PollStatus, ProfileId, SimulationResult } from '../../domain/types'
import { BLOCS } from '../../domain/types'
import { backtestReport, newVoterReferenceRates } from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { BLOC_LABELS, BLOC_VOTERS, cand } from '../candidates'
import { ProvenanceLegend, ProvenanceValue } from '../components/Provenance'
import { date, distance, fieldwork, integer, noIntentionLabel, num, pct, pts, range } from '../format'
import { Link } from '../Link'

const {
  polls,
  pollHistory,
  transfers,
  declaredTransfers,
  secondRoundDropout: dropoutData,
  reference2017,
  reference2022,
} = simulationData
const NO_INTENTION = noIntentionRange(polls.secondRoundPolls)
const PROPOSED_ALLIANCES = availableAlliances(polls)
const TESTED_COMBOS = testedOptions(polls)

const STEPS: [string, string][] = [
  ['sondages', 'Moyenne pondérée et projection d’offre'],
  ['alliances', 'Alliances testées'],
  ['projection', 'Projection temporelle (avril 2027)'],
  ['reports', 'Reports et front républicain (2022 ↔ 2024)'],
  ['flux', 'Second tour en flux bruts'],
  ['validation', 'Incertitude Monte-Carlo et validation historique'],
]

const ORIGIN: Record<PollOrigin, string> = {
  '2027etmoi': 'Notice officielle (2027etmoi)',
  mieuxvoter: 'Notice officielle (Mieux Voter)',
  manuel: 'Saisie manuelle',
  wikipedia: 'Wikipedia',
}

const STATUS: Record<PollStatus, string> = {
  used: 'Retenu',
  superseded: 'Remplacé par un sondage plus récent',
  excluded: 'Décoché dans le scénario',
  'out-of-window': 'Hors de la fenêtre',
  'no-matching-hypothesis': 'Aucune hypothèse à portée',
}

const RF_PRESET_ROWS = [
  {
    id: 'pres2022' as const,
    label: 'Présidentielle 2022 (0 %)',
    desc: 'Ancre basse mesurée par les enquêtes « jour du vote » admissibles de la présidentielle 2022 (Macron – Le Pen : 58,55 %).',
  },
  {
    id: 'midpoint' as const,
    label: 'Mi-chemin (50 %)',
    desc: 'Interpolation logit sur 3 ancres : 2022 (0 %), présidentielle 2017 (55 %) et législatives 2024 (100 %).',
  },
  {
    id: 'leg2024' as const,
    label: 'Législatives 2024 (100 %)',
    desc: 'Défaut maintenu par choix explicite : taux directs Ipsos-Talan du 7 juillet 2024, seule source mesurant les 4 duels.',
  },
]

const PROFILE_IDS: readonly ProfileId[] = ['lfi_rn', 'ecolo_ps_pcf_rn', 'ensemble_rn', 'lr_rn']

const PRESIDENTIAL_ROWS = [
  ...dropoutData.presidential.elections.map((e) => ({
    year: e.year,
    duel: e.duel,
    turnout: (100 * e.firstRound.voters) / e.firstRound.registered,
    dropout: presidentialDropout(e),
  })),
  ...(
    [
      [2017, reference2017],
      [2022, reference2022],
    ] as const
  ).map(([year, ref]) => ({
    year,
    duel: 'Macron – Le Pen',
    turnout: (100 * ref.voters) / ref.registered,
    dropout: secondRoundDropout(ref),
  })),
].sort((a, b) => a.year - b.year)

const th = 'px-3 py-2 text-left font-medium text-ink-3'
const td = 'px-3 py-1.5 align-top'

function Step({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-rule pt-8">
      <h3 id={`${id}-title`} className="flex items-baseline gap-3 text-xl font-bold tracking-tight">
        <span className="figure text-3xl text-ballpoint">{n}</span>
        {title}
      </h3>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  )
}

function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-surface p-1 shadow-(--ballot-shadow)">
      <table className="w-full min-w-136 text-sm">
        {caption && <caption className="px-3 pb-1 pt-2 text-left text-ink-3">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

const sigmaCalibration = parseSigmaCalibration(sigmaCalibrationJson)

const coverageLabel = (c: CoverageStat) =>
  `${c.covered} / ${c.total} (${pct(100 * c.rate, 0)}) · IC 95 % [${pct(100 * c.ci95[0], 0)} ; ${pct(100 * c.ci95[1], 0)}]`

/** Calage de σ_ref par couverture : lecture du JSON produit hors application par `scripts/calibrate-sigma.ts`. */
function SigmaCalibrationBlock() {
  const c = sigmaCalibration
  const shown = c.curve.filter(
    (p) =>
      Math.abs(p.sigma * 10 - Math.round(p.sigma * 10)) < 1e-6 ||
      p.sigma === c.sigmaRef ||
      p.sigma === c.crpsArgmin.sigma,
  )
  const target = pct(100 * c.coverageTarget, 0)
  return (
    <>
      <Table
        caption={`Calage de σ_ref : couverture [P10 ; P90] des scores de 1er tour (cible ${target}) et CRPS en diagnostic, 2012, 2017 et 2022 (${integer(c.iterations)} tirages, graine ${c.seed}, relevé du ${date(c.generatedOn)}) : σ_ref retenu = ${num(c.sigmaRef, 3)}`}
      >
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>σ_ref</th>
            <th className={`${th} text-right`}>Couverture, moyenne par élection</th>
            <th className={`${th} text-right`}>Couverture, tous points</th>
            <th className={`${th} text-right`}>CRPS</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.sigma} className="border-b border-rule/60">
              <td className={`${td} num ${p.sigma === c.sigmaRef ? 'font-medium' : ''}`}>{num(p.sigma, 3)}</td>
              <td className={`${td} num text-right ${p.sigma === c.sigmaRef ? 'font-medium' : ''}`}>
                {pct(100 * p.coverageMean, 1)}
              </td>
              <td className={`${td} num text-right text-ink-3`}>{pct(100 * p.coveragePooled, 1)}</td>
              <td className={`${td} num text-right text-ink-3`}>{num(p.pooled, 3)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="prose-method">
        <ul>
          <li>
            <strong>Règle :</strong> σ_ref est la valeur de la grille {num(c.grid.min, 2)}–{num(c.grid.max, 2)} (pas{' '}
            {num(c.grid.step, 3)}) dont la couverture [P10 ; P90], moyenne simple des trois élections (points
            candidat-date regroupés au sein de chaque élection), est la plus proche de {target} ; à égalité, la plus
            petite. Couverture au σ retenu : {pct(100 * c.coverageAtSigmaRef, 1)} en moyenne par élection, mais
            seulement {coverageLabel(c.coverage.pooled)} tous points confondus ;{' '}
            {c.coverage.byYear.map((r) => `${r.year} : ${coverageLabel(r.stat)}`).join(' ; ')}. Les dates d’une même
            élection sont corrélées : ces intervalles de confiance sont optimistes.
          </li>
          <li>
            <strong>Dates retenues :</strong>{' '}
            {c.datesByElection
              .map(
                (d) =>
                  `${d.year} : ${d.daysBefore.length}${d.daysBefore.length > 0 ? ` (J−${d.daysBefore[0]} à J−${d.daysBefore.at(-1)})` : ''}`,
              )
              .join(' ; ')}
            . Une date n’est retenue que si la moyenne des sondages y est calculable ; en 2012, les sondages
            antérieurs à mi-mars testaient tous au moins une personnalité finalement non candidate, exclue de
            l’offre. 2012 ne compte donc que quelques points, tous couverts, ce qui tire la moyenne par élection
            vers le haut.
          </li>
          <li>
            <strong>Stabilité hors échantillon</strong> (σ choisi par la même règle sur les deux autres élections,
            couverture mesurée sur l’élection exclue) :{' '}
            {c.leaveOneOut
              .map((r) => `${r.heldOut} exclue : σ = ${num(r.sigma, 3)}, couverture ${pct(100 * r.coverage, 1)}`)
              .join(' ; ')}
            . Le σ choisi varie fortement selon l’élection exclue : la règle est mal identifiée.
          </li>
          <li>
            <strong>Par tranche d’horizon</strong> (au σ retenu) :{' '}
            {c.coverage.byHorizonBand.map((r) => `${r.band} : ${coverageLabel(r.stat)}`).join(' ; ')}.
          </li>
          <li>
            <strong>Lecture :</strong> le CRPS est minimal à σ = {num(c.crpsArgmin.sigma, 3)} (couverture moyenne{' '}
            {pct(100 * c.crpsArgmin.coverageMean, 1)}) : il récompense la netteté, et quelques erreurs de centrage
            durables (candidat sur- ou sous-estimé par les moyennes pendant toute la campagne) pèsent plus que le
            bruit de campagne. Un σ unique ne peut pas être à la fois net et calibré ; une incertitude propre à
            chaque candidat est à l’étude. Contrôle sans projection de campagne au σ retenu : CRPS{' '}
            {num(c.rawControl.crps, 3)}, couverture {coverageLabel(c.rawControl.coverage)}. Valeurs antérieures (même
            prévision) :{' '}
            {c.previous
              .map((p) => `σ = ${num(p.sigma, 3)} (${p.label}) → couverture ${pct(100 * p.coverageMean, 1)}, CRPS ${num(p.crps, 3)}`)
              .join(' ; ')}
            .
          </li>
        </ul>
      </div>
    </>
  )
}

const P1_VARIANT_LABELS: Record<ReproductionVariant, string> = {
  r1_1: 'R1.1 (moyenne Ipsos/Ifop)',
  ipsos_only: 'R1.6 — Ipsos seul',
  ifop_only: 'R1.6 — Ifop seul (publié)',
  r1_7_r1_1: 'R1.7 sur R1.1',
  r1_7_ifop_only: 'R1.7 sur Ifop seul',
}

const p1Step1 = {
  '2017': Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      reproduceReferenceElection('2017', reference2017, secondRoundReferenceMatrices, v),
    ]),
  ) as Record<ReproductionVariant, ReturnType<typeof reproduceReferenceElection>>,
  '2022': Object.fromEntries(
    ALL_REPRODUCTION_VARIANTS.map((v) => [
      v,
      reproduceReferenceElection('2022', reference2022, secondRoundReferenceMatrices, v),
    ]),
  ) as Record<ReproductionVariant, ReturnType<typeof reproduceReferenceElection>>,
}

const p1Step2 = {
  '2017': computeStep2Report('2017', reference2017, secondRoundReferenceMatrices, transfers),
  '2022': computeStep2Report('2022', reference2022, secondRoundReferenceMatrices, transfers),
}

const p1Step3 = computeStep3Report(simulationData, secondRoundReferenceMatrices, backtestReport)
const p3Audit = parseP3AuditJson(p3AuditJson)

const P3_SHOCK_ROLES: { shock: string; role: string; overlap: string }[] = [
  {
    shock: 'rfShock (front républicain)',
    role: 'Déplacement corrélé le long de l’axe mesuré 2022 ↔ 2017 ↔ 2024 (borné à [0 ; 1]).',
    overlap: 'Partiel avec η, mais strictement borné à l’enveloppe des ancres.',
  },
  {
    shock: 'dirichlet (κ = 40)',
    role: 'Aléa indépendant par électorat éliminé (erreur d’enquête + spécificité d’un bloc).',
    overlap: 'Non : erreurs indépendantes par bloc, à la différence du choc commun national η.',
  },
  {
    shock: 'edU (ED 2017 ↔ 2022)',
    role: 'Hétérogénéité structurelle de l’extrême droite hors RN (Dupont-Aignan vs Zemmour).',
    overlap: 'Non : propre à un seul électorat.',
  },
  {
    shock: 'lfiLeftU (35–75 %)',
    role: 'Report non mesuré gauche hors LFI → Mélenchon (profil lfi_rn uniquement).',
    overlap: 'Non : propre à lfi_rn (amortit même la corrélation avec rfShock en mode incertain).',
  },
  {
    shock: 'fidelity, qDelta, mob, turnout',
    role: 'Tolérances mécaniques mineures (< 2 % de variance chacun ; mob et turnout ≈ 0 % sous S2).',
    overlap: 'Négligeable.',
  },
  {
    shock: 'η (σ = 3,0 pts RN / 2,0 hors RN)',
    role: 'Choc national commun d’entre-deux-tours et erreur structurelle hors enveloppe des ancres.',
    overlap: 'À σ_η = 0, la largeur (5,7–6,5 pts) ne couvre pas 2022 en LOO R2.4.',
  },
]

/** Audit P3 du budget d'incertitude du 2nd tour et courbe CRPS conditionnelle de σ_η (26/11/2026). */
function SecondRoundP3BudgetBlock() {
  const prim = p3Audit.curves.primary_leg2024_r25
  const para = p3Audit.curves.parallel_uncertain_r25
  const compS3 = p3Audit.curves.comparison_leg2024_s3
  const fixedCases = p3Audit.varianceFixedR1.filter((c) =>
    [
      '2017_leg2024_loo',
      '2022_leg2024_loo',
      '2012_non_rn',
      '2027_lepen_melenchon_leg2024',
      '2027_lepen_philippe_leg2024',
    ].includes(c.id),
  )
  const shockPct = (c: (typeof fixedCases)[number], key: string) =>
    c.shocks.find((s) => s.cut === key)?.deltaVarPct ?? null

  return (
    <>
      <div className="prose-method">
        <p>
          <strong>
            Audit P3 — Budget d’incertitude du 2nd tour et calage de σ_η (26/11/2026 — σ_η inchangé) :
          </strong>{' '}
          l’évaluation conditionnelle à 1er tour réel fixé en leave-one-out R2.4 (finalistes mesurés R2.5,{' '}
          {integer(p3Audit.iterations)} tirages, graine {p3Audit.seed}) a balayé σ_η de 0 à 5 points (pas 0,25).
          Contrairement à l’hypothèse initiale d’un surdimensionnement, σ_η = 3,0 pts ne couvre pas 2022 en LOO
          (2022 à 58,55 % se situe hors de l’enveloppe des ancres restantes [2017, 2024]) et toute baisse sous 3,0 pts
          dégrade strictement le CRPS. La règle CRPS + couverture 2/2 désigne{' '}
          <strong>σ_η = {num(prim.selected?.sigmaEta ?? 0, 2)} pts</strong> en primaire (
          {num(para.selected?.sigmaEta ?? 0, 2)} pts en mode <em>Incertain</em> LOO ;{' '}
          {num(compS3.selected?.sigmaEta ?? 0, 2)} pts en comparaison S3 neutre ; contrôles à 10 000 tirages :{' '}
          {num(p3Audit.control10k.leg2024_r25_selected ?? 0, 2)} et{' '}
          {num(p3Audit.control10k.uncertain_r25_selected ?? 0, 2)} pts), ce qui améliore le CRPS (
          {pts(prim.selected?.crpsDeltaVs3Pct ?? 0, 2)} %) mais <strong>augmente la largeur moyenne</strong> de{' '}
          {num(prim.currentAt3.meanWidth80, 2)} à {num(prim.selected?.meanWidth80 ?? 0, 2)} pts. Le critère
          pré-enregistré de baisse de largeur (§5.3) n’étant pas satisfait, la modification de σ_η est{' '}
          <strong>rejetée</strong> : σ_η reste fixé à <strong>3,0 pts face au RN</strong> et{' '}
          <strong>2,0 pts hors RN</strong> (non recalé sur 2012 car les matrices hors RN proviennent de 2007–2012).
        </p>
      </div>

      <Table caption="Audit P3 — Décomposition de variance du 2nd tour à 1er tour fixé (% de variance T2 perdue en coupant chaque aléa, N = 2 000)">
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>Scénario (1er tour fixé)</th>
            <th className={`${th} text-right`}>Larg. [P10 ; P90]</th>
            <th className={`${th} text-right`}>η</th>
            <th className={`${th} text-right`}>Dirichlet</th>
            <th className={`${th} text-right`}>rfShock</th>
            <th className={`${th} text-right`}>edU</th>
            <th className={`${th} text-right`}>q / fid. / mob</th>
          </tr>
        </thead>
        <tbody>
          {fixedCases.map((c) => {
            const eta = shockPct(c, 'eta')
            const dir = shockPct(c, 'dirichlet')
            const rf = shockPct(c, 'rfShock')
            const ed = shockPct(c, 'edU')
            const small = (shockPct(c, 'qDelta') ?? 0) + (shockPct(c, 'fidelity') ?? 0) + (shockPct(c, 'mob') ?? 0)
            return (
              <tr key={c.id} className="border-b border-rule/60">
                <td className={td}>{c.label}</td>
                <td className={`${td} num text-right font-medium`}>{num(c.width80, 2)} pts</td>
                <td className={`${td} num text-right font-medium`}>{eta !== null ? pct(eta, 1) : '—'}</td>
                <td className={`${td} num text-right`}>{dir !== null ? pct(dir, 1) : '—'}</td>
                <td className={`${td} num text-right`}>{rf !== null ? pct(rf, 1) : '—'}</td>
                <td className={`${td} num text-right`}>{ed !== null ? pct(ed, 1) : '—'}</td>
                <td className={`${td} num text-right text-ink-3`}>{pct(small, 1)}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <Table caption="Audit P3 — Source d’incertitude distincte de chaque aléa du 2nd tour et contrôle de double emploi">
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>Aléa</th>
            <th className={th}>Source représentée</th>
            <th className={th}>Chevauchement avec η</th>
          </tr>
        </thead>
        <tbody>
          {P3_SHOCK_ROLES.map((r) => (
            <tr key={r.shock} className="border-b border-rule/60">
              <td className={`${td} font-medium`}>{r.shock}</td>
              <td className={td}>{r.role}</td>
              <td className={`${td} text-ink-2`}>{r.overlap}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Table
        caption={`Audit P3 — Courbe CRPS conditionnelle complète en fonction de σ_η (1er tour réel fixé, LOO R2.4, relevé du ${date(p3Audit.generatedOn)}) ; σ_η conservé à 3,00 pts`}
      >
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>σ_η</th>
            <th className={`${th} text-right`}>Primaire `leg2024` + R2.5 : 2017 / 2022</th>
            <th className={`${th} text-right`}>Larg. moy.</th>
            <th className={`${th} text-right`}>CRPS moy. (prim.)</th>
            <th className={`${th} text-right`}>CRPS moy. (Incert. R2.5)</th>
            <th className={`${th} text-right`}>CRPS moy. (comp. S3)</th>
          </tr>
        </thead>
        <tbody>
          {prim.grid.map((g, i) => {
            const pRow = para.grid[i]!
            const s3Row = compS3.grid[i]!
            const isCurrent = Math.abs(g.sigmaEta - p3Audit.sigmaEtaRnRetained) < 1e-6
            const isArgmin = prim.selected?.sigmaEta === g.sigmaEta
            return (
              <tr
                key={g.sigmaEta}
                className={`border-b border-rule/60 ${isCurrent ? 'bg-ballpoint-soft/30 font-medium' : ''}`}
              >
                <td className={`${td} num`}>
                  {num(g.sigmaEta, 2)}
                  {isCurrent ? ' (actuel)' : isArgmin ? ' (min R2.5)' : ''}
                </td>
                <td className={`${td} num text-right`}>
                  {g.y2017.covered ? 'OK' : 'KO'} / {g.y2022.covered ? 'OK' : 'KO'}
                  <span className="ml-1.5 text-xs font-normal text-ink-3">
                    (2022 : [{num(g.y2022.p10, 1)} ; {num(g.y2022.p90, 1)}])
                  </span>
                </td>
                <td className={`${td} num text-right`}>{num(g.meanWidth80, 2)} pts</td>
                <td className={`${td} num text-right`}>{num(g.meanCrps, 3)}</td>
                <td className={`${td} num text-right text-ink-2`}>{num(pRow.meanCrps, 3)}</td>
                <td className={`${td} num text-right text-ink-3`}>{num(s3Row.meanCrps, 3)}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </>
  )
}

/** Audit P1 du moteur du 2nd tour (24/11/2026) : résultats publiés quel que soit le verdict (P1 rejeté). */
function SecondRoundP1AuditBlock() {
  const ed = p1Step3.r13ByVariant.r1_1.r114PooledExtremeDroiteRow
  return (
    <>
      <div className="prose-method">
        <p>
          <strong>Audit du moteur du 2nd tour (P1, 24/11/2026 — rejeté ; puis v2.3 P1-bis + P2, 26/11/2026) :</strong> afin
          d’examiner l’écart en échantillon du moteur v2.2 sur 2017 et 2022, les matrices brutes des quatre enquêtes
          Ipsos Sopra Steria et Ifop-Fiducial ont été archivées et éprouvées selon des règles pré-enregistrées dans le
          journal méthodologique. Le premier essai P1 a échoué aux critères R1.2 et R1.4 (tableaux archivés ci-dessous)
          et a été rejeté. Le diagnostic des 5 causes structurelles a conduit à la refonte <strong>P1-bis (S1–S5)</strong>{' '}
          et à l’ajout de l’ancre 2017 (<strong>P2</strong>, <em>s</em>₂₀₁₇ = 0,5502 sous R2.5 + ED mesurée 2017),
          adoptés en <strong>v2.3 le 26/11/2026 par décision explicite du propriétaire du projet</strong> (en maintenant{' '}
          <code>leg2024</code> par défaut ; détail complet et écarts par rapport aux critères stricts dans{' '}
          <code>docs/changelog-methode.md</code>).
        </p>
        <p>
          <strong>Classement historique des petits candidats dans le backtest</strong> (hypothèse documentée,
          faute de mesure publiée pour ces candidats) : <em>gauche</em> (Arthaud, Poutou, Roussel, Hidalgo,
          Mélenchon, Hamon, Jadot, Joly, Hollande, Montebourg, Taubira, Valls, Duflot, Peillon, Pinel),{' '}
          <em>droite</em> (Fillon, Pécresse, Lassalle, Bertrand, Juppé, Sarkozy), <em>extrême droite</em>{' '}
          (Le Pen, Zemmour, Dupont-Aignan, Asselineau, Philippot) et <em>centre</em> par défaut (Macron,
          Bayrou, Cheminade). Borne maximale d’effet des candidats sans ligne (voix / exprimés du 2nd tour) :{' '}
          <strong>{num(p1Step2['2017'].boundC.maxEffectPts, 2)} pts</strong> en 2017 et{' '}
          <strong>{num(p1Step2['2022'].boundC.maxEffectPts, 2)} pts</strong> en 2022.
        </p>
      </div>

      <Table caption="Audit P1, étape 1 — Reproduction partielle en voix, variantes et contrôle du résidu (R1.8) sur 2017 et 2022">
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>Scrutin · variante</th>
            <th className={`${th} text-right`}>Résidu Macron</th>
            <th className={`${th} text-right`}>Résidu Le Pen</th>
            <th className={`${th} text-right`}>Part expr. du résidu</th>
            <th className={th}>Contrôle R1.8</th>
          </tr>
        </thead>
        <tbody>
          {(['2017', '2022'] as const).flatMap((year) =>
            ALL_REPRODUCTION_VARIANTS.map((variant) => {
              const r = p1Step1[year][variant]
              return (
                <tr key={`${year}-${variant}`} className="border-b border-rule/60">
                  <td className={`${td} ${variant === 'r1_1' ? 'font-medium' : 'text-ink-3'}`}>
                    <span className="num">{year}</span> · {P1_VARIANT_LABELS[variant]}
                    {r.fallbackCandidates.length > 0 && (
                      <span className="block text-xs font-normal text-ink-3">
                        repli Ifop : {r.fallbackCandidates.join(', ')}
                      </span>
                    )}
                  </td>
                  <td className={`${td} num text-right`}>{integer(Math.round(r.residual.antiRn))}</td>
                  <td className={`${td} num text-right`}>{integer(Math.round(r.residual.rn))}</td>
                  <td className={`${td} num text-right`}>{pct(r.residualExpressedSharePct, 2)}</td>
                  <td className={`${td} ${r.feasibility.feasible ? 'text-ballpoint' : 'font-medium text-hypo'}`}>
                    {r.feasibility.feasible ? 'Réalisable' : 'Non réalisable'}
                  </td>
                </tr>
              )
            }),
          )}
        </tbody>
      </Table>

      <Table caption="Audit P1, étape 2 — Décomposition des simplifications (pts d’exprimés sur Macron) ; référence R1.1 hors tolérance R1.2 (−2,04 pts en 2017 ; volumes −2,25 / −1,00 pt en 2022)">
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>Simplification</th>
            <th className={`${th} text-right`}>2017 ajouté à réf.</th>
            <th className={`${th} text-right`}>2017 retiré de l’actuel</th>
            <th className={`${th} text-right`}>2022 ajouté à réf.</th>
            <th className={`${th} text-right`}>2022 retiré de l’actuel</th>
          </tr>
        </thead>
        <tbody>
          {p1Step2['2017'].degradations.map((d17) => {
            const d22 = p1Step2['2022'].degradations.find((x) => x.key === d17.key)!
            return (
              <tr key={d17.key} className="border-b border-rule/60">
                <td className={`${td} ${d17.key === 'b' ? 'font-medium' : ''}`}>{d17.label}</td>
                <td className={`${td} num text-right`}>{pts(d17.addedToReferencePts, 2)}</td>
                <td className={`${td} num text-right text-ink-3`}>{pts(d17.removedFromCurrentGainPts, 2)}</td>
                <td className={`${td} num text-right`}>{pts(d22.addedToReferencePts, 2)}</td>
                <td className={`${td} num text-right text-ink-3`}>{pts(d22.removedFromCurrentGainPts, 2)}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <Table
        caption={`Audit P1, étape 3 — Évaluation R1.4 pour la seule correction passant R1.3 : (b) extrême droite hors finaliste (ligne R1.14 : ${num(ed.finalist, 1)} / ${num(ed.rn, 2)} / ${num(ed.abstention, 2)}) ; référence croisée actuelle : ${num(p1Step3.baseline.crossMeanAbsErrorPts, 3)} pts`}
      >
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>Variante</th>
            <th className={`${th} text-right`}>Éch. 2017</th>
            <th className={`${th} text-right`}>Éch. 2022</th>
            <th className={`${th} text-right`}>Croisé 2017</th>
            <th className={`${th} text-right`}>Croisé 2022</th>
            <th className={`${th} text-right`}>Moy. |err| croisée</th>
            <th className={th}>Verdict R1.4</th>
          </tr>
        </thead>
        <tbody>
          {ALL_REPRODUCTION_VARIANTS.map((variant) => {
            const r = p1Step3.r13ByVariant[variant]
            return (
              <tr key={variant} className="border-b border-rule/60">
                <td className={`${td} ${variant === 'r1_1' ? 'font-medium' : 'text-ink-3'}`}>
                  {P1_VARIANT_LABELS[variant]}
                </td>
                <td className={`${td} num text-right`}>{pts(r.inSample['2017'].errorPts, 2)}</td>
                <td className={`${td} num text-right`}>{pts(r.inSample['2022'].errorPts, 2)}</td>
                <td className={`${td} num text-right`}>{pts(r.cross['2017'].errorPts, 2)}</td>
                <td className={`${td} num text-right`}>{pts(r.cross['2022'].errorPts, 2)}</td>
                <td className={`${td} num text-right font-medium`}>{num(r.crossMeanAbsErrorPts, 3)}</td>
                <td className={`${td} font-medium text-hypo`}>Rejeté (éch. &amp; croisé)</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </>
  )
}

export function Methodology({ result }: { result: SimulationResult }) {
  const settings = useSettings()
  const sr = result.secondRound
  const bt = backtestReport
  const rates = newVoterReferenceRates
  const inWindow = result.pollUsage.filter((u) => u.status !== 'out-of-window')
  const rnId = polls.candidates.find((c) => c.isRN)?.id ?? 'lepen'
  const activeProfiles = effectiveProfiles(transfers, declaredTransfers, settings, { rnId })
  const historyStart = pollHistory.polls.at(-1)?.fieldwork.end
  const historyEnd = pollHistory.polls[0]?.fieldwork.end

  return (
    <article aria-labelledby="methodo-title">
      <h1
        id="methodo-title"
        className="wide text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]"
      >
        Méthodologie et validation
      </h1>
      <div className="prose-method mt-4">
        <p>
          Le simulateur enchaîne six étapes publiques et auditées. Chaque chiffre reflète le scénario actif
          sur le <Link to="simulateur">simulateur</Link>. Chaque changement de réglage par défaut est consigné
          et daté dans le journal méthodologique (<code>docs/changelog-methode.md</code>) avant examen de ses
          effets sur 2027. Aucun paramètre n’est recalibré sur les sondages directs de second tour 2027, et
          les mentions « hors échantillon » sont strictement réservées aux tests dont aucun paramètre n’a été
          estimé sur l’élection évaluée.
        </p>
      </div>

      <nav aria-label="Étapes du calcul" className="mt-6">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map(([id, title], i) => (
            <li key={id}>
              <Link
                to="methodologie"
                hash={id}
                className="inline-flex items-baseline gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium shadow-(--ballot-shadow) hover:text-ballpoint"
              >
                <span className="figure text-base text-ballpoint">{i + 1}</span>
                {title}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="methodologie"
              hash="limites"
              className="inline-flex rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ballpoint"
            >
              Limites et sources
            </Link>
          </li>
        </ol>
      </nav>

      <div className="mt-10 space-y-12">
        {/* ÉTAPE 1 */}
        <Step id="sondages" n={1} title="Moyenne pondérée et projection d’offre">
          <div className="prose-method">
            <p>
              Dans la fenêtre retenue ({windowDaysOf(polls)} jours jusqu’au {date(polls.asOf)}), on conserve
              le dernier sondage de chaque institut. Chaque institut <em>i</em> reçoit un poids combiné
              fraîcheur × échantillon :
            </p>
            <p className="font-mono text-sm">
              w_i = 2<sup>−âge / {POLL_HALF_LIFE_DAYS}</sup> × √(min(n_i, {integer(SAMPLE_SIZE_CAP)}) / 1 000)
            </p>
            <p>
              La demi-vie de {POLL_HALF_LIFE_DAYS} jours divise par deux le poids d’un sondage toutes les deux
              semaines, tout en plafonnant l’effet de taille à {integer(SAMPLE_SIZE_CAP)} répondants afin
              qu’une très grande enquête ancienne n’écrase pas les mesures récentes.
            </p>
            <p>
              <strong>Candidats principaux et petits candidats :</strong> les candidats testés quasi
              systématiquement (y compris David Lisnard, présent dans 7 instituts sur 8 et qui relève au 2nd
              tour du bloc droite comme Bruno Retailleau) sont traités comme candidats principaux. Un petit
              candidat n’entre dans l’offre de base que s’il est testé par au moins {MIN_MINOR_INSTITUTES}{' '}
              instituts distincts ({result.eligibleMinors.length} retenus :{' '}
              {result.eligibleMinors.map((id) => cand(id).shortName).join(', ') || 'aucun'} ;{' '}
              {result.excludedMinors.length} écartés faute de recul suffisant :{' '}
              {result.excludedMinors.map((id) => cand(id).shortName).join(', ') || 'aucun'}).
            </p>
            <p>
              <strong>Projection d’offre intra-institut (paires propres) :</strong> lorsqu’un institut récent
              ne teste pas exactement l’offre cible (par exemple Odoxa ou Cluster17 sans Gabriel Attal sur
              leur hypothèse principale), le simulateur mesure les transferts sur paires strictement{' '}
              <em>ceteris paribus</em> (un seul candidat d’écart au sein d’un même institut) et redistribue
              100 % des voix selon ces poids mesurés, à distance ≤ 2 candidats.
            </p>
          </div>

          <Table
            caption={`Sondages dans la fenêtre (${inWindow.length} sondages, ${result.institutesUsed} instituts retenus)`}
          >
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Institut</th>
                <th className={th}>Terrain</th>
                <th className={`${th} text-right`}>Échantillon</th>
                <th className={th}>Statut / Projection</th>
                <th className={`${th} text-right`}>Poids</th>
                <th className={th}>Origine</th>
              </tr>
            </thead>
            <tbody>
              {inWindow.map((u) => (
                <tr key={u.poll.id} className="border-b border-rule/60">
                  <td className={`${td} font-medium`}>{u.poll.institute}</td>
                  <td className={`${td} num`}>{fieldwork(u.poll.fieldwork)}</td>
                  <td className={`${td} num text-right`}>{integer(u.poll.sampleSize)}</td>
                  <td className={td}>
                    {STATUS[u.status]}
                    {u.projected && (
                      <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-xs text-ink-2">
                        projeté ({u.projectionSteps.join(', ')})
                      </span>
                    )}
                    {!u.projected && u.matchedHypotheses.length > 0 && (
                      <span className="ml-1.5 text-xs text-ink-3">({u.matchedHypotheses.join(', ')})</span>
                    )}
                  </td>
                  <td className={`${td} num text-right font-medium`}>
                    {u.weightShare > 0 ? pct(u.weightShare, 1) : '—'}
                  </td>
                  <td className={`${td} text-ink-3`}>{u.poll.origin ? ORIGIN[u.poll.origin] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Step>

        {/* ÉTAPE 2 */}
        <Step id="alliances" n={2} title="Alliances testées par les sondeurs">
          <div className="prose-method">
            <p>
              Seules les configurations effectivement testées par au moins un institut de la période sont
              proposées ({PROPOSED_ALLIANCES.length} alliances simples et {TESTED_COMBOS.length} combinaisons,
              accessibles dans la section repliable des paramètres). Activer une alliance sélectionne les
              hypothèses où le candidat rallié est absent et où le leader reste seul candidat principal de son
              camp : ce sont donc les sondés eux-mêmes qui répartissent ses voix.
            </p>
          </div>
        </Step>

        {/* ÉTAPE 3 : PROJECTION TEMPORELLE */}
        <Step id="projection" n={3} title="Projection temporelle vers avril 2027">
          <div className="prose-method">
            <p>
              La projection avril 2027 est <strong>activée par défaut</strong> (actuellement{' '}
              <strong>{settings.projection.enabled ? 'activée' : 'désactivée'}</strong>, à J−
              {result.projection.daysRemaining}, facteur d’horizon{' '}
              <span className="num">{pct(result.projection.horizonFactor * 100, 0)}</span>), avec bascule en
              un clic vers la <strong>photographie actuelle</strong> des sondages (« Aujourd’hui »). Limite
              connue : en validation croisée leave-one-out, la projection ne bat pas la moyenne brute sur les
              trois élections (au 23/11/2026 : égalité en 2012, moins bien en 2017, mieux en 2022) ; elle reste
              activée par défaut par choix éditorial, et la photographie actuelle reste disponible. Le bénéficiaire du vote
              utile « Auto » est le candidat le plus haut de son bloc à la date, sans tirage aléatoire
              (variante retenue après comparaison A/B/C, voir le journal des changements). Tous les
              mécanismes décroissent continûment et <strong>s’annulent exactement le jour du scrutin</strong>{' '}
              (facteur{' '}
              <span className="font-mono text-xs">h = min(1, joursRestants / {PROJECTION_HORIZON_DAYS})</span>
              ) :
            </p>
            <ul>
              <li>
                <strong>Vote utile intra-bloc (actif par défaut quand la projection est activée) :</strong>{' '}
                l’intensité (0 à 100 %) et le candidat pivot (<em>Auto</em> ou forcé) sont réglables par bloc
                dans les réglages avancés. Les cibles de concentration retenues sont les moyennes observées en
                2017 et 2022 : <strong>{pct(TARGET_CONCENTRATION.gauche * 100, 0)}</strong> à gauche (70,8 %
                en 2017, 68,7 % en 2022), <strong>{pct(TARGET_CONCENTRATION.droite * 100, 0)}</strong> à
                droite (94,3 % et 60,4 %),{' '}
                <strong>{pct(TARGET_CONCENTRATION.extreme_droite * 100, 0)}</strong> à l’extrême droite (79,1
                % et 71,7 %), et <strong>{pct(TARGET_CONCENTRATION.centre * 100, 0)}</strong> au centre
                (<strong>hypothèse non sourcée</strong>, plage de sensibilité 65–85 % : le centre n’ayant eu qu’un
                seul candidat principal en 2012, 2017 et 2022, aucune mesure). Une option regroupe centre et droite (cible{' '}
                {pct(MERGED_CENTER_RIGHT_TARGET * 100, 0)}). Garde-fous :{' '}
                <strong>{pct(CROSS_BLOC_LEAK * 100, 0)}</strong> de fuite vers les blocs voisins (hypothèse non
                sourcée, plage de sensibilité 6–18 %), plancher de{' '}
                <strong>{pct(CANDIDATE_FLOOR, 1)}</strong> par candidat et drainage réduit pour un co-favori
                proche.
              </li>
              <li>
                <strong>Amortissement vers les fondamentaux (option, 0 % par défaut) :</strong> le rappel des
                totaux de blocs vers une moyenne 2017–2024 (poids maximal {pct(MAX_PRIOR_WEIGHT * 100, 0)} à
                J−
                {PROJECTION_HORIZON_DAYS}) est désactivé par défaut (curseur actuel :{' '}
                <span className="num">{pct(settings.projection.meanReversion * 100, 0)}</span>), car ses poids
                de blocs sont conventionnels et non validés hors échantillon.
              </li>
              <li>
                <strong>
                  Tendance récente amortie sur {TREND_DAMPING_DAYS} jours (option, 0 % par défaut) :
                </strong>{' '}
                la synchronisation archive une seule hypothèse cohérente par vague depuis Wikipedia (
                {pollHistory.polls.length} vagues
                {historyStart && historyEnd ? ` du ${date(historyStart)} au ${date(historyEnd)}` : ''},
                filtrées sur présence simultanée Le Pen + Mélenchon et masse couverte ≥ 75 %). L’extrapolation
                de pente (plafonnée à ±{num(MAX_TREND_PTS, 1)} pts) est désactivée par défaut (curseur actuel
                : <span className="num">{pct(settings.projection.dampedTrend * 100, 0)}</span>), car sur les
                présidentielles 1995–2022 la corrélation entre pente sur 6 semaines et évolution jusqu’au
                scrutin est négative et non significative (r = −0,26). L’historique sert principalement à
                tracer la trajectoire passée.
              </li>
            </ul>
          </div>

          <Table
            caption={`Paramètres structurels de la projection par pôle (${settings.projection.mergeCenterRight ? 'mode Centre + Droite regroupés' : '4 blocs séparés'})`}
          >
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Bloc / Pôle</th>
                <th className={`${th} text-right`}>Cible vote utile</th>
                <th className={`${th} text-right`}>Fondamental (option)</th>
                <th className={th}>Pivot actuel</th>
                <th className={`${th} text-right`}>Part du pivot (actuel → projeté)</th>
              </tr>
            </thead>
            <tbody>
              {result.projection.poles.map((pole) => {
                const label = pole.pole === 'centre_droite' ? 'Centre + Droite' : BLOC_LABELS[pole.pole]
                const prior =
                  pole.pole === 'centre_droite'
                    ? PRIOR_BLOC_SHARES.centre + PRIOR_BLOC_SHARES.droite
                    : PRIOR_BLOC_SHARES[pole.pole]
                return (
                  <tr key={pole.pole} className="border-b border-rule/60">
                    <td className={`${td} font-medium`}>{label}</td>
                    <td className={`${td} num text-right`}>{pct(pole.targetShare * 100, 0)}</td>
                    <td className={`${td} num text-right text-ink-3`}>{pct(prior, 0)}</td>
                    <td className={td}>{pole.beneficiary ? cand(pole.beneficiary).shortName : '—'}</td>
                    <td className={`${td} num text-right`}>
                      {pole.saturated
                        ? `${pct(pole.shareBefore * 100, 0)} (déjà au seuil)`
                        : `${pct(pole.shareBefore * 100, 0)} → ${pct(pole.shareAfter * 100, 0)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Step>

        {/* ÉTAPE 4 : REPORTS & FRONT RÉPUBLICAIN */}
        <Step id="reports" n={4} title="Matrices de reports et front républicain (2022 ↔ 2024)">
          <div className="prose-method">
            <p>
              Pour les duels face au RN, la <strong>base historique</strong> repose sur une{' '}
              <strong>interpolation directe sur échelle logit entre deux scrutins réellement mesurés</strong>{' '}
              — sans coefficients ad hoc ni extrapolation en dessous de 2022 :
            </p>
            <ul>
              <li>
                <strong>Repère 100 % — Législatives 2024 (défaut provisoire) :</strong> taux directs de
                l’enquête Ipsos-Talan du 7 juillet 2024, seule enquête publique mesurant simultanément les 4
                configurations de duels face au RN (<code>lfi_rn</code>, <code>ecolo_ps_pcf_rn</code>,{' '}
                <code>ensemble_rn</code>, <code>lr_rn</code>).
              </li>
              <li>
                <strong>Repère 0 % — Présidentielle 2022 (admissible R1.8) :</strong> pour <code>ensemble_rn</code>,
                le modèle rejoint exactement les taux mesurés « jour du vote » admissibles en 2022 (gauche :
                45,9 / 13,5 / 40,6 ; droite : 52,5 / 18,0 / 29,5).
              </li>
              <li>
                <strong>Repère 55 % — Présidentielle 2017 (P2, <em>s</em>₂₀₁₇ = 0,5502) :</strong> les lignes
                admissibles 2017 (Ipsos : gauche 56,7 / 5,8 / 37,6 ; droite 48,0 / 20,0 / 32,0) forment une
                troisième ancre placée à la position reproduisant le résultat 2017 sous R2.5 (finalistes et
                extrême droite mesurés en 2017). L’interpolation logit est linéaire par morceaux sur{' '}
                <code>2022 (0 %) → 2017 (55 %) → 2024 (100 %)</code>, sans extrapolation hors [0 % ; 100 %]. Pour
                les autres profils, le déplacement logit 2024 → position active de <code>ensemble_rn</code> est
                appliqué (sur les lignes déjà à ≥ 10 % de vote RN en 2024, seul le décalage <em>df</em> vers
                l’abstention est appliqué afin de ne pas gonfler artificiellement le vote RN).
              </li>
              <li>
                <strong>Réglage global et par électorat qui se reporte :</strong> 4 préréglages (Présidentielle 2022,
                Mi-chemin, Législatives 2024 maintenu par défaut, Incertain tirant uniformément sur [0 % ; 100 %]), un
                curseur global et 3 curseurs par électorat éliminé du 1er tour. Réglage actif :{' '}
                <strong>Électeurs de gauche {pct(settings.republicanFront.gauche * 100, 0)}</strong>,{' '}
                <strong>Électeurs du centre {pct(settings.republicanFront.centre * 100, 0)}</strong>,{' '}
                <strong>Électeurs de droite {pct(settings.republicanFront.droite * 100, 0)}</strong>.
              </li>
              <li>
                <strong>
                  Cas particulier — Report gauche hors LFI → Mélenchon (<code>lfi_rn.gauche</code>) :
                </strong>{' '}
                le report des électeurs de gauche modérée / écologiste / communiste (Glucksmann, Tondelier,
                Roussel) vers Jean-Luc Mélenchon face au RN n’a jamais été mesuré à une présidentielle (le
                taux de 72 % des législatives 2024 portait sur des candidatures uniques NFP, alors que les
                déclarations 2027 corrigées en logit donnent 36 %). Ce report est piloté directement par le
                curseur <strong>Électeurs de gauche (hors LFI)</strong> selon la même règle à 3 ancres
                (100 % = 72 % repère NFP 2024, 55 % = 56,7 % repère Prés. 2017, 0 % = 45,9 % niveau Prés. 2022 ; taux
                actif :{' '}
                <strong className="num">{num(activeProfiles.lfi_rn.gauche.finalist, 0)} %</strong>), complété
                par une <strong>analyse de sensibilité affichée</strong> sur les duels LFI – RN et un{' '}
                <strong>tirage triangulaire dans Monte-Carlo</strong> couvrant la plage{' '}
                <strong className="num">
                  [{settings.lfiLeftTransferRange[0]} % ; {settings.lfiLeftTransferRange[1]} %]
                </strong>{' '}
                autour du taux actif (plage configurable dans les réglages).
              </li>
              <li>
                <strong>Extrême droite hors finaliste RN (S4) :</strong> le rattachement forcé à la fidélité RN
                (0 / 96 / 4) est supprimé ; la ligne unique mesurée est la moyenne simple des observations
                présidentielles admissibles R1.8 de Dupont-Aignan 2017 (27 / 30 / 43) et Zemmour 2022
                (9,5 / 75,5 / 15), soit <strong>18,25 / 52,75 / 29 %</strong>, avec tirage uniforme entre ces deux
                bornes dans Monte-Carlo.
              </li>
            </ul>
            <p>
              <strong>Option déclarations 2027 (désactivée par défaut) :</strong> les reports déclarés à
              l’automne 2026 (Harris Interactive / Odoxa) peuvent être activés seuls ou en mélange pondéré,
              avec redressement sur échelle <em>logit multinomial</em> (δ_finaliste ={' '}
              {num(declaredTransfers.logitCorrection.deltaFinalist, 2)}, δ_RN ={' '}
              {num(declaredTransfers.logitCorrection.deltaRn, 2)} par rapport à l’abstention) d’après l’écart
              moyen constaté entre campagne et jour du vote en 2017 et 2022.
            </p>
            <p>
              <strong>Duels hors RN :</strong> pour un duel gauche contre centre ou droite, les reports
              proviennent des enquêtes « jour du vote » des présidentielles 2007 (Sarkozy – Royal) et 2012
              (Hollande – Sarkozy). Une matrice symétrique de repli ne s’applique qu’aux duels entre deux
              candidats du même côté.
            </p>
          </div>

          <Table caption="Préréglages du front républicain par électorat qui se reporte (interpolation directe 2022 ↔ 2024)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Préréglage</th>
                <th className={`${th} text-right`}>Élect. gauche</th>
                <th className={`${th} text-right`}>Élect. centre</th>
                <th className={`${th} text-right`}>Élect. droite</th>
                <th className={th}>Interprétation</th>
              </tr>
            </thead>
            <tbody>
              {RF_PRESET_ROWS.map((row) => {
                const p = REPUBLICAN_FRONT_PRESETS[row.id]
                return (
                  <tr key={row.id} className="border-b border-rule/60">
                    <td className={`${td} font-medium`}>{row.label}</td>
                    <td className={`${td} num text-right`}>{pct(p.gauche * 100, 0)}</td>
                    <td className={`${td} num text-right`}>{pct(p.centre * 100, 0)}</td>
                    <td className={`${td} num text-right`}>{pct(p.droite * 100, 0)}</td>
                    <td className={`${td} text-ink-2`}>{row.desc}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>

          <Table
            caption={`Reports effectifs appliqués dans le scénario actif (${
              settings.transferSource === 'declared2027'
                ? 'source : déclarations 2027 corrigées en logit'
                : settings.transferSource === 'blend'
                  ? `mélange ${pct((1 - settings.declaredWeight) * 100, 0)} base historique / ${pct(settings.declaredWeight * 100, 0)} déclarations 2027`
                  : 'base historique 2022 ↔ 2024 par paire exacte de finalistes'
            })`}
          >
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Paire de finalistes</th>
                <th className={th}>Électorat (curseur 2022 ↔ 2024)</th>
                <th className={`${th} text-right`}>Finaliste</th>
                <th className={`${th} text-right`}>RN</th>
                <th className={`${th} text-right`}>Abst./BN</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_IDS.flatMap((pid) => {
                const meta = transfers.profiles.find((p) => p.id === pid)!
                return (['gauche', 'centre', 'droite'] as const).map((b, idx) => {
                  const eff = activeProfiles[pid][b]
                  const strength = frontStrengthForBloc(b, settings.republicanFront)
                  const overridden = Boolean(settings.transferOverrides[pid]?.[b])
                  return (
                    <tr key={`${pid}-${b}`} className="border-b border-rule/60">
                      <td className={`${td} font-medium`}>{idx === 0 ? meta.label : ''}</td>
                      <td className={td}>
                        {pid === 'lfi_rn' && b === 'gauche' ? 'Électeurs de gauche (hors LFI)' : BLOC_VOTERS[b]}
                        {!overridden && settings.transferSource !== 'declared2027' && (
                          <span className="ml-1.5 text-xs text-ink-3">
                            ({pct(strength * 100, 0)}
                            {pid === 'lfi_rn' && b === 'gauche'
                              ? `, MC ${settings.lfiLeftTransferRange[0]}–${settings.lfiLeftTransferRange[1]} %`
                              : ''}
                            )
                          </span>
                        )}
                        {overridden && <span className="ml-1.5 text-xs text-ballpoint">(modifié)</span>}
                      </td>
                      <td className={`${td} num text-right font-medium`}>{num(eff.finalist, 1)} %</td>
                      <td className={`${td} num text-right`}>{num(eff.rn, 1)} %</td>
                      <td className={`${td} num text-right text-ink-3`}>{num(eff.abstention, 1)} %</td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </Table>

          <ProvenanceLegend />

          <div className="grid gap-6 md:grid-cols-2">
            {transfers.profiles.map((p) => (
              <Table key={p.id} caption={`${p.label} — source brute Ipsos-Talan 2024 (ancre 100 %)`}>
                <thead>
                  <tr className="border-b border-rule">
                    <th className={th}>Électorat</th>
                    <th className={`${th} text-right`}>Finaliste</th>
                    <th className={`${th} text-right`}>RN</th>
                    <th className={`${th} text-right`}>Abst./BN</th>
                  </tr>
                </thead>
                <tbody>
                  {BLOCS.map((b) => {
                    const r = p.rows[b]
                    return (
                      <tr key={b} className="border-b border-rule/60">
                        <td className={td}>{BLOC_VOTERS[b]}</td>
                        <td className={`${td} text-right`}>
                          <ProvenanceValue value={r.finalist} provenance={r.provenance.finalist} />
                        </td>
                        <td className={`${td} text-right`}>
                          <ProvenanceValue value={r.rn} provenance={r.provenance.rn} />
                        </td>
                        <td className={`${td} text-right`}>
                          <ProvenanceValue value={r.abstention} provenance={r.provenance.abstention} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Table caption="Repères présidentiels Macron – Le Pen : enquêtes « jour du vote » 2017 et 2022 (ancre 0 %)">
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Électorat</th>
                  <th className={`${th} text-right`}>2017 (Mac / RN / Abst)</th>
                  <th className={`${th} text-right`}>2022 (Mac / RN / Abst)</th>
                </tr>
              </thead>
              <tbody>
                {(['gauche', 'centre', 'droite', 'extreme_droite'] as const).map((b) => {
                  const r17 = transfers.presidentialCenterRn.elections['2017'][b]
                  const r22 = transfers.presidentialCenterRn.elections['2022'][b]
                  return (
                    <tr key={b} className="border-b border-rule/60">
                      <td className={td}>{BLOC_VOTERS[b]}</td>
                      <td className={`${td} num text-right`}>
                        {num(r17.finalist, 1)} / {num(r17.rn, 1)} / {num(r17.abstention, 1)}
                      </td>
                      <td className={`${td} num text-right`}>
                        {num(r22.finalist, 1)} / {num(r22.rn, 1)} / {num(r22.abstention, 1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>

            <Table caption="Duels hors RN (gauche vs centre/droite) : présidentielles 2007 et 2012">
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Électorat</th>
                  <th className={`${th} text-right`}>Gauche</th>
                  <th className={`${th} text-right`}>Centre / Droite</th>
                  <th className={`${th} text-right`}>Abst./BN</th>
                </tr>
              </thead>
              <tbody>
                {BLOCS.map((b) => {
                  const r = transfers.nonRnPresidential.leftVsCenterRight[b]
                  return (
                    <tr key={b} className="border-b border-rule/60">
                      <td className={td}>{BLOC_VOTERS[b]}</td>
                      <td className={`${td} num text-right`}>{num(r.left)}</td>
                      <td className={`${td} num text-right`}>{num(r.right)}</td>
                      <td className={`${td} num text-right`}>{num(r.abstention)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>

          <Table caption="Option déclarations 2027 (Harris / Odoxa) : valeurs brutes → après correction logit multinomial">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Profil / Électorat</th>
                <th className={`${th} text-right`}>Brut (Fin / RN / Abst)</th>
                <th className={`${th} text-right`}>Corrigé logit (Fin / RN / Abst)</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_IDS.flatMap((pid) =>
                (['gauche', 'centre', 'droite'] as const).map((b) => {
                  const raw = declaredTransfers.profiles[pid][b]
                  const corr = correctDeclaredRowLogit(raw, declaredTransfers.logitCorrection)
                  return (
                    <tr key={`${pid}-${b}`} className="border-b border-rule/60">
                      <td className={td}>
                        {pid.replace(/_/g, ' ')} · {BLOC_VOTERS[b]}
                      </td>
                      <td className={`${td} num text-right text-ink-3`}>
                        {num(raw.finalist, 0)} / {num(raw.rn, 0)} / {num(raw.abstention, 0)}
                      </td>
                      <td className={`${td} num text-right font-medium`}>
                        {num(corr.finalist, 1)} / {num(corr.rn, 1)} / {num(corr.abstention, 1)}
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </Table>
        </Step>

        {/* ÉTAPE 5 : FLUX BRUTS */}
        <Step id="flux" n={5} title="Second tour unifié en flux bruts (% des inscrits)">
          <div className="prose-method">
            <p>
              Le second tour est calculé directement en pourcentage des électeurs inscrits, sans recalibrage
              post-hoc par camp ni soustraction uniforme sur les électorats de premier tour. Avec une
              participation au 1er tour <em>P</em> ({pct(sr.participation, 1)} dans ce scénario), une part de
              blancs et nuls de {pct(rates.bnShare * 100, 1)} des votants ({pct(sr.blankNull1, 1)} des
              inscrits) et <em>E</em>₁ = {pct(sr.expressed1, 1)} d’exprimés au 1er tour :
            </p>
            <p className="font-mono text-sm">V_A = E₁ · Σ x_c · π(c → A) + (100 − E₁) · a · q_A</p>
            <p>
              <strong>Fidélité des finalistes (S3) :</strong> en base historique (par défaut), la fidélité est
              symétrique et issue des enquêtes « jour du vote » admissibles de 2022 (
              {num(transfers.fidelity.default.loyal, 2)} % de fidélité, {num(transfers.fidelity.default.cross, 2)} %
              de report croisé, {num(transfers.fidelity.default.abstention, 2)} % de non-exprimés), sans biais
              nominal entre finalistes. Les fidélités déclarées d’automne 2026 (Harris : Le Pen{' '}
              {declaredTransfers.fidelity.byCandidate.lepen?.loyal} %, Mélenchon{' '}
              {declaredTransfers.fidelity.byCandidate.melenchon?.loyal} %, autres{' '}
              {declaredTransfers.fidelity.default.loyal} % bruts) ne s’appliquent qu’en mode « Déclarations 2027 » ou
              « Mélange », avec la même correction logit pré-campagne → jour du vote. Un réglage uniforme manuel reste
              disponible. Les électeurs des petits candidats non qualifiés suivent les électorats de référence
              documentés et ajustables dans les réglages.
            </p>
            <p>
              <strong>Non-exprimés du 1er tour (S1 + S2) :</strong> les abstentionnistes ({pct(sr.abstention1, 1)} des
              inscrits) et les blancs/nuls ({pct(sr.blankNull1, 1)} des inscrits, non mesurés séparément) forment un
              réservoir unique de {pct(100 - sr.expressed1, 1)} des inscrits, qui revient voter valablement à hauteur de{' '}
              <em>a</em> = {pct(settings.abstainerMobilization * 100, 1)} (repères : Ifop 2022 déclaratif{' '}
              {pct(rates.rAbs * 100, 1)}, Insee 2017–2022 brut{' '}
              {rates.insee.map((y) => `${y.year} : ${pct(y.share, 1)}`).join(', ')}, soit 21,8 % à 23,2 % en suffrages
              exprimés, défaut 22,5 %). Par défaut, leur orientation est{' '}
              {settings.abstainerAntiRnShare === null ? (
                <>
                  <strong>endogène neutre</strong> (miroir exact des électeurs du 1er tour exprimés au 2nd tour, soit{' '}
                  <strong className="num">{pct(sr.effectiveAbstainerAntiRnShare * 100, 1)}</strong> dans ce scénario,
                  sans bonus de camp)
                </>
              ) : (
                <>
                  réglée manuellement à{' '}
                  <strong className="num">{pct(settings.abstainerAntiRnShare * 100, 0)}</strong> vers l’adversaire du
                  RN (repère Ifop 2022 : 59 %)
                </>
              )}
              . L’abandon net équivalent ({pct(sr.netDropout, 1)}) résulte naturellement du bilan comptable.
            </p>
          </div>

          <Table caption="Repères historiques : participation au 1er tour et abandon net entre les deux tours (2002–2022)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Scrutin</th>
                <th className={th}>Duel</th>
                <th className={`${th} text-right`}>Participation T1</th>
                <th className={`${th} text-right`}>Abandon net (1 − E₂/E₁)</th>
              </tr>
            </thead>
            <tbody>
              {PRESIDENTIAL_ROWS.map((r) => (
                <tr key={r.year} className="border-b border-rule/60">
                  <td className={`${td} num font-medium`}>{r.year}</td>
                  <td className={td}>{r.duel}</td>
                  <td className={`${td} num text-right`}>{pct(r.turnout, 1)}</td>
                  <td className={`${td} num text-right`}>{pct(r.dropout, 2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Step>

        {/* ÉTAPE 6 : MONTE-CARLO & BACKTEST */}
        <Step id="validation" n={6} title="Incertitude Monte-Carlo et validation historique">
          <div className="prose-method">
            <p>
              À {distance(result.monteCarlo.daysToElection)} du 1er tour, le premier risque d’erreur n’est pas
              la marge d’échantillonnage d’un sondage (±2 pts), mais l’évolution de la campagne électorale et
              la variabilité des reports entre les deux tours. Le simulateur exécute{' '}
              {integer(result.monteCarlo.iterations)} tirages déterministes (graine {result.monteCarlo.seed})
              propageant :
            </p>
            <ul>
              <li>
                <strong>Chocs de campagne au 1er tour (règle écrite) :</strong> distribution Student-t à 8
                degrés de liberté en log-ratio. L’écart-type de référence à J−{CAMPAIGN_REF_DAYS} est la valeur
                dont les intervalles [P10 ; P90] des scores de 1er tour de la prévision par défaut couvrent le
                résultat réel dans 80 % des cas, en moyenne simple des trois présidentielles du backtest (2012,
                2017, 2022 ; dates J−150 à J−24 tous les 14 jours ; candidats ≥ 2 %), soit{' '}
                <strong>σ_ref = {num(SIGMA_CAMPAIGN_REF, 3)}</strong> (donnant σ ={' '}
                {num(result.monteCarlo.sigmaLogit, 2)} à J−{result.monteCarlo.daysToElection}, décroissant
                vers un plancher de {num(SIGMA_POLLING_FLOOR, 2)} la dernière semaine). La variance est
                répartie en choc de bloc (50 %), vote utile intra-bloc à somme nulle (30 %) et choc propre par
                candidat (20 %).
              </li>
              <li>
                <strong>Incertitude des candidatures (activée par défaut sans alliance forcée) :</strong>{' '}
                chaque tirage échantillonne d’abord une offre parmi 5 configurations testées au centre et à
                droite (Philippe + Lisnard 40 %, Philippe seul 30 %, Philippe + Attal 15 %, Attal seul 10 %,
                Lagarde seule 5 %). Désactivable dans les paramètres.
              </li>
              <li>
                <strong>Incertitude du 2nd tour :</strong> tirage Dirichlet (κ = 40, soit ±5 à 7 pts par ligne
                de report), choc corrélé sur la position 2022 ↔ 2024 du front républicain (σ = 0,25, borné à
                ±0,50),{' '}
                <strong>
                  tirage uniforme explicite du report gauche hors LFI → Mélenchon sur [
                  {settings.lfiLeftTransferRange[0]} % ; {settings.lfiLeftTransferRange[1]} %]
                </strong>
                , tirage uniforme du report de l’extrême droite hors finaliste entre les deux bornes admissibles
                2017 (27 / 30 / 43 %) et 2022 (9,5 / 75,5 / 15 %), participation (±5 pts), mobilisation des
                non-exprimés (±8,5 pts, couvrant Ifop 14 % et Insee 25,3 %) et orientation (±8 pts centrée sur le
                partage neutre ou manuel), fidélité (±2,5 pts) et choc commun national (σ = 3,0 pts face au RN, 2,0 pts
                hors RN).
              </li>
              <li>
                <strong>Échelles fixes 0–100 % :</strong> toutes les barres de probabilités de victoire («
                Issues simulées ») et de scores du 1er tour sont tracées sur une échelle fixe de 0 % à 100 %
                avec un repère à 50 %.
              </li>
            </ul>
            <p>
              <strong>Distinction stricte hors échantillon / en échantillon :</strong> les cinq tableaux
              ci-dessous séparent explicitement les évaluations <em>hors échantillon</em> (aucun paramètre
              estimé sur l’élection testée : ratio croisé 2017↔2022, vote utile avec cibles de l’autre
              scrutin, reports 2024 et présidentielle croisée sur 2017 et 2022) des{' '}
              <em>contrôles internes / de calibration</em> (cibles moyennes 2017–2022, ancre 2022 sur 2022,
              cohérence agrégée des 342 duels 2024, couverture empirique à 80 %). Les élections évaluées sont les
              présidentielles 2012, 2017 et 2022 (aucune autre élection), en validation croisée
              « leave-one-out » ; le 2nd tour 2012 (Hollande – Sarkozy, sans RN) est exclu du backtest du front
              républicain. Poids des scénarios de candidatures (40/30/15/10/5 %) : hypothèse non sourcée.
            </p>
            <p>
              <strong>Aides à la lecture (v2.2) :</strong> le préréglage « Incertain » du front républicain tire
              à chaque itération Monte-Carlo une position commune uniforme entre 2022 et 2024 pour les trois
              électorats (0,5 en affichage déterministe ; défaut inchangé : législatives 2024). Le bloc
              « Repère » du 2nd tour signale tout écart au sondage moyen supérieur à 2 × le RMSE historique des
              sondages directs et indique le comportement implicite des sans-intention. Un tableau de
              sensibilité repliable donne, sans Monte-Carlo, l’effet des réglages non mesurés (front républicain,
              projection de campagne, fuite inter-blocs, concentration du centre, nouveaux votants,
              mobilisation des abstentionnistes, fidélité des finalistes, report gauche hors LFI).
            </p>
            <p>
              <strong>Sondages de l’entre-deux-tours (P4, affichage seulement) :</strong> le bloc du 2nd tour
              affiche pour mémoire deux tableaux distincts, sans jamais les intégrer dans aucun calcul ni dans les
              mesures d’écart historique avant 1er tour (<code>pollBiasGaps</code>, <code>directPollRmse</code>) :
              (i) l’ensemble des sondages publiés entre les deux tours jusqu’à l’interdiction légale en 2017
              (22 sondages, 23/04 au 05/05/2017) et 2022 (42 sondages, 10/04 au 22/04/2022) pour Macron – Le Pen
              (2002 exclu) ; (ii) les sondages de circonscription d’entre-deux-tours des législatives 2024 (duels
              uniquement, triangulaires exclues, stockés dans <code>legislative-duel-polls-2024.json</code>) selon
              une règle d’identité stricte des partis écrite candidat par candidat (un allié ou une coalition ne
              compte pas). Après inventaire (Wikipédia FR/EN, notices de la Commission des sondages n° 9865 à
              9888 et publications d’instituts de juillet 2024), seul un duel de circonscription d’entre-deux-tours
              a été identifié : la 6e circonscription du Calvados (Ifop-Fiducial pour Sud Radio, 02-03/07/2024,
              n = 611 inscrits, Renaissance – RN : Élisabeth Borne 54 % contre 56,36 % au résultat officiel),
              affiché uniquement sur le duel Attal – Le Pen. Aucun sondage de circonscription d’entre-deux-tours
              n’ayant été identifié pour les autres paires de partis (notamment LFI – RN, Horizons – RN, LR – RN,
              Place publique – RN), rien n’est affiché pour ces duels.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Table caption="1er tour — Dernière semaine (hors échantillon sur le ratio croisé 2017 ↔ 2022)">
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Année</th>
                  <th className={`${th} text-right`}>Sondages</th>
                  <th className={`${th} text-right`}>RMSE brut</th>
                  <th className={`${th} text-right`}>Écart max</th>
                  <th className={`${th} text-right`}>RMSE ratio croisé</th>
                </tr>
              </thead>
              <tbody>
                {bt.firstRoundEve.map((r) => (
                  <tr key={r.year} className="border-b border-rule/60">
                    <td className={`${td} num font-medium`}>{r.year}</td>
                    <td className={`${td} num text-right`}>{r.pollCount}</td>
                    <td className={`${td} num text-right font-medium`}>{num(r.rawRmse, 2)} pts</td>
                    <td className={`${td} num text-right`}>{num(r.rawMaxError, 2)} pts</td>
                    <td className={`${td} num text-right text-ink-3`}>{num(r.crossCorrectedRmse, 2)} pts</td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <Table
              caption={`1er tour en campagne (filtre strict sans mélange d’offres) : RMSE croisé = hors échantillon (cibles de l’autre élection) ; RMSE moy. 17–22 = en échantillon`}
            >
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Année (horizon)</th>
                  <th className={`${th} text-right`}>Inst.</th>
                  <th className={`${th} text-right`}>RMSE brut</th>
                  <th className={`${th} text-right`}>RMSE croisé (hors éch.)</th>
                  <th className={`${th} text-right`}>RMSE 17–22 (en éch.)</th>
                  <th className={`${th} text-right`}>RMS logit</th>
                </tr>
              </thead>
              <tbody>
                {bt.firstRoundCampaign.map((r) => (
                  <tr key={r.year} className="border-b border-rule/60">
                    <td className={`${td} font-medium`}>
                      <span className="num">{r.year}</span>{' '}
                      <span className="block text-xs font-normal text-ink-3">
                        J−{r.effectiveDaysBefore} ({date(r.targetDate)})
                        {r.usedStabilizedHorizon ? ' · offre stabilisée' : ''}
                      </span>
                    </td>
                    <td className={`${td} num text-right`}>{r.institutesUsed}</td>
                    <td className={`${td} num text-right text-ink-3`}>{num(r.rmse, 2)} pts</td>
                    <td className={`${td} num text-right font-medium`}>{num(r.crossProjectedRmse, 2)} pts</td>
                    <td className={`${td} num text-right text-ink-3`}>{num(r.projectedRmse, 2)} pts</td>
                    <td className={`${td} num text-right`}>{num(r.empiricalLogitRms, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <Table caption="Contrôle de calibration — Couverture empirique des intervalles Monte-Carlo à 80 % ([P10 ; P90]) sur 2012, 2017 et 2022 (candidats ≥ 2 %, une date par élection, σ_ref actuel)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Scrutin</th>
                <th className={`${th} text-right`}>σ_logit</th>
                <th className={`${th} text-right`}>1er tour (brut)</th>
                <th className={`${th} text-right`}>1er tour (croisé)</th>
                <th className={`${th} text-right`}>2nd tour (IC 80 %, largeur et CRPS vs réel)</th>
              </tr>
            </thead>
            <tbody>
              {bt.coverage80.map((r) => (
                <tr key={r.year} className="border-b border-rule/60">
                  <td className={`${td} font-medium`}>
                    <span className="num">{r.year}</span>{' '}
                    <span className="text-xs font-normal text-ink-3">
                      (J−{r.effectiveDaysBefore}
                      {r.usedStabilizedHorizon ? ', offre stabilisée' : ''})
                    </span>
                  </td>
                  <td className={`${td} num text-right`}>{num(r.sigmaLogit, 2)}</td>
                  <td className={`${td} num text-right`}>
                    {r.coveredRaw} / {r.evaluatedCount} ({pct((100 * r.coveredRaw) / r.evaluatedCount, 0)})
                  </td>
                  <td className={`${td} num text-right font-medium`}>
                    {r.coveredCrossProjected} / {r.evaluatedCount} (
                    {pct((100 * r.coveredCrossProjected) / r.evaluatedCount, 0)})
                  </td>
                  <td className={`${td} num text-right`}>
                    {r.secondRoundP10 === null || r.secondRoundP90 === null || r.secondRoundActual === null ? (
                      <span className="text-ink-3">exclu (2nd tour sans RN)</span>
                    ) : (
                      <>
                        [{pct(r.secondRoundP10, 1)} ; {pct(r.secondRoundP90, 1)}] · réel{' '}
                        {pct(r.secondRoundActual, 1)}{' '}
                        <span className={r.secondRoundCovered ? 'font-medium text-ballpoint' : 'text-hypo'}>
                          ({r.secondRoundCovered ? 'couvert' : 'hors IC'})
                        </span>
                        {r.secondRoundWidth80 !== null && r.secondRoundCrps !== null && (
                          <span className="block text-xs font-normal text-ink-3">
                            larg. {num(r.secondRoundWidth80, 1)} pts · CRPS {num(r.secondRoundCrps, 2)}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <SigmaCalibrationBlock />

          <Table caption="2nd tour présidentiel (en connaissant le 1er tour réel) : score Macron (% exprimés, moteur P1-bis) — Lég. 2024, Prés. croisée et LOO R2.4 sont hors échantillon ; l’ancre 2022 est en échantillon sur 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Année</th>
                <th className={`${th} text-right`}>Résultat réel</th>
                <th className={`${th} text-right`}>Ancre Lég. 2024 (100 %, hors éch.)</th>
                <th className={`${th} text-right`}>LOO R2.4 (milieu hors ancre)</th>
                <th className={`${th} text-right`}>Prés. croisée (hors éch.)</th>
                <th className={`${th} text-right`}>Ancre Prés. 2022 (0 %)</th>
                <th className={`${th} text-right`}>Sondages T2 à J−{bt.daysBefore}</th>
              </tr>
            </thead>
            <tbody>
              {bt.secondRoundPresidential.map((r) => (
                <tr key={r.year} className="border-b border-rule/60">
                  <td className={`${td} num font-medium`}>{r.year}</td>
                  <td className={`${td} num text-right font-semibold`}>{pct(r.actualAntiRn, 2)}</td>
                  <td className={`${td} num text-right`}>
                    {pct(r.predLeg2024, 2)} ({pts(r.predLeg2024 - r.actualAntiRn, 1)})
                  </td>
                  <td className={`${td} num text-right font-medium`}>
                    {pct(r.predLooUncertainMidpoint, 2)} ({pts(r.predLooUncertainMidpoint - r.actualAntiRn, 1)})
                    <span className="block text-xs font-normal text-ink-3">
                      ancres {r.looAnchors.join(' ↔ ')}
                    </span>
                  </td>
                  <td className={`${td} num text-right`}>
                    {pct(r.predCrossPresidential, 2)} ({pts(r.predCrossPresidential - r.actualAntiRn, 1)})
                  </td>
                  <td className={`${td} num text-right`}>
                    {pct(r.predPres2022, 2)} ({pts(r.predPres2022 - r.actualAntiRn, 1)})
                    {r.year === 2022 && (
                      <span className="block text-xs font-normal text-ink-3">(en échantillon)</span>
                    )}
                  </td>
                  <td className={`${td} num text-right text-ink-3`}>
                    {r.directPollsAtDistance !== null ? pct(r.directPollsAtDistance, 1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <SecondRoundP1AuditBlock />
          <SecondRoundP3BudgetBlock />

          <Table caption="Contrôle interne (en échantillon) sur les 342 duels agrégés des législatives 2024 (Ipsos-Talan brute vs urnes)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Type de duel</th>
                <th className={`${th} text-right`}>Circos</th>
                <th className={`${th} text-right`}>Finaliste réel</th>
                <th className={`${th} text-right`}>Prédit (Ipsos brut)</th>
                <th className={`${th} text-right`}>Écart</th>
                <th className={`${th} text-right`}>Abandon net réel</th>
              </tr>
            </thead>
            <tbody>
              {bt.legislatives2024Coherence.map((r) => (
                <tr key={r.profileId} className="border-b border-rule/60">
                  <td className={td}>{r.label}</td>
                  <td className={`${td} num text-right`}>{r.constituenciesCount}</td>
                  <td className={`${td} num text-right font-medium`}>{pct(r.actualFinalistPct, 2)}</td>
                  <td className={`${td} num text-right`}>{pct(r.predictedFinalistPct, 2)}</td>
                  <td className={`${td} num text-right`}>{pts(r.gapPts, 2)}</td>
                  <td className={`${td} num text-right text-ink-3`}>{pct(r.actualNetDropout, 2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Step>

        {/* LIMITES ET SOURCES */}
        <section
          id="limites"
          aria-labelledby="limites-title"
          className="scroll-mt-6 border-t border-rule pt-8"
        >
          <h3 id="limites-title" className="text-xl font-bold tracking-tight">
            Limites, non-réponses et sources
          </h3>
          <div className="prose-method mt-4">
            <p>
              <strong>Principales limites :</strong> l’offre de candidatures 2027 n’est pas arrêtée (des
              candidats peuvent se retirer, fusionner ou apparaître ; l’option « incertitude des candidatures
              » permet d’en mesurer l’impact) ; la projection temporelle reste conditionnelle et ne peut
              anticiper un événement exogène de campagne ; le niveau réel du front républicain en mai 2027 et
              surtout le report de la gauche hors LFI vers Jean-Luc Mélenchon n’ont pas été observés à une
              présidentielle (d’où les curseurs dédiés, l’analyse de sensibilité et les tirages Monte-Carlo) ;
              enfin, le devenir au 2nd tour des votants blancs et nuls du 1er tour n’est mesuré par aucune
              enquête publique.
            </p>
            {NO_INTENTION && (
              <p>
                <strong>Part sans intention de vote dans les sondages directs de 2nd tour :</strong> selon les
                instituts et les duels, {range(NO_INTENTION.min, NO_INTENTION.max)} des personnes interrogées
                n’expriment aucun choix :
              </p>
            )}
          </div>

          {NO_INTENTION && (
            <div className="mt-4">
              <Table caption="Sondages directs de 2nd tour publiant la part sans intention de vote">
                <thead>
                  <tr className="border-b border-rule">
                    <th className={th}>Institut</th>
                    <th className={th}>Terrain</th>
                    <th className={th}>Duel</th>
                    <th className={th}>Sans intention de vote</th>
                  </tr>
                </thead>
                <tbody>
                  {NO_INTENTION.polls.map((p) => {
                    const [c1, c2] = Object.keys(p.scores)
                    return (
                      <tr
                        key={`${p.institute}-${p.fieldwork.end}-${c1}-${c2}`}
                        className="border-b border-rule/60"
                      >
                        <td className={`${td} font-medium`}>{p.institute}</td>
                        <td className={`${td} num`}>{fieldwork(p.fieldwork)}</td>
                        <td className={td}>
                          {cand(c1!).shortName} – {cand(c2!).shortName}
                        </td>
                        <td className={td}>
                          <a
                            href={p.noIntention!.source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="link"
                          >
                            {noIntentionLabel(p.noIntention!)}
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          )}

          <div className="prose-method mt-6">
            <h4 className="font-semibold text-ink">Sources principales</h4>
            <ul>
              {polls.collection.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="link">
                    {s.label}
                  </a>
                </li>
              ))}
              <li>
                <strong>
                  Historique des vagues 2025–2027 ({pollHistory.polls.length} sondages archivés)
                </strong>{' '}
                — {pollHistory.description}
              </li>
              {Object.values(transfers.sources)
                .filter((s) => s.url)
                .map((s) => (
                  <li key={`${s.label}-${s.url}`}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="link">
                      {s.label}
                    </a>{' '}
                    — {s.description}
                  </li>
                ))}
              {declaredTransfers.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="link">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </article>
  )
}
