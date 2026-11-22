import type { ReactNode } from 'react'
import { simulationData } from '../../data/schema'
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
import { MIN_MINOR_INSTITUTES, POLL_HALF_LIFE_DAYS, SAMPLE_SIZE_CAP, windowDaysOf } from '../../domain/pollAverage'
import { noIntentionRange, presidentialDropout, secondRoundDropout } from '../../domain/secondRound'
import {
  REPUBLICAN_FRONT_PRESETS,
  correctDeclaredRowLogit,
  effectiveProfiles,
  frontStrengthForProfile,
} from '../../domain/transfers'
import { BLOCS } from '../../domain/types'
import type { PollOrigin, PollStatus, ProfileId, SimulationResult } from '../../domain/types'
import { backtestReport, newVoterReferenceRates } from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { BLOC_LABELS, BLOC_VOTERS, cand } from '../candidates'
import { date, distance, fieldwork, integer, noIntentionLabel, num, pct, pts, range } from '../format'
import { Link } from '../Link'
import { ProvenanceLegend, ProvenanceValue } from './Provenance'

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
  ['reports', 'Reports et front républicain (rejet du RN)'],
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
    id: 'none' as const,
    label: 'Effacé (0 %)',
    desc: 'Érosion maximale du barrage anti-RN : les électorats éloignés basculent massivement vers l’abstention/blanc.',
  },
  {
    id: 'eroded2027' as const,
    label: 'Érodé 2027 (défaut)',
    desc: 'Prolonge modérément l’érosion 2017 → 2022 tout en différenciant le double rejet face à LFI.',
  },
  {
    id: 'level2022' as const,
    label: 'Niveau 2022 (75 %)',
    desc: 'Repère présidentiel 2022 (Macron – Le Pen : 58,55 % réel, reproduit à +0,4 pt par le modèle).',
  },
  {
    id: 'level2017' as const,
    label: 'Niveau 2017 (100 %)',
    desc: 'Barrage fort de type présidentielle 2017 / législatives 2024 (taux Ipsos-Talan sans double décote sur LFI).',
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
  ...([
    [2017, reference2017],
    [2022, reference2022],
  ] as const).map(([year, ref]) => ({
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
    <div className="overflow-x-auto rounded-lg bg-surface p-1 shadow-[var(--ballot-shadow)]">
      <table className="w-full min-w-[34rem] text-sm">
        {caption && <caption className="px-3 pb-1 pt-2 text-left text-ink-3">{caption}</caption>}
        {children}
      </table>
    </div>
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
          Le simulateur enchaîne six étapes publiques et auditées. Chaque chiffre reflète le scénario actif sur le{' '}
          <Link to="simulateur">simulateur</Link>. Les stratégies déterministes non validées hors échantillon (biais de
          campagne fixe, corrections par candidat 2017–2022, inférence écologique de Goodman non contrainte, redressement
          spéculatif de participation au 1er tour et alliances non testées) ont été retirées au profit d’un modèle sobre,
          explicite et accompagné d’intervalles d’incertitude probabilistes. Aucun paramètre par défaut n’est recalibré
          sur les sondages directs de second tour 2027.
        </p>
      </div>

      <nav aria-label="Étapes du calcul" className="mt-6">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map(([id, title], i) => (
            <li key={id}>
              <Link
                to="methodologie"
                hash={id}
                className="inline-flex items-baseline gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium shadow-[var(--ballot-shadow)] hover:text-ballpoint"
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
              Dans la fenêtre retenue ({windowDaysOf(polls)} jours jusqu’au {date(polls.asOf)}), on conserve le dernier
              sondage de chaque institut. Plutôt qu’une moyenne arithmétique simple (qui donne le même poids à un
              sondage vieux de 7 semaines et à un sondage de la veille), chaque institut <em>i</em> reçoit un poids
              combiné fraîcheur × échantillon :
            </p>
            <p className="font-mono text-sm">
              w_i = 2<sup>−âge / {POLL_HALF_LIFE_DAYS}</sup> × √(min(n_i, {integer(SAMPLE_SIZE_CAP)}) / 1 000)
            </p>
            <p>
              La demi-vie de {POLL_HALF_LIFE_DAYS} jours divise par deux le poids d’un sondage toutes les deux semaines,
              tout en plafonnant l’effet de taille à {integer(SAMPLE_SIZE_CAP)} répondants afin qu’une très grande
              enquête ancienne n’écrase pas les mesures récentes.
            </p>
            <p>
              <strong>Petits candidats et paires propres :</strong> un petit candidat n’entre dans l’offre de base que
              s’il est testé par au moins {MIN_MINOR_INSTITUTES} instituts distincts ({result.eligibleMinors.length}{' '}
              retenus : {result.eligibleMinors.map((id) => cand(id).shortName).join(', ') || 'aucun'} ;{' '}
              {result.excludedMinors.length} écartés faute de recul suffisant :{' '}
              {result.excludedMinors.map((id) => cand(id).shortName).join(', ') || 'aucun'}). L’identification de ses
              donneurs exige des paires strictement <em>ceteris paribus</em> (un seul candidat d’écart entre deux
              hypothèses d’un même institut), afin qu’aucune variation liée à un autre candidat ne lui soit imputée.
            </p>
            <p>
              <strong>Projection d’offre intra-institut :</strong> lorsqu’un institut récent ne teste pas exactement
              l’offre cible (par exemple Odoxa ou Cluster17 sans Gabriel Attal sur leur hypothèse principale), le
              simulateur mesure les transferts sur paires propres mono-candidat des autres instituts et projette
              l’hypothèse la plus propre à distance ≤ 2 candidats, au lieu d’écarter l’institut ou de retenir une
              hypothèse encombrée de candidats marginaux.
            </p>
          </div>

          <Table caption={`Sondages dans la fenêtre (${inWindow.length} sondages, ${result.institutesUsed} instituts retenus)`}>
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
              Les alliances ne sont plus estimées par transposition des reports de second tour des législatives 2024 :
              seules les configurations effectivement testées par au moins un institut de la période sont proposées (
              {PROPOSED_ALLIANCES.length} alliances simples et {TESTED_COMBOS.length} combinaisons, accessibles dans la
              section repliable des paramètres). Activer une alliance sélectionne les hypothèses où le candidat rallié
              est absent et où le leader reste seul candidat principal de son camp : ce sont donc les sondés eux-mêmes
              qui répartissent ses voix.
            </p>
          </div>
        </Step>

        {/* ÉTAPE 3 : PROJECTION TEMPORELLE */}
        <Step id="projection" n={3} title="Projection temporelle optionnelle vers avril 2027">
          <div className="prose-method">
            <p>
              Par défaut, le simulateur affiche la <strong>photographie actuelle</strong> des sondages (projection
              désactivée). L’utilisateur peut basculer en un clic vers la <strong>projection avril 2027</strong>{' '}
              (actuellement <strong>{settings.projection.enabled ? 'activée' : 'désactivée'}</strong>, à J−
              {result.projection.daysRemaining}, facteur d’horizon{' '}
              <span className="num">{pct(result.projection.horizonFactor * 100, 0)}</span>). Contrairement aux
              extrapolations candidat par candidat retirées en v2, la projection repose sur trois mécanismes structurels
              qui <strong>s’annulent tous exactement le jour du scrutin</strong> (facteur{' '}
              <span className="font-mono text-xs">h = min(1, joursRestants / {PROJECTION_HORIZON_DAYS})</span>) et dont
              les réglages fins sont regroupés dans les réglages avancés (onglet « Projection 1er tour ») :
            </p>
            <ul>
              <li>
                <strong>Pilier 1 — Vote utile intra-bloc séparé par bloc :</strong> en fin de campagne présidentielle,
                les électeurs d’un camp fragmenté tendent à se regrouper autour de leur candidat le mieux placé pour
                accéder au 2nd tour. L’intensité (0 à 100 %) et le candidat pivot (<em>Auto</em> ou candidat forcé) sont
                réglables séparément pour chacun des quatre blocs. Les cibles de concentration calibrées sur 2017–2022
                sont <strong>{pct(TARGET_CONCENTRATION.gauche * 100, 0)}</strong> à gauche,{' '}
                <strong>{pct(TARGET_CONCENTRATION.centre * 100, 0)}</strong> au centre,{' '}
                <strong>{pct(TARGET_CONCENTRATION.droite * 100, 0)}</strong> à droite et{' '}
                <strong>{pct(TARGET_CONCENTRATION.extreme_droite * 100, 0)}</strong> à l’extrême droite (déjà au-dessus
                du seuil dans les sondages actuels, donc sans poussée artificielle). Une option activable permet de{' '}
                <strong>regrouper centre et droite</strong> autour d’un pivot commun (cible{' '}
                {pct(MERGED_CENTER_RIGHT_TARGET * 100, 0)}, scénario type 2022), mais les 4 blocs séparés restent le
                défaut car le backtest prouve qu’ils améliorent <em>à la fois</em> 2017 et 2022. Trois garde-fous
                empêchent toute concentration caricaturale : <strong>{pct(CROSS_BLOC_LEAK * 100, 0)}</strong> des voix
                cédées fuient vers les blocs voisins, un plancher de <strong>{pct(CANDIDATE_FLOOR, 1)}</strong> protège
                les petits partis identitaires, et le drainage épargne proportionnellement un co-favori déjà fort.
              </li>
              <li>
                <strong>Pilier 2 — Amortissement léger des écarts précoces (mean reversion) :</strong> à 5 mois du
                scrutin, les totaux de blocs peuvent s’écarter temporairement des équilibres électoraux de fond. Les
                totaux de blocs sont rappelés en douceur vers des fondamentaux structurels (50 % présidentielles
                2017–2022 + 50 % scrutins nationaux 2024), avec un poids maximal de{' '}
                <strong>{pct(MAX_PRIOR_WEIGHT * 100, 0)}</strong> à J−{PROJECTION_HORIZON_DAYS} (curseur actuel :{' '}
                <span className="num">{pct(settings.projection.meanReversion * 100, 0)}</span>), qui décroît
                linéairement jusqu’à 0 le jour du vote.
              </li>
              <li>
                <strong>Pilier 3 — Historique 2025–2027 et tendance récente amortie :</strong> la synchronisation archive
                automatiquement l’historique des vagues de 1er tour depuis Wikipedia ({pollHistory.polls.length} vagues
                {historyStart && historyEnd ? ` du ${date(historyStart)} au ${date(historyEnd)}` : ''}). Une pente
                récente est calculée par régression pondérée puis amortie exponentiellement sur{' '}
                <strong>{TREND_DAMPING_DAYS} jours</strong>, recentrée à somme nulle et plafonnée à{' '}
                <strong>±{num(MAX_TREND_PTS, 1)} pts</strong> par candidat (curseur actuel :{' '}
                <span className="num">{pct(settings.projection.dampedTrend * 100, 0)}</span>). Cet historique alimente
                également le graphique de trajectoire temporelle et son cône d’incertitude à 80 % jusqu’au{' '}
                {date(polls.electionDate)}.
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
                <th className={`${th} text-right`}>Fondamental de bloc</th>
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
                    <td className={`${td} num text-right`}>{pct(prior, 0)}</td>
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
        <Step id="reports" n={4} title="Matrices de reports et front républicain (vote de rejet du RN)">
          <div className="prose-method">
            <p>
              Pour les duels face au RN, la <strong>base historique</strong> part des taux bruts de l’enquête
              Ipsos-Talan du 7 juillet 2024 (sans régression écologique de Goodman), <strong>modulés de façon
              homogène sur les 4 types de duels</strong> par la force du <strong>front républicain</strong> (vote de
              rejet du RN). En 2017 comme en 2022, environ 42 à 43 % des électeurs d’Emmanuel Macron au 2nd tour
              déclaraient voter avant tout pour faire barrage au RN : ce socle anti-RN concerne donc{' '}
              <em>tous les duels face au RN</em> (centre, droite, gauche modérée et LFI), et pas seulement le centre.
            </p>
            <p>
              <strong>Pourquoi une modulation homogène plutôt qu’un mélange réservé au centre :</strong> un ajustement
              limité aux seuls duels <code>ensemble_rn</code> créait une incohérence interne où les électeurs de gauche
              se reportaient mieux sur un candidat LR (70 % issus des législatives 2024) que sur un candidat du centre
              (62 %). Désormais, les 4 profils suivent la même logique transparente sur échelle{' '}
              <em>logit multinomial</em> (par rapport à l’abstention) :
            </p>
            <ul>
              <li>
                <strong>Repère barrage fort (100 %, niveau 2017 / 2024) :</strong> les profils{' '}
                <code>ensemble_rn</code>, <code>ecolo_ps_pcf_rn</code> et <code>lfi_rn</code> partent directement des
                taux Ipsos-Talan 2024 — qui mesurent <em>déjà</em> la différence de compatibilité selon l’adversaire
                (72 % gauche → centre, 54 % centre → PS/écolo, 43 % centre → LFI), sans double pénalité cachée sur LFI.
                Seule la ligne <code>gauche → lr_rn</code> (70 % en 2024, presque égale au centre à cause des
                désistements locaux) reçoit un léger ajustement de distance politique (δ_finaliste = −0,35, δ_RN =
                +0,55) afin de rester strictement sous <code>gauche → centre</code>.
              </li>
              <li>
                <strong>Érosion du front républicain (e = 1 − F) :</strong> calibrée sur l’écart réel mesuré entre la
                présidentielle <strong>2017 (100 %)</strong> et <strong>2022 (75 %)</strong>, l’érosion réduit le report
                barrage selon la distance politique entre électorat et finaliste (δ_finaliste = −0,45·e sur bloc voisin,
                −1,35·e sur bloc opposé, −1,50·e sur bloc éloigné). Le recul du front républicain bascule{' '}
                <strong>très majoritairement vers l’abstention et le vote blanc</strong>, avec un glissement direct
                modéré vers le RN (δ_RN = +0,10·e sur bloc voisin, +0,15·e sur les électorats déjà à ≥ 6 % de vote RN,
                et +1,40·e uniquement sur les taux planchers &lt; 6 % hérités des désistements locaux de 2024). Les
                électeurs du même camp que le finaliste et ceux rattachés au camp RN (Reconquête / DLF) restent
                inchangés.
              </li>
              <li>
                <strong>Réglage direct global et séparé par famille de duel :</strong> parce que le front républicain
                peut s’éroder différemment selon l’affiche du 2nd tour (en particulier face à LFI où le double rejet au
                centre et à droite contrebalance le rejet du RN), le simulateur expose directement 4 préréglages
                historiques, un curseur global et 3 curseurs indépendants. Réglage actif :{' '}
                <strong>Centre / Droite {pct(settings.republicanFront.centerRight * 100, 0)}</strong>,{' '}
                <strong>Gauche modérée {pct(settings.republicanFront.moderateLeft * 100, 0)}</strong>,{' '}
                <strong>LFI {pct(settings.republicanFront.lfi * 100, 0)}</strong>.
              </li>
            </ul>
            <p>
              <strong>Option déclarations 2027 (désactivée par défaut) :</strong> les tableaux de reports publiés à
              l’automne 2026 (Harris Interactive / Odoxa) mesurent des intentions très précoces mais révèlent des
              asymétries réelles entre candidats. Lorsqu’elle est activée (seule ou en mélange pondéré), chaque ligne
              non-camp est redressée sur échelle <em>logit multinomial</em> (δ_finaliste ={' '}
              {num(declaredTransfers.logitCorrection.deltaFinalist, 2)}, δ_RN ={' '}
              {num(declaredTransfers.logitCorrection.deltaRn, 2)} par rapport à l’abstention) d’après l’écart moyen
              constaté entre déclarations de campagne et jour du vote en 2017 et 2022.
            </p>
            <p>
              <strong>Duels hors RN :</strong> pour un duel gauche contre centre ou droite, les reports proviennent des
              enquêtes « jour du vote » des présidentielles 2007 (Sarkozy – Royal) et 2012 (Hollande – Sarkozy). Une
              matrice symétrique de repli ne s’applique qu’aux duels entre deux candidats du même côté.
            </p>
          </div>

          <Table caption="Préréglages du front républicain (vote de rejet du RN) : repères historiques et défaut 2027">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Préréglage</th>
                <th className={`${th} text-right`}>Centre / Droite</th>
                <th className={`${th} text-right`}>Gauche modérée</th>
                <th className={`${th} text-right`}>LFI</th>
                <th className={th}>Interprétation</th>
              </tr>
            </thead>
            <tbody>
              {RF_PRESET_ROWS.map((row) => {
                const p = REPUBLICAN_FRONT_PRESETS[row.id]
                return (
                  <tr key={row.id} className="border-b border-rule/60">
                    <td className={`${td} font-medium`}>{row.label}</td>
                    <td className={`${td} num text-right`}>{pct(p.centerRight * 100, 0)}</td>
                    <td className={`${td} num text-right`}>{pct(p.moderateLeft * 100, 0)}</td>
                    <td className={`${td} num text-right`}>{pct(p.lfi * 100, 0)}</td>
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
                  : 'base historique modulée par le front républicain actif'
            })`}
          >
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Profil (front républicain actif)</th>
                <th className={th}>Électorat</th>
                <th className={`${th} text-right`}>Finaliste</th>
                <th className={`${th} text-right`}>RN</th>
                <th className={`${th} text-right`}>Abst./BN</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_IDS.flatMap((pid) => {
                const meta = transfers.profiles.find((p) => p.id === pid)!
                const strength = frontStrengthForProfile(pid, settings.republicanFront)
                return (['gauche', 'centre', 'droite'] as const).map((b, idx) => {
                  const eff = activeProfiles[pid][b]
                  const overridden = Boolean(settings.transferOverrides[pid]?.[b])
                  return (
                    <tr key={`${pid}-${b}`} className="border-b border-rule/60">
                      <td className={`${td} font-medium`}>
                        {idx === 0
                          ? `${meta.label}${settings.transferSource !== 'declared2027' ? ` (${pct(strength * 100, 0)})` : ''}`
                          : ''}
                      </td>
                      <td className={td}>
                        {BLOC_VOTERS[b]}
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
              <Table key={p.id} caption={`${p.label} — source brute Ipsos-Talan 2024 (repère 100 %)`}>
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
            <Table caption="Repères présidentiels Macron – Le Pen : enquêtes « jour du vote » 2017 et 2022">
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
                        {num(r17.finalist, 0)} / {num(r17.rn, 0)} / {num(r17.abstention, 0)}
                      </td>
                      <td className={`${td} num text-right`}>
                        {num(r22.finalist, 0)} / {num(r22.rn, 0)} / {num(r22.abstention, 0)}
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
              Le second tour est calculé directement en pourcentage des électeurs inscrits, sans recalibrage post-hoc par
              camp ni soustraction uniforme sur les électorats de premier tour. Avec une participation au 1er tour{' '}
              <em>P</em> ({pct(sr.participation, 1)} dans ce scénario), une part de blancs et nuls de{' '}
              {pct(rates.bnShare * 100, 1)} des votants ({pct(sr.blankNull1, 1)} des inscrits) et{' '}
              <em>E</em>₁ = {pct(sr.expressed1, 1)} d’exprimés au 1er tour :
            </p>
            <p className="font-mono text-sm">
              V_A = E₁ · Σ x_c · π(c → A) + (100 − P) · a · q_A
            </p>
            <p>
              Les finalistes bénéficient d’une fidélité différenciée ({transfers.fidelity.byCandidate.lepen?.loyal} %
              pour Marine Le Pen, {transfers.fidelity.byCandidate.melenchon?.loyal} % pour Jean-Luc Mélenchon,{' '}
              {transfers.fidelity.default.loyal} % par défaut, ajustable en mode uniforme dans les réglages), incluant
              une faible part de reports croisés (1 à 2 %). Les électeurs des petits candidats non qualifiés suivent les
              électorats de référence documentés et ajustables dans les réglages.
            </p>
            <p>
              <strong>Abstentionnistes du 1er tour et couplage au front républicain :</strong> les abstentionnistes du
              1er tour ({pct(sr.abstention1, 1)} des inscrits) reviennent voter valablement à hauteur de <em>a</em> ={' '}
              {pct(settings.abstainerMobilization * 100, 0)} (repères : Ifop 2022 {pct(rates.rAbs * 100, 1)}, Insee
              2017–2022 {rates.insee.map((y) => `${y.year} : ${pct(y.share, 1)}`).join(', ')}). Dans un duel face au RN,
              leur orientation vers l’adversaire du RN n’est plus fixe : elle est ancrée au niveau 2022 (
              <em>q</em>₂₀₂₂ = {pct(settings.abstainerAntiRnShare * 100, 0)}, contre 59 % mesurés par Ifop en 2022) puis
              modulée par la force du front républicain du duel :
            </p>
            <p className="font-mono text-sm">
              q_eff = 50 % + (q₂₀₂₂ − 50 %) × (F_duel / 75 %)
            </p>
            <p>
              Elle revient ainsi à 50 / 50 si le front républicain est effacé (<em>F</em> = 0 %) ou dans un duel hors
              RN. Sur le duel actuellement affiché ({cand(sr.a).shortName} – {cand(sr.b).shortName}), l’orientation
              effective est de <strong className="num">{pct(sr.effectiveAbstainerAntiRnShare * 100, 1)}</strong> vers
              l’adversaire du RN{sr.republicanFrontStrength !== null ? ` (F = ${pct(sr.republicanFrontStrength * 100, 0)})` : ''}.
              L’abandon net équivalent ({pct(sr.netDropout, 1)}) résulte naturellement du bilan comptable.
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
              À {distance(result.monteCarlo.daysToElection)} du 1er tour, le premier risque d’erreur n’est pas la marge
              d’échantillonnage d’un sondage (±2 pts), mais l’évolution de la campagne électorale et la variabilité des
              reports (en particulier la tenue réelle du front républicain entre les deux tours). Le simulateur exécute{' '}
              {integer(result.monteCarlo.iterations)} tirages déterministes (graine {result.monteCarlo.seed}) propageant
              :
            </p>
            <ul>
              <li>
                <strong>Chocs de campagne au 1er tour</strong> (distribution Student-t à 8 degrés de liberté en
                log-ratio, écart-type total σ = {num(result.monteCarlo.sigmaLogit, 2)} à J−
                {result.monteCarlo.daysToElection}, décroissant vers un plancher de 0,14 la dernière semaine) : choc de
                bloc (50 % de la variance), transfert de vote utile intra-bloc à somme nulle (30 %) et choc propre par
                candidat (20 %).
              </li>
              <li>
                <strong>Incertitude du 2nd tour</strong> : tirage Dirichlet (κ = 40, soit ±5 à 7 pts par ligne de
                report), <strong>choc corrélé national sur la force réelle du front républicain</strong> (σ = 15 pts,
                borné à ±35 pts, affectant simultanément les 4 profils face au RN et les nouveaux votants), poids
                historique/2027 en mode mélange, participation (±5 pts), mobilisation (±4 pts) et orientation des
                abstentionnistes, fidélité (±2,5 pts) et choc commun national (σ = 3,0 pts face au RN, 2,0 pts hors RN).
              </li>
              <li>
                <strong>Lisibilité visuelle honnête :</strong> toutes les barres de probabilités de victoire (« Issues
                simulées ») et de scores du 1er tour (« Premier tour simulé / projeté ») sont affichées sur une{' '}
                <strong>échelle fixe de 0 % à 100 %</strong> avec un repère discret à 50 %, afin qu’un candidat en tête
                à 30 % ou à 65 % de probabilité de victoire n’apparaisse jamais artificiellement « plein ».
              </li>
            </ul>
            <p>
              <strong>Validation hors échantillon (backtest automatisé) :</strong> les quatre tableaux ci-dessous
              évaluent la méthode sur les présidentielles de 2017 et 2022 et sur les 342 circonscriptions agrégées des
              législatives 2024, sans aucun recalibrage sur les résultats testés.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Table caption="1er tour — Dernière semaine (2017 et 2022) : sondages bruts vs correction croisée par ratio">
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

            <Table caption={`1er tour en campagne à J−${bt.daysBefore} (tous candidats inclus, sans biais d'omission)`}>
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Année</th>
                  <th className={th}>Date cible</th>
                  <th className={`${th} text-right`}>Instituts</th>
                  <th className={`${th} text-right`}>RMSE brut</th>
                  <th className={`${th} text-right`}>RMSE projeté</th>
                  <th className={`${th} text-right`}>RMS logit</th>
                </tr>
              </thead>
              <tbody>
                {bt.firstRoundCampaign.map((r) => (
                  <tr key={r.year} className="border-b border-rule/60">
                    <td className={`${td} num font-medium`}>{r.year}</td>
                    <td className={`${td} num`}>{date(r.targetDate)}</td>
                    <td className={`${td} num text-right`}>{r.institutesUsed}</td>
                    <td className={`${td} num text-right text-ink-3`}>{num(r.rmse, 2)} pts</td>
                    <td className={`${td} num text-right font-medium`}>{num(r.projectedRmse, 2)} pts</td>
                    <td className={`${td} num text-right`}>{num(r.empiricalLogitRms, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <Table caption="2nd tour présidentiel (2017 et 2022, en connaissant le 1er tour réel) : score Macron (% exprimés) — modèle front républicain évalué à 100 % en 2017 et 75 % en 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Année</th>
                <th className={`${th} text-right`}>Résultat réel</th>
                <th className={`${th} text-right`}>Modèle 2024 seul</th>
                <th className={`${th} text-right`}>Présidentielle croisée</th>
                <th className={`${th} text-right`}>Modèle front républicain</th>
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
                  <td className={`${td} num text-right`}>
                    {pct(r.predCrossPresidential, 2)} ({pts(r.predCrossPresidential - r.actualAntiRn, 1)})
                  </td>
                  <td className={`${td} num text-right font-medium`}>
                    {pct(r.predRepublicanFront, 2)} ({pts(r.predRepublicanFront - r.actualAntiRn, 1)})
                  </td>
                  <td className={`${td} num text-right text-ink-3`}>
                    {r.directPollsAtDistance !== null ? pct(r.directPollsAtDistance, 1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Table caption="Contrôle de cohérence agrégé sur les 342 duels des législatives 2024 (enquête Ipsos-Talan brute vs urnes)">
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
        <section id="limites" aria-labelledby="limites-title" className="scroll-mt-6 border-t border-rule pt-8">
          <h3 id="limites-title" className="text-xl font-bold tracking-tight">
            Limites, non-réponses et sources
          </h3>
          <div className="prose-method mt-4">
            <p>
              <strong>Principales limites :</strong> l’offre de candidatures 2027 n’est pas arrêtée (des candidats
              peuvent se retirer, fusionner ou apparaître) ; la projection temporelle reste une projection structurelle
              conditionnelle qui ne peut pas anticiper un événement exogène de campagne ; l’intensité réelle du front
              républicain en mai 2027 — en particulier dans un duel inédit comme LFI – RN — n’est pas observable avant
              l’entre-deux-tours (d’où les curseurs par famille et le choc aléatoire corrélé dans Monte-Carlo) ; enfin,
              le devenir au 2nd tour des votants blancs et nuls du 1er tour n’est mesuré par aucune enquête publique.
            </p>
            {NO_INTENTION && (
              <p>
                <strong>Part sans intention de vote dans les sondages directs de 2nd tour :</strong> selon les instituts
                et les duels, {range(NO_INTENTION.min, NO_INTENTION.max)} des personnes interrogées n’expriment aucun
                choix :
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
                      <tr key={`${p.institute}-${p.fieldwork.end}-${c1}-${c2}`} className="border-b border-rule/60">
                        <td className={`${td} font-medium`}>{p.institute}</td>
                        <td className={`${td} num`}>{fieldwork(p.fieldwork)}</td>
                        <td className={td}>
                          {cand(c1!).shortName} – {cand(c2!).shortName}
                        </td>
                        <td className={td}>
                          <a href={p.noIntention!.source.url} target="_blank" rel="noreferrer" className="link">
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
                <strong>Historique des vagues 2025–2027 ({pollHistory.polls.length} sondages archivés)</strong> —{' '}
                {pollHistory.description}
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
