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
import { CAMPAIGN_REF_DAYS, SIGMA_CAMPAIGN_REF, SIGMA_POLLING_FLOOR } from '../../domain/monteCarlo'
import {
  MIN_MINOR_INSTITUTES,
  POLL_HALF_LIFE_DAYS,
  SAMPLE_SIZE_CAP,
  windowDaysOf,
} from '../../domain/pollAverage'
import { noIntentionRange, presidentialDropout, secondRoundDropout } from '../../domain/secondRound'
import {
  REPUBLICAN_FRONT_PRESETS,
  correctDeclaredRowLogit,
  effectiveProfiles,
  frontStrengthForProfile,
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
    desc: 'Ancre mesurée par les enquêtes « jour du vote » de la présidentielle 2022 (Macron – Le Pen : 58,55 %).',
  },
  {
    id: 'midpoint' as const,
    label: 'Mi-chemin (50 %)',
    desc: 'Interpolation médiane en logit entre présidentielle 2022 et législatives 2024.',
  },
  {
    id: 'leg2024' as const,
    label: 'Législatives 2024 (100 %)',
    desc: 'Défaut provisoire : taux directs de l’enquête Ipsos-Talan du 7 juillet 2024, seule source mesurant les 4 duels.',
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
              Par défaut, le simulateur s’ouvre en mode <strong>projection avril 2027</strong> (actuellement{' '}
              <strong>{settings.projection.enabled ? 'activée' : 'désactivée'}</strong>, à J−
              {result.projection.daysRemaining}, facteur d’horizon{' '}
              <span className="num">{pct(result.projection.horizonFactor * 100, 0)}</span>), avec bascule en
              un clic vers la <strong>photographie actuelle</strong> des sondages (« Aujourd’hui »). Tous les
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
                (hypothèse symétrique à la droite, le centre n’ayant eu qu’un seul candidat principal en 2017
                et 2022). Une option regroupe centre et droite (cible{' '}
                {pct(MERGED_CENTER_RIGHT_TARGET * 100, 0)}). Garde-fous :{' '}
                <strong>{pct(CROSS_BLOC_LEAK * 100, 0)}</strong> de fuite vers les blocs voisins, plancher de{' '}
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
                <strong>Repère 0 % — Présidentielle 2022 :</strong> pour <code>ensemble_rn</code>, le modèle
                rejoint exactement les taux mesurés « jour du vote » en 2022 (gauche : 47 / 15 / 38 ; droite :
                53 / 18 / 29). Pour les autres profils, il applique proportionnellement le même déplacement
                logit 2024 → 2022 mesuré sur
                <code>ensemble_rn</code> (bloc opposé ou bloc voisin ; sur les lignes déjà à ≥ 10 % de vote RN
                en 2024, seul le recul du vote barrage vers l’abstention est appliqué afin de ne pas gonfler
                artificiellement le vote RN).
              </li>
              <li>
                <strong>Réglage global et par famille de duel :</strong> 3 préréglages sourcés (Présidentielle
                2022, Mi-chemin, Législatives 2024), un curseur global et 3 curseurs par famille. Réglage
                actif : <strong>Centre / Droite {pct(settings.republicanFront.centerRight * 100, 0)}</strong>,{' '}
                <strong>Gauche modérée {pct(settings.republicanFront.moderateLeft * 100, 0)}</strong>,{' '}
                <strong>LFI {pct(settings.republicanFront.lfi * 100, 0)}</strong>.
              </li>
              <li>
                <strong>
                  Cas particulier — Report gauche hors LFI → Mélenchon (<code>lfi_rn.gauche</code>) :
                </strong>{' '}
                le report des électeurs de gauche modérée / écologiste / communiste (Glucksmann, Tondelier,
                Roussel) vers Jean-Luc Mélenchon face au RN n’a jamais été mesuré à une présidentielle (le
                taux de 72 % des législatives 2024 portait sur des candidatures uniques NFP, alors que les
                déclarations 2027 corrigées en logit donnent 36 %). Ce paramètre dispose donc d’un{' '}
                <strong>curseur dédié</strong> (actif :{' '}
                <strong className="num">{settings.lfiLeftTransfer} %</strong>, défaut provisoire : 72 %),
                d’une <strong>analyse de sensibilité affichée</strong> sur les duels LFI – RN, et d’un{' '}
                <strong>tirage uniforme explicite dans Monte-Carlo</strong> sur la plage{' '}
                <strong className="num">
                  [{settings.lfiLeftTransferRange[0]} % ; {settings.lfiLeftTransferRange[1]} %]
                </strong>{' '}
                (configurable dans les réglages).
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

          <Table caption="Préréglages du front républicain (interpolation directe 2022 ↔ 2024)">
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
                  : 'base historique 2022 ↔ 2024'
            })`}
          >
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Profil (position 2022 ↔ 2024)</th>
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
                        {pid === 'lfi_rn' &&
                          b === 'gauche' &&
                          !overridden &&
                          settings.transferSource !== 'declared2027' && (
                            <span className="ml-1.5 text-xs text-ink-3">(curseur dédié)</span>
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
              Le second tour est calculé directement en pourcentage des électeurs inscrits, sans recalibrage
              post-hoc par camp ni soustraction uniforme sur les électorats de premier tour. Avec une
              participation au 1er tour <em>P</em> ({pct(sr.participation, 1)} dans ce scénario), une part de
              blancs et nuls de {pct(rates.bnShare * 100, 1)} des votants ({pct(sr.blankNull1, 1)} des
              inscrits) et <em>E</em>₁ = {pct(sr.expressed1, 1)} d’exprimés au 1er tour :
            </p>
            <p className="font-mono text-sm">V_A = E₁ · Σ x_c · π(c → A) + (100 − P) · a · q_A</p>
            <p>
              Les finalistes bénéficient d’une fidélité différenciée (
              {transfers.fidelity.byCandidate.lepen?.loyal} % pour Marine Le Pen,{' '}
              {transfers.fidelity.byCandidate.melenchon?.loyal} % pour Jean-Luc Mélenchon,{' '}
              {transfers.fidelity.default.loyal} % par défaut, ajustable en mode uniforme dans les réglages),
              incluant une faible part de reports croisés (1 à 2 %). Les électeurs des petits candidats non
              qualifiés suivent les électorats de référence documentés et ajustables dans les réglages.
            </p>
            <p>
              <strong>Abstentionnistes du 1er tour :</strong> les abstentionnistes du 1er tour (
              {pct(sr.abstention1, 1)} des inscrits) reviennent voter valablement à hauteur de <em>a</em> ={' '}
              {pct(settings.abstainerMobilization * 100, 0)} (repères : Ifop 2022 {pct(rates.rAbs * 100, 1)},
              Insee 2017–2022 {rates.insee.map((y) => `${y.year} : ${pct(y.share, 1)}`).join(', ')}). Dans un
              duel face au RN, ils s’orientent vers l’adversaire du RN à hauteur de{' '}
              <strong className="num">{pct(settings.abstainerAntiRnShare * 100, 0)}</strong> (repère Ifop 2022
              : 59 % ; 50 / 50 dans un duel hors RN). L’abandon net équivalent ({pct(sr.netDropout, 1)})
              résulte naturellement du bilan comptable.
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
                degrés de liberté en log-ratio. L’écart-type de référence à J−{CAMPAIGN_REF_DAYS} est fixé par
                règle écrite avant examen de son effet sur 2027 : moyenne arithmétique de l’écart-type logit
                1995–2022 mesuré sur les candidats ≥ 5 % (0,497) et du RMS logit 2022 de notre backtest
                (0,693), soit <strong>σ_ref = {num(SIGMA_CAMPAIGN_REF, 3)}</strong> (donnant σ ={' '}
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
                , participation (±5 pts), mobilisation (±4 pts) et orientation (±8 pts) des abstentionnistes,
                fidélité (±2,5 pts) et choc commun national (σ = 3,0 pts face au RN, 2,0 pts hors RN).
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
              cohérence agrégée des 342 duels 2024, couverture empirique à 80 %).
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

          <Table caption="Contrôle de calibration — Couverture empirique des intervalles Monte-Carlo à 80 % ([P10 ; P90]) sur 2017 et 2022 (candidats ≥ 2 %, σ_ref intègre 1995–2022)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Scrutin</th>
                <th className={`${th} text-right`}>σ_logit</th>
                <th className={`${th} text-right`}>1er tour (brut)</th>
                <th className={`${th} text-right`}>1er tour (croisé)</th>
                <th className={`${th} text-right`}>2nd tour (IC 80 % vs réel)</th>
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
                    [{pct(r.secondRoundP10, 1)} ; {pct(r.secondRoundP90, 1)}] · réel{' '}
                    {pct(r.secondRoundActual, 1)}{' '}
                    <span className={r.secondRoundCovered ? 'font-medium text-ballpoint' : 'text-hypo'}>
                      ({r.secondRoundCovered ? 'couvert' : 'hors IC'})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Table caption="2nd tour présidentiel (en connaissant le 1er tour réel) : score Macron (% exprimés) — Lég. 2024 et Prés. croisée sont hors échantillon ; l’ancre 2022 est un contrôle en échantillon sur 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Année</th>
                <th className={`${th} text-right`}>Résultat réel</th>
                <th className={`${th} text-right`}>Ancre Lég. 2024 (100 %, hors éch.)</th>
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
                  <td className={`${td} num text-right`}>
                    {pct(r.predCrossPresidential, 2)} ({pts(r.predCrossPresidential - r.actualAntiRn, 1)})
                  </td>
                  <td className={`${td} num text-right font-medium`}>
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
