import type { ReactNode } from 'react'
import { simulationData } from '../../data/schema'
import { BLOCS } from '../../domain/types'
import type { NoIntention, PastElectionReference, PollOrigin, PollStatus, SimulationResult } from '../../domain/types'
import { allianceCombos, alliancesConflict, availableAlliances, comboWith, defaultSet } from '../../domain/alliances'
import { BLOG_BIAS_BLOCS, BLOG_BIAS_URL, totalBias } from '../../domain/blogBias'
import type { YearBlocBias } from '../../domain/blogBias'
import { ELECTION_WEIGHTS, EQUIVALENTS_2017, PAST_YEARS } from '../../domain/pastElections'
import type { PastYear } from '../../domain/pastElections'
import { windowDaysOf } from '../../domain/pollAverage'
import { referenceParts } from '../../domain/references'
import { minorTransfer } from '../../domain/transfers'
import { TIGHT_QUALIFICATION_GAP } from '../../domain/simulate'
import {
  blocShares,
  certainShare,
  TURNOUT_BLOCS_2022,
  TURNOUT_PROFILE_2022,
  TURNOUT_PROFILE_SOURCE,
} from '../../domain/turnout'
import {
  duelDropout,
  noIntentionRange,
  noRnDropout,
  presidentialDropout,
  profileDropout,
  secondRoundDropout,
} from '../../domain/secondRound'
import {
  calibration,
  progression2017Stats,
  progression2022Stats,
  reference2017Stats,
  reference2022Stats,
} from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { anyName, BLOC_LABELS, BLOC_VOTERS, cand, entrantLabel, profileLabel, transferLabel } from '../candidates'
import { date, distance, fieldwork, integer, noIntentionLabel, num, pct, pts, range, ratio, shownScore } from '../format'
import { DUEL_KIND, dropoutBasis } from '../dropout'
import { Link } from '../Link'
import { AllianceRates } from './AllianceRates'
import { ProvenanceLegend, ProvenanceValue } from './Provenance'

const { polls, reference2022, reference2017, transfers, turnoutCertainty } = simulationData
const REFERENCES = { 2022: reference2022, 2017: reference2017 }
const PROGRESSIONS = { 2022: progression2022Stats, 2017: progression2017Stats }

/** Nom d'un candidat d'un scrutin passé, y compris ceux testés avant les primaires. */
const pastName = (year: PastYear, id: string) => {
  const ref = REFERENCES[year]
  return [...ref.candidates, ...ref.campaignPolls.otherCandidates].find((c) => c.id === id)?.name ?? id
}
/** Participation au 1er tour (% des inscrits). */
const dropoutData = simulationData.secondRoundDropout
const NO_RN_YEARS = dropoutData.presidential.elections.filter((e) => !e.rn).map((e) => e.year)
/** Seconds tours présidentiels de 2002 à 2022 : ceux des données, plus 2017 et 2022 tirés des références. */
const PRESIDENTIAL_ROWS = [
  ...dropoutData.presidential.elections.map((e) => ({
    year: e.year,
    duel: e.duel,
    turnout: (100 * e.firstRound.voters) / e.firstRound.registered,
    first: e.firstRound.expressed,
    second: e.secondRound.expressed,
    dropout: presidentialDropout(e),
    sources: [e.firstRound.source, e.secondRound.source],
  })),
  ...([reference2017, reference2022] as const).map((ref, i) => ({
    year: i === 0 ? 2017 : 2022,
    duel: 'Macron – Le Pen',
    turnout: (100 * ref.voters) / ref.registered,
    first: ref.expressed,
    second: ref.secondRound.expressed,
    dropout: secondRoundDropout(ref),
    sources: [ref.resultsSource, ref.secondRound.source],
  })),
].sort((a, b) => a.year - b.year)
const turnoutOf = (ref: Pick<PastElectionReference, 'registered' | 'voters'>) => (ref.voters * 100) / ref.registered
/** Parts des blocs (sans Lassalle) chez l'ensemble des votants et chez ceux qui reviennent voter. */
const TURNOUT_SHARES = {
  all: blocShares(TURNOUT_PROFILE_2022.all),
  returning: blocShares(TURNOUT_PROFILE_2022.abstainers2017),
}

/** Part sans intention de vote des duels de 2nd tour publiés : fourchette et détail. */
const NO_INTENTION = noIntentionRange(polls.secondRoundPolls)
const listFr = (items: string[]) => new Intl.ListFormat('fr', { type: 'conjunction' }).format(items)
const institutesWith = (keep: (n: NoIntention) => boolean) => [
  ...new Set((NO_INTENTION?.polls ?? []).filter((p) => keep(p.noIntention!)).map((p) => p.institute)),
]
/** Instituts dont la part porte sur cette base : « OpinionWay, Ifop-Fiducial et YouGov ». */
const institutesOf = (base: NoIntention['base']) => listFr(institutesWith((n) => n.base === base)) || 'aucun'
const COMPUTED = institutesWith((n) => n.calculation !== undefined)
const UNDECIDED = institutesWith((n) => n.undecided !== undefined)

const STEPS: [string, string][] = [
  ['sondages', 'Moyenne des sondages'],
  ['progression', 'Progression comme en 2022'],
  ['corrections', 'Corrections 2017 et 2022'],
  ['alliances', 'Alliances'],
  ['qualification', 'Qualification'],
  ['reports', 'Reports de voix'],
  ['abstention', 'Abstention du 2nd tour'],
]

const DEFAULT_SET = defaultSet(polls)
/** Alliances proposées : celles que les hypothèses des sondages retenus permettent, seules ou combinées. */
const PROPOSED = availableAlliances(polls)
/** Plus petite combinaison des alliances qui ne sont testées qu'avec d'autres. */
const COMBOS = [
  ...new Map(
    PROPOSED.filter((a) => !allianceCombos(polls).some((c) => c.length === 1 && c[0] === a))
      .map((a) => comboWith(polls, [], a)!)
      .map((c) => [c.map((al) => al.id).sort().join('|'), c] as const),
  ).values(),
]
const MINORS = polls.candidates.filter((c) => c.minor)

const INCOMPATIBLE = PROPOSED.flatMap((x, i) =>
  PROPOSED.slice(i + 1).flatMap((y) => (alliancesConflict(x, y) ? [[x, y] as const] : [])),
)

const ORIGIN: Record<PollOrigin, string> = {
  '2027etmoi': 'Notice officielle (2027etmoi)',
  mieuxvoter: 'Notice officielle (Mieux Voter)',
  manuel: 'Saisie manuelle',
  wikipedia: 'Wikipedia',
}

const STATUS: Record<PollStatus, string> = {
  used: 'Retenu',
  superseded: 'Remplacé par un sondage plus récent du même institut',
  excluded: 'Décoché dans le scénario',
  'out-of-window': 'Hors de la fenêtre',
  'no-matching-hypothesis': 'Aucune hypothèse conforme',
}

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

/** « Droite (LR) » → « droite (LR) ». */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const th = 'px-3 py-2 text-left font-medium text-ink-3'
const td = 'px-3 py-1.5 align-top'

export function Methodology({ result }: { result: SimulationResult }) {
  const cutoff = new Date(`${polls.asOf}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDaysOf(polls))
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const sr = result.secondRound
  const [a, b] = [result.entrants[0]!, result.entrants[1]!]
  const settings = useSettings()
  const bal = result.turnoutBalance
  const inWindow = result.pollUsage.filter((u) => u.status !== 'out-of-window')
  const older = result.pollUsage.filter((u) => u.status === 'out-of-window')
  const singlePoll = result.institutesUsed === 1 ? result.pollUsage.find((u) => u.status === 'used')?.poll : undefined
  const unchecked = result.pollUsage.filter((u) => u.status === 'excluded').length
  /** Candidats de 2027 qui utilisent une référence de 2022, avec leur poids s'il s'agit d'un mélange. */
  const usersOf = (refId: string) =>
    polls.candidates.flatMap((x) => {
      const part = referenceParts(x, settings.referenceBlend[x.id]).find((p) => p.id === refId)
      if (!part) return []
      return [part.weight < 1 ? `${x.shortName} (${pct(part.weight * 100, 0)})` : x.shortName]
    })

  return (
    <article aria-labelledby="methodo-title">
      <h1
        id="methodo-title"
        className="wide text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]"
      >
        Méthodologie
      </h1>
      <div className="prose-method mt-4">
        <p>
          Le simulateur enchaîne sept étapes. Chaque chiffre de cette page est celui du scénario en cours sur
          le <Link to="simulateur">simulateur</Link> : il change avec vos réglages. Les données d’origine sont
          publiques et listées avec leur lien. Les alliances ne s’appliquent pas par des taux de report : elles
          choisissent, parmi les hypothèses testées par les sondeurs, celles où les candidats ralliés sont
          absents (étapes 1 et 4). En option, désactivée par défaut, une alliance qu’aucun sondeur ne teste peut
          être estimée par les reports de voix des législatives 2024.
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
              Limites et précautions
            </Link>
          </li>
        </ol>
      </nav>

      <div className="mt-8 space-y-12">
        <Step id="sondages" n={1} title="Moyenne des sondages de 1er tour">
          <div className="prose-method">
            {polls.period ? (
              <p>
                Base au <strong>{date(polls.asOf)}</strong> : pour chaque institut, on retient son{' '}
                <strong>dernier sondage</strong> de la période la plus récente de la{' '}
                <a
                  href={polls.collection.sources.find((x) => /wikipedia/.test(x.url))?.url}
                  className="link"
                  target="_blank"
                  rel="noreferrer"
                >
                  liste des sondages de Wikipedia
                </a>{' '}
                (« {polls.period.label} », depuis le {date(polls.period.start)}), avec toutes ses hypothèses.
              </p>
            ) : (
              <p>
                Base au <strong>{date(polls.asOf)}</strong> : pour chaque institut, on retient son{' '}
                <strong>dernier sondage</strong> dont le terrain s’achève dans les {polls.windowDays} jours
                précédents (depuis le {date(cutoffIso)}).
              </p>
            )}
            <p>
              Un sondage teste plusieurs listes de candidats (hypothèses). Pour l’hypothèse «{' '}
              {result.hypothesisSet.label} », on garde celles qui testent tous ces candidats :{' '}
              {result.hypothesisSet.require.map(anyName).join(', ')}, et aucun de ceux-ci :{' '}
              {result.hypothesisSet.exclude.map(anyName).join(', ')}. Une hypothèse où un candidat exclu est
              remplacé par un autre (Hollande à la place de Glucksmann) n’est pas retenue non plus. Les candidats
              non simulés sont retirés et l’hypothèse est ramenée à 100 %.
            </p>
            {MINORS.length > 0 && (
              <p>
                Les <strong>petits candidats</strong> ({MINORS.map((c) => c.name).join(', ')}) ne sont testés que
                dans une partie des hypothèses : ils ne sont jamais requis, et une hypothèse retenue qui ne les
                teste pas les compte à <strong>0 %</strong> (ses sondés répartissent leurs électeurs entre les
                autres candidats). Leur score est ensuite moyenné comme celui des autres : entre les hypothèses
                retenues de chaque sondage, puis entre instituts. Un petit candidat qu’aucune hypothèse retenue
                ne teste n’apparaît pas.
              </p>
            )}
            <p>
              {result.allianceIds.length > 0
                ? `Cette hypothèse vient des alliances activées (étape 4), qui retirent leurs ralliés ; sans alliance, la base est l’hypothèse « ${DEFAULT_SET.label} ».`
                : `C’est la base sans alliance ; chaque alliance activée (étape 4) retire son rallié des hypothèses retenues.`}{' '}
              Seuls les sondages qui ont une hypothèse conforme sont retenus : les autres ne sont ni comptés ni
              proposés.
            </p>
            <p>
              Les sondages ainsi retenus sont proposés, du plus récent au plus ancien, sous forme de cases à
              cocher sur le <Link to="simulateur">simulateur</Link> : tous sont cochés par défaut
              {unchecked > 0 && ` (${unchecked} décoché${unchecked > 1 ? 's' : ''} dans le scénario en cours)`}.
            </p>
            {singlePoll ? (
              <p>
                Un seul sondage est coché ({singlePoll.institute}, terrain du {fieldwork(singlePoll.fieldwork)}) :
                il sert de base sans moyenne entre instituts. On fait la moyenne de ses hypothèses retenues, puis
                on ramène le total à 100 %. Les références de 2022 (corrections, progression) restent calculées
                sur des moyennes d’instituts.
              </p>
            ) : (
              <p>
                On fait la moyenne des hypothèses retenues dans chaque sondage, puis la moyenne simple entre
                instituts ({result.institutesUsed} ici), enfin on ramène le total à 100 %.
              </p>
            )}
          </div>
          <Table caption={polls.collection.description}>
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Institut</th>
                <th className={th}>Commanditaire</th>
                <th className={th}>Terrain</th>
                <th className={`${th} text-right`}>Échantillon</th>
                <th className={th}>Provenance</th>
                <th className={th}>Statut</th>
                <th className={th}>Hypothèses retenues</th>
              </tr>
            </thead>
            <tbody>
              {inWindow.map((u) => (
                <tr
                  key={u.poll.id}
                  className={`border-b border-rule/60 ${u.status === 'used' ? '' : 'text-ink-3'}`}
                >
                  <td className={td}>
                    <span className="font-medium text-ink">{u.poll.institute}</span>
                    <span className="mt-0.5 block space-x-2">
                      {u.poll.sources.map((s) => (
                        <a key={s.url} href={s.url} className="link text-xs" target="_blank" rel="noreferrer">
                          {s.label}
                        </a>
                      ))}
                    </span>
                    {[u.poll.verified, u.poll.note].filter(Boolean).map((t) => (
                      <span key={t} className="mt-0.5 block text-xs text-ink-3">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td className={td}>{u.poll.sponsor}</td>
                  <td className={`${td} num whitespace-nowrap`}>{fieldwork(u.poll.fieldwork)}</td>
                  <td className={`${td} num text-right`}>{integer(u.poll.sampleSize)}</td>
                  <td className={td}>{ORIGIN[u.poll.origin ?? 'manuel']}</td>
                  <td className={td}>{STATUS[u.status]}</td>
                  <td className={td}>
                    {u.matchedHypotheses.length > 0
                      ? `${u.matchedHypotheses.join(', ')} sur ${u.poll.hypotheses.length}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {older.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-ballpoint">
                {older.length} sondages plus anciens, hors de la fenêtre
              </summary>
              <ul className="mt-2 space-y-1 text-ink-2">
                {older.map((u) => (
                  <li key={u.poll.id}>
                    <a href={u.poll.sources[0]?.url} className="link" target="_blank" rel="noreferrer">
                      {u.poll.institute}
                    </a>{' '}
                    ({fieldwork(u.poll.fieldwork)}, {ORIGIN[u.poll.origin ?? 'manuel'].toLowerCase()})
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-sm text-ink-3">
            Sources de collecte :{' '}
            {polls.collection.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ', '}
                <a href={s.url} className="link" target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </span>
            ))}
            .
          </p>
        </Step>

        <Step id="progression" n={2} title="Progression des sondages comme en 2022 (optionnelle)">
          <div className="prose-method">
            <p>
              Les sondages évoluent beaucoup dans les derniers mois de campagne. Cette hypothèse estime les
              derniers sondages avant le vote de 2027 en reproduisant l’évolution observée en 2022, entre la
              même distance au scrutin et les derniers sondages, pour le candidat de 2022 du même camp (même
              correspondance qu’à l’étape 3). Elle est{' '}
              <strong>
                {settings.progressionEnabled
                  ? `activée, à ${pct(settings.progressionIntensity * 100, 0)} d’intensité`
                  : 'désactivée'}
              </strong>{' '}
              dans le scénario en cours et se cumule avec la correction de l’étape 3.
            </p>
            <p>
              La base 2027 date du {date(polls.asOf)}, {progression2022Stats.daysBefore} jours avant le 1er
              tour prévu le {date(polls.electionDate)}. La même distance avant le scrutin du{' '}
              {date(reference2022.electionDate)} donne le {date(progression2022Stats.asOf)}, avec la même
              fenêtre de {reference2022.campaignPolls.windowDays} jours ({progression2022Stats.institutesUsed}{' '}
              instituts retenus). {reference2022.campaignPolls.description}
            </p>
            <code className="formula">
              progression = derniers sondages 2022 ÷ sondages 2022 à la même distance du scrutin
            </code>
            <code className="formula">
              sondages projetés = moyenne 2027 × (1 + (progression − 1) × intensité), ramenés à 100 %
            </code>
            <p>
              L’intensité de la progression se règle indépendamment de celle de la correction (étape 3). À
              100 %, chaque candidat de 2027 reproduit à l’identique l’évolution relative de sa référence de
              2022 ; à 50 %, la moitié de cette évolution ; à 0 %, aucune (comme si la progression était
              désactivée). Au-delà de 100 %, l’évolution de 2022 est amplifiée. Exemple : une référence passée
              de 10 % à 15 % dans les sondages de 2022 (progression ×1,5) multiplie le score de son candidat
              de 2027 par 1,5 à 100 % d’intensité et par 1,25 à 50 %, avant que les scores ne soient ramenés à
              100 %.
            </p>
          </div>
          <Table caption={`Sondages de 2021-2022 autour du ${date(progression2022Stats.asOf)}`}>
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Institut</th>
                <th className={th}>Terrain</th>
                <th className={`${th} text-right`}>Échantillon</th>
                <th className={th}>Statut</th>
                <th className={th}>Hypothèses retenues</th>
              </tr>
            </thead>
            <tbody>
              {progression2022Stats.usage
                .filter((u) => u.status !== 'out-of-window')
                .map((u) => (
                  <tr
                    key={`${u.poll.institute}-${u.poll.fieldwork.end}`}
                    className={`border-b border-rule/60 ${u.status === 'used' ? '' : 'text-ink-3'}`}
                  >
                    <td className={td}>
                      <a href={u.poll.url} className="link" target="_blank" rel="noreferrer">
                        {u.poll.institute}
                      </a>
                    </td>
                    <td className={`${td} num whitespace-nowrap`}>{fieldwork(u.poll.fieldwork)}</td>
                    <td className={`${td} num text-right`}>{integer(u.poll.sampleSize)}</td>
                    <td className={td}>{STATUS[u.status]}</td>
                    <td className={td}>
                      {u.matchedHypotheses.length > 0
                        ? `${u.matchedHypotheses.join(', ')} sur ${u.poll.hypotheses.length}`
                        : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
          <Table caption="Progression des sondages en 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Candidat 2022</th>
                <th className={`${th} text-right`}>Le {date(progression2022Stats.asOf)}</th>
                <th className={`${th} text-right`}>Derniers sondages</th>
                <th className={`${th} text-right`}>Progression</th>
                <th className={th}>Référence pour 2027</th>
              </tr>
            </thead>
            <tbody>
              {reference2022.candidates.map((c) => {
                const users = usersOf(c.id)
                const r = progression2022Stats.ratio[c.id]
                return (
                  <tr key={c.id} className="border-b border-rule/60">
                    <td className={td}>{c.name}</td>
                    <td className={`${td} num text-right`}>
                      {pct(progression2022Stats.earlyAverage[c.id] ?? 0, 2)}
                    </td>
                    <td className={`${td} num text-right`}>
                      {pct(progression2022Stats.finalAverage[c.id] ?? 0, 2)}
                    </td>
                    <td className={`${td} num text-right font-medium`}>{r ? ratio(r) : '—'}</td>
                    <td className={td}>
                      {users.length > 0 ? users.join(', ') : <span className="text-ink-3">aucun</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <div className="prose-method">
            <p>
              Limites : en octobre 2021, Éric Zemmour n’était pas encore candidat (déclaré le 30/11/2021) et
              la candidate LR n’était pas désignée (primaire du 04/12/2021). La dynamique de 2022, notamment
              la poussée finale de Jean-Luc Mélenchon au détriment du PS et des écologistes, n’a aucune raison
              de se répéter à l’identique.
            </p>
          </div>
          <p className="text-sm text-ink-3">
            Source :{' '}
            <a
              href={reference2022.campaignPolls.source.url}
              className="link"
              target="_blank"
              rel="noreferrer"
            >
              {reference2022.campaignPolls.source.label}
            </a>{' '}
            (liens vers chaque sondage dans le tableau ci-dessus).
          </p>
        </Step>

        <Step id="corrections" n={3} title="Correction des écarts constatés en 2017 et 2022">
          <div className="prose-method">
            <p>
              Aux deux dernières présidentielles, les derniers sondages avant le 1er tour ont sous-estimé
              certains candidats et en ont surestimé d’autres. On mesure cet écart par un ratio à chaque
              scrutin, on combine les deux mesures en un écart estimé, puis on l’applique au candidat de 2027
              de la même famille politique.
            </p>
            <code className="formula">ratio d’un scrutin = résultat officiel ÷ moyenne des derniers sondages</code>
            <code className="formula">
              écart estimé = ratio 2022<sup>{num(ELECTION_WEIGHTS[2022], 1)}</sup> × ratio 2017
              <sup>{num(ELECTION_WEIGHTS[2017], 1)}</sup> (ratio 2022 seul sans équivalent en 2017)
            </code>
            <code className="formula">
              correction (points) = moyenne 2027 (ou sondages projetés, étape 2) × (écart estimé − 1) ×
              intensité de la correction
            </code>
            <ul>
              {PAST_YEARS.map((year) => {
                const ref = REFERENCES[year]
                const stats = year === 2022 ? reference2022Stats : reference2017Stats
                return (
                  <li key={year}>
                    {year} : dernier sondage de chaque institut dont le terrain s’achève dans les{' '}
                    {ref.windowDays} jours précédant le 1er tour du {date(ref.electionDate)} (
                    {stats.pollsUsed.length} instituts : {stats.pollsUsed.map((p) => p.institute).join(', ')}).
                    Résultats : voix officielles divisées par les {integer(ref.expressed)} suffrages exprimés.
                  </li>
                )
              })}
            </ul>
            <p>
              <strong>Combinaison des deux scrutins.</strong> L’écart estimé est une moyenne géométrique où
              chaque scrutin pèse {pct(ELECTION_WEIGHTS[2022] * 100, 0)}. Hypothèse : rien ne permet de dire
              lequel des deux annonce le mieux 2027. La moyenne géométrique traite de la même façon une
              sous-estimation et une surestimation de même ampleur (×1,25 et ×0,80 se compensent) : un biais
              qui se répète d’un scrutin à l’autre est conservé, un biais qui s’inverse s’atténue.
              {(() => {
                const c = calibration.correction
                const id = 'melenchon'
                return c.ratio2022[id] !== undefined && c.ratio2017[id] !== undefined && c.ratio[id] !== undefined
                  ? ` Exemple : Jean-Luc Mélenchon, à ${ratio(c.ratio2022[id])} en 2022 et ${ratio(c.ratio2017[id])} en 2017, reçoit un écart estimé de ${ratio(c.ratio[id])}.`
                  : ''
              })()}
            </p>
            <p>
              <strong>Équivalents de 2017 (hypothèses).</strong> L’écart de 2017 d’un candidat de 2022 est
              celui du même candidat, ou du candidat de son parti : Hidalgo → Hamon (PS) ; Jadot → Hamon,
              candidat commun PS-EELV après le retrait de Jadot en février 2017 ; Pécresse → Fillon (LR).
              Roussel (le PCF soutenait Mélenchon en 2017) et Zemmour (absent en 2017) n’en ont pas : leur
              écart estimé est celui de 2022 seul.
            </p>
            <p>
              Appliqué aux derniers sondages de son scrutin, chaque ratio redonne exactement le résultat
              officiel du 1er tour (un test automatique le vérifie pour 2022 et 2017). L’écart estimé n’est
              celui d’aucun des deux scrutins : c’est le biais qu’on peut attendre s’il se reproduit en
              moyenne. À 100 % d’intensité, chaque candidat de 2027 reçoit l’écart estimé de sa référence de
              2022.
            </p>
            <p>
              Après correction, les scores sont ramenés à 100 %.{' '}
              {settings.correctionsEnabled
                ? `Intensité actuelle de la correction : ${pct(settings.correctionIntensity * 100, 0)}${result.firstRound.some((r) => r.isOverride) ? ', certaines corrections sont saisies à la main' : ''}.`
                : 'Les corrections sont désactivées dans le scénario en cours.'}
            </p>
          </div>
          {PAST_YEARS.map((year) => {
            const ref = REFERENCES[year]
            const stats = year === 2022 ? reference2022Stats : reference2017Stats
            return (
              <Table key={year} caption={`Écarts de ${year}`}>
                <thead>
                  <tr className="border-b border-rule">
                    <th className={th}>Candidat {year}</th>
                    <th className={`${th} text-right`}>Derniers sondages</th>
                    <th className={`${th} text-right`}>Résultat</th>
                    <th className={`${th} text-right`}>Ratio</th>
                    {year === 2017 && <th className={th}>Équivalent de</th>}
                  </tr>
                </thead>
                <tbody>
                  {ref.candidates.map((c) => {
                    const of2022 = Object.entries(EQUIVALENTS_2017)
                      .filter(([id, eq]) => eq === c.id && calibration.correction.ratio2017[id] !== undefined)
                      .map(([id]) => reference2022.candidates.find((x) => x.id === id)?.name ?? id)
                    return (
                      <tr key={c.id} className="border-b border-rule/60">
                        <td className={td}>{c.name}</td>
                        <td className={`${td} num text-right`}>{pct(stats.pollAverage[c.id] ?? 0, 2)}</td>
                        <td className={`${td} num text-right`}>{pct(stats.result[c.id] ?? 0, 2)}</td>
                        <td className={`${td} num text-right font-medium`}>
                          {stats.ratio[c.id] !== undefined ? ratio(stats.ratio[c.id]!) : '—'}
                        </td>
                        {year === 2017 && (
                          <td className={td}>
                            {of2022.length > 0 ? of2022.join(', ') : <span className="text-ink-3">aucun</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )
          })}
          <Table caption="Écart estimé par référence de 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Candidat 2022</th>
                <th className={`${th} text-right`}>Ratio 2022</th>
                <th className={`${th} text-right`}>Ratio 2017</th>
                <th className={`${th} text-right`}>Écart estimé</th>
                <th className={th}>Référence pour 2027</th>
              </tr>
            </thead>
            <tbody>
              {reference2022.candidates.map((c) => {
                const users = usersOf(c.id)
                const r2017 = calibration.correction.ratio2017[c.id]
                const eq = EQUIVALENTS_2017[c.id]
                const estimate = calibration.correction.ratio[c.id]
                return (
                  <tr key={c.id} className="border-b border-rule/60">
                    <td className={td}>{c.name}</td>
                    <td className={`${td} num text-right`}>
                      {reference2022Stats.ratio[c.id] !== undefined ? ratio(reference2022Stats.ratio[c.id]!) : '—'}
                    </td>
                    <td className={`${td} num text-right`}>
                      {r2017 !== undefined ? ratio(r2017) : <span className="text-ink-3">aucun équivalent</span>}
                      {r2017 !== undefined && eq !== c.id && (
                        <span className="block text-xs text-ink-3">
                          {reference2017.candidates.find((x) => x.id === eq)?.name ?? eq}
                        </span>
                      )}
                    </td>
                    <td className={`${td} num text-right font-medium`}>
                      {estimate !== undefined ? ratio(estimate) : '—'}
                    </td>
                    <td className={td}>
                      {users.length > 0 ? users.join(', ') : <span className="text-ink-3">aucun</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <ul className="prose-method list-disc space-y-1 pl-5 text-[0.95rem]">
            {polls.candidates
              .filter((c) => c.ref2022Note)
              .map((c) => (
                <li key={c.id}>
                  <strong>{c.shortName}</strong> : {c.ref2022Note}
                  {settings.referenceBlend[c.id] !== undefined &&
                    ` Dans le scénario en cours : ${referenceParts(c, settings.referenceBlend[c.id])
                      .map(
                        (p) =>
                          `${reference2022.candidates.find((x) => x.id === p.id)?.name ?? p.id} ${pct(p.weight * 100, 0)}`,
                      )
                      .join(', ')}.`}
                </li>
              ))}
            <li>
              Pour une référence pondérée, l’écart estimé est la moyenne des écarts estimés de chaque
              référence, pondérée par son poids.
            </li>
            <li>
              Les autres candidats sont comparés à eux-mêmes en 2022, et à leur équivalent de 2017 quand il
              existe.
            </li>
          </ul>
          <div className="prose-method">
            <p>
              <strong>Répartition entre candidats qui partagent une référence.</strong> Chaque part
              d’électorat rattachée à une référence suit le même ratio. Cela revient à additionner ces parts
              dans un pot commun, à lui appliquer la progression (étape 2) et la correction de la référence,
              puis à le répartir au prorata : Glucksmann prend ainsi sa part de la dynamique de Macron,
              Retailleau sa part de celle de Le Pen, et inversement si elle est négative. Les scores étant
              ensuite ramenés à 100 %, ce que gagne un candidat est pris aux autres.
            </p>
          </div>
          <Table caption="Pots communs par référence de 2022 (scénario en cours, en points de la moyenne 2027)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Référence 2022</th>
                <th className={th}>Électorats de 2027 rattachés</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Progression</th>
                <th className={`${th} text-right`}>Écart estimé</th>
              </tr>
            </thead>
            <tbody>
              {reference2022.candidates.flatMap((ref) => {
                const parts = result.firstRound.flatMap((r) => {
                  const part = r.references.find((p) => p.id === ref.id)
                  return part && part.weight > 0
                    ? [{ id: r.candidateId, weight: part.weight, points: r.base * part.weight }]
                    : []
                })
                if (parts.length === 0) return []
                const prog = progression2022Stats.ratio[ref.id]
                const corr = calibration.correction.ratio[ref.id]
                return [
                  <tr key={ref.id} className="border-b border-rule/60">
                    <td className={td}>{ref.name}</td>
                    <td className={td}>
                      {parts
                        .map(
                          (p) =>
                            `${cand(p.id).shortName}${p.weight < 1 ? ` (${pct(p.weight * 100, 0)})` : ''} ${num(p.points)}`,
                        )
                        .join(' + ')}
                    </td>
                    <td className={`${td} num text-right`}>{num(parts.reduce((t, p) => t + p.points, 0))}</td>
                    <td className={`${td} num text-right ${settings.progressionEnabled ? '' : 'text-ink-3'}`}>
                      {prog ? ratio(prog) : '—'}
                    </td>
                    <td className={`${td} num text-right`}>{corr ? ratio(corr) : '—'}</td>
                  </tr>,
                ]
              })}
            </tbody>
          </Table>
          <Table caption="Corrections appliquées au scénario en cours">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Candidat</th>
                <th className={`${th} text-right`}>Moyenne 2027</th>
                {settings.progressionEnabled && <th className={`${th} text-right`}>Projetée (étape 2)</th>}
                <th className={`${th} text-right`}>Écart estimé</th>
                <th className={`${th} text-right`}>Correction</th>
                {settings.blogBiasEnabled && <th className={`${th} text-right`}>Billet</th>}
                {settings.turnoutEnabled && <th className={`${th} text-right`}>Participation</th>}
                <th className={`${th} text-right`}>Score corrigé</th>
              </tr>
            </thead>
            <tbody>
              {result.firstRound.map((r) => (
                <tr key={r.candidateId} className="border-b border-rule/60">
                  <td className={td}>{cand(r.candidateId).name}</td>
                  <td className={`${td} num text-right`}>{pct(r.base, 2)}</td>
                  {settings.progressionEnabled && (
                    <td className={`${td} num text-right`}>
                      {pct(r.projected, 2)}
                      {r.progressionFactor && (
                        <span className="ml-1 text-xs text-ink-3">{ratio(r.progressionFactor)}</span>
                      )}
                    </td>
                  )}
                  <td className={`${td} num text-right`}>{r.correctionRatio ? ratio(r.correctionRatio) : '—'}</td>
                  <td className={`${td} num text-right`}>
                    {pts(r.appliedCorrection, 2)}
                    {r.isOverride && <span className="ml-1 text-xs text-ballpoint">manuelle</span>}
                  </td>
                  {settings.blogBiasEnabled && (
                    <td className={`${td} num text-right`}>{r.blogBiasFactor ? ratio(r.blogBiasFactor) : '—'}</td>
                  )}
                  {settings.turnoutEnabled && (
                    <td className={`${td} num text-right`}>{r.turnoutFactor ? ratio(r.turnoutFactor) : '—'}</td>
                  )}
                  <td className={`${td} num text-right font-medium`}>
                    {pct(r.corrected, 2)}
                    {r.ceded > 1e-9 && (
                      <span className="ml-1 text-xs font-normal text-ink-3">dont cession {pts(-r.ceded, 2)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="prose-method">
            <h3 id="billet">Option : biais révélés par un billet de blog</h3>
            <p>
              Le{' '}
              <a href={BLOG_BIAS_URL} className="link" target="_blank" rel="noreferrer">
                billet d’Eliot Thibault publié le 01/11/2026 dans le Club de Mediapart
              </a>{' '}
              soutient que, loin du scrutin, les sondages surestiment l’extrême droite et sous-estiment la
              gauche. Il chiffre l’écart du bloc d’extrême droite à environ 4 points entre les sondages
              d’octobre 2021 et son score de 2022 (environ 5 points en 2017). L’option « Corriger les biais
              révélés dans le billet de blog d’Eliot Thibault » mesure ces écarts sur les données de 2022 et de
              2017 du simulateur, bloc par bloc, les combine comme à l’étape 3 (moyenne géométrique, chaque
              scrutin pesant {pct(ELECTION_WEIGHTS[2022] * 100, 0)}) et les applique aux candidats de 2027 de
              ces deux blocs. Elle est{' '}
              <strong>
                {settings.blogBiasEnabled
                  ? `activée, à ${pct(settings.blogBiasIntensity * 100, 0)} d’intensité`
                  : 'désactivée'}
              </strong>{' '}
              dans le scénario en cours.
              {(() => {
                const ed = calibration.blogBias.extreme_droite?.years
                const gap = (y: YearBlocBias | undefined) => (y && y.early > 0 ? pts(y.result - y.early) : null)
                const [g2022, g2017] = [gap(ed?.[2022]), gap(ed?.[2017])]
                return g2022 && g2017
                  ? ` Sur les données du simulateur, à la même distance du scrutin que la base 2027, cet écart est de ${g2022} en 2022 et de ${g2017} en 2017.`
                  : ''
              })()}
            </p>
            <p>
              L’écart se décompose comme les étapes 2 et 3 : l’évolution des sondages depuis la même distance
              du scrutin (le {date(progression2022Stats.asOf)} et le {date(progression2017Stats.asOf)} pour la
              base 2027 du {date(polls.asOf)}), puis l’écart entre derniers sondages et résultat. La date de
              comparaison suit la base 2027 : à mesure que le scrutin approche, elle se rapproche des votes de
              2022 et 2017 et l’évolution mesurée se réduit ; seul demeure, à la fin, l’écart entre derniers
              sondages et résultat.
            </p>
            <p>
              En 2017, les primaires LR (novembre 2016) et PS (janvier 2017) n’avaient pas encore désigné les
              candidats : à six mois du scrutin, toutes les hypothèses testant Emmanuel Macron sont retenues,
              et chaque candidat testé compte dans son bloc (Hollande, Valls, Montebourg ou Peillon à gauche
              comme Benoît Hamon). Les blocs n’ont pas le même poids d’un scrutin à l’autre : ce sont leurs
              écarts relatifs qui sont combinés, pas leurs niveaux.
            </p>
          </div>
          <Table caption="Écarts par bloc à la même distance du scrutin (candidats du même bloc à chaque scrutin)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Bloc</th>
                <th className={th}>Scrutin</th>
                <th className={`${th} text-right`}>Sondages à la même distance</th>
                <th className={`${th} text-right`}>Derniers sondages</th>
                <th className={`${th} text-right`}>Résultat</th>
                <th className={`${th} text-right`}>Progression</th>
                <th className={`${th} text-right`}>Correction</th>
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {BLOCS.flatMap((bloc) => {
                const b = calibration.blogBias[bloc]
                if (!b) return []
                const years = PAST_YEARS.filter((y) => b.years[y])
                return [
                  ...years.map((year, i) => {
                    const y = b.years[year]!
                    return (
                      <tr key={`${bloc}-${year}`} className="border-b border-rule/60">
                        {i === 0 && (
                          <td className={td} rowSpan={years.length + 1}>
                            {BLOC_LABELS[bloc]}
                          </td>
                        )}
                        <td className={td}>
                          {year}
                          <span className="block text-xs text-ink-3">
                            {(BLOG_BIAS_BLOCS[year][bloc] ?? []).map((id) => pastName(year, id)).join(', ')}
                          </span>
                        </td>
                        <td className={`${td} num text-right`}>
                          {y.early > 0 ? pct(y.early) : '—'}
                          <span className="block text-xs text-ink-3">au {date(PROGRESSIONS[year].asOf)}</span>
                        </td>
                        <td className={`${td} num text-right`}>{pct(y.final)}</td>
                        <td className={`${td} num text-right`}>{pct(y.result)}</td>
                        <td className={`${td} num text-right`}>
                          {y.progression !== null ? ratio(y.progression) : '—'}
                        </td>
                        <td className={`${td} num text-right`}>{ratio(y.correction)}</td>
                        <td className={`${td} num text-right`}>
                          {y.progression !== null ? ratio(y.progression * y.correction) : '—'}
                        </td>
                      </tr>
                    )
                  }),
                  <tr key={`${bloc}-estimate`} className="border-b border-rule">
                    <td className={`${td} font-medium`} colSpan={4}>
                      Estimation (2022 et 2017)
                    </td>
                    <td className={`${td} num text-right font-medium`}>{ratio(b.progression)}</td>
                    <td className={`${td} num text-right font-medium`}>{ratio(b.correction)}</td>
                    <td className={`${td} num text-right font-medium`}>{ratio(totalBias(b))}</td>
                  </tr>,
                ]
              })}
            </tbody>
          </Table>
          <div className="prose-method">
            <code className="formula">
              facteur du bloc = (1 + (progression − 1) × intensité) × (1 + (correction − 1) × intensité)
            </code>
            <p>
              Le facteur multiplie le score de chaque candidat du bloc après l’étape 3, puis les scores sont
              ramenés à 100 % : le centre et la droite, non corrigés, absorbent l’écart.
            </p>
            <p>
              <strong>Un même biais n’est corrigé qu’une fois.</strong> Pour un candidat disposant d’une
              référence 2022, chaque composante du facteur est réduite à ce que l’option dédiée ne corrige pas
              déjà :
            </p>
            <ul>
              <li>
                progression : « Progression comme en 2022 » ne reprend que 2022 ; quand elle est activée, le
                billet ne garde que ce que 2017 change à l’estimation (progression estimée ÷ progression de
                2022 du bloc) ;
              </li>
              <li>
                écart final : « Corriger la moyenne » l’estime déjà sur 2017 et 2022 ; quand elle est activée
                (ou qu’un écart est saisi à la main), le billet n’en reprend rien, sauf pour un candidat dont
                la référence n’a pas d’équivalent en 2017 (Roussel, Zemmour), pour qui il garde ce que 2017
                change à l’écart du bloc.
              </li>
            </ul>
            <p>
              L’option dédiée s’applique alors, pour ce candidat, à la plus forte des deux intensités (la sienne
              ou celle du billet). Seule, l’option du billet applique les deux composantes en entier. Les
              candidats sans référence 2022
              {(() => {
                const unreferenced = result.firstRound.filter((r) => {
                  const { bloc } = cand(r.candidateId)
                  return r.correctionRatio === null && bloc !== undefined && calibration.blogBias[bloc]
                })
                return unreferenced.length > 0
                  ? ` (${unreferenced.map((r) => cand(r.candidateId).shortName).join(', ')} dans le scénario en cours)`
                  : ''
              })()}{' '}
              reçoivent toujours le facteur complet de leur bloc.
            </p>

            <h3 id="participation">Option : participation attendue au 1er tour</h3>
            <p>
              Les sondages de 2027 portent sur les électeurs certains d’aller voter, dont la part gagne déjà du
              terrain : l’Ifop-Fiducial, avec les mêmes questions (« envisagez-vous d’aller voter ? » puis «
              tout à fait certain », « pratiquement certain »…), mesure {pct(bal?.certainNow.share ?? 0, 1)} des
              inscrits certains d’aller voter à {bal ? distance(bal.distances.now) : '…'} du scrutin, contre{' '}
              {pct(bal?.certainRef.share ?? 0, 1)} à une distance proche en 2021. Cette hausse est donc{' '}
              <strong>déjà dans les sondages</strong> : l’option « Participation attendue au 1er tour » ne la
              compte pas une seconde fois. Elle est{' '}
              <strong>{settings.turnoutEnabled ? 'activée' : 'désactivée'}</strong> dans le scénario en cours.
            </p>
            <p>
              <strong>Parts parmi ceux qui envisagent de voter, parts des inscrits.</strong> Le billet cite «
              77 % contre 69-70 % » : ce sont des parts <em>parmi ceux qui envisagent d’aller voter</em>, pas
              des parts des inscrits. Rapportée aux inscrits (envisagent × tout à fait certains), la hausse est
              de {bal ? pts(bal.certainNow.share - bal.certainRef.share, 1) : '…'}. Le billet ne donne aucune
              prévision de participation.
            </p>
          </div>
          <Table caption="Part des inscrits certains d’aller voter au 1er tour (Ifop-Fiducial, chiffres redressés)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Terrain</th>
                <th className={th}>Scrutin</th>
                <th className={`${th} text-right`}>Envisagent d’aller voter</th>
                <th className={`${th} text-right`}>Tout à fait certains, parmi eux</th>
                <th className={`${th} text-right`}>Part des inscrits</th>
                <th className={th}>Rôle dans le bilan</th>
              </tr>
            </thead>
            <tbody>
              {turnoutCertainty.measures.map((m) => {
                const role = bal
                  ? m === bal.certainNow.measure
                    ? 'E2027 (dernière mesure)'
                    : m === bal.certainRef.measure
                      ? 'E2022 (même distance du scrutin)'
                      : m === bal.finalRef.measure
                        ? 'F2022 (dernière vague avant le vote)'
                        : ''
                  : ''
                return (
                  <tr key={m.id} className="border-b border-rule/60">
                    <td className={td}>
                      <a href={m.source.url} className="link" target="_blank" rel="noreferrer" title={m.source.label}>
                        {fieldwork(m.fieldwork)}
                      </a>
                    </td>
                    <td className={td}>{m.cycle}</td>
                    <td className={`${td} num text-right`}>{m.envisage === undefined ? '—' : pct(m.envisage, 1)}</td>
                    <td className={`${td} num text-right`}>{m.certain === undefined ? '—' : pct(m.certain, 1)}</td>
                    <td className={`${td} num text-right font-medium`}>{pct(certainShare(m), 2)}</td>
                    <td className={td}>{role}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <div className="prose-method">
            <p>
              Le rolling du 05 au 08/04/2022 ne publie que l’indice de participation (73 % des inscrits,
              abstention 27 %). La part des inscrits des autres mesures se calcule : elle n’est pas saisie.
            </p>
            <p>
              <strong>Ce que la campagne ajoute, mesuré en 2022.</strong> Entre la mesure de 2021 et la dernière
              vague avant le vote, la part des certains a gagné F2022 − E2022 ; entre cette dernière vague et la
              participation réelle, P2022 − F2022. Ce sont les mobilisations que reproduisent déjà la
              progression (ou le billet) pour la campagne, et « Corriger la moyenne » (ou le billet) pour les
              derniers jours.
            </p>
          </div>
          {bal && (
            <Table caption="Décomposition de la mobilisation de 2022 et mesure de 2027 (en % des inscrits)">
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Grandeur</th>
                  <th className={`${th} text-right`}>Valeur</th>
                  <th className={th}>Origine</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['E2022', pct(bal.certainRef.share, 2), `certains en 2021, ${date(bal.certainRef.measure.fieldwork.end)} (J−${bal.distances.ref})`],
                  ['F2022', pct(bal.finalRef.share, 2), `dernière vague avant le vote, ${date(bal.finalRef.measure.fieldwork.end)}`],
                  ['P2022', pct(bal.turnoutRef, 2), 'participation réelle au 1er tour 2022 (votants ÷ inscrits)'],
                  ['Mobilisation de campagne', pts(bal.campaign, 2), 'F2022 − E2022'],
                  ['Mobilisation de fin de campagne', pts(bal.late, 2), 'P2022 − F2022'],
                  ['E2027', pct(bal.certainNow.share, 2), `certains aujourd’hui, ${date(bal.certainNow.measure.fieldwork.end)} (J−${bal.distances.now}), déjà dans les sondages`],
                ].map(([label, value, origin]) => (
                  <tr key={label} className="border-b border-rule/60">
                    <td className={td}>{label}</td>
                    <td className={`${td} num text-right font-medium`}>{value}</td>
                    <td className={td}>{origin}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="prose-method">
            <p>
              <strong>Contrôle : l’intention de participation à plusieurs mois n’est pas prédictive.</strong>{' '}
              L’enquête Ipsos bva-CEVIPOF (note de 10 sur 10, base : tous les inscrits) le confirme : à
              plusieurs mois du scrutin, elle reste nettement sous la participation réelle. Ipsos l’explique
              ainsi : « L’intention de participation à plusieurs mois du scrutin n’est pas prédictive du niveau
              réel de participation au premier tour car la campagne électorale a vocation à faire progresser la
              mobilisation du corps électoral. »
            </p>
          </div>
          <Table caption="Contrôle Ipsos bva-CEVIPOF : note de participation de 10/10 et participation réelle au 1er tour">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Terrain</th>
                <th className={th}>Scrutin suivant</th>
                <th className={`${th} text-right`}>Note 10/10</th>
                <th className={`${th} text-right`}>Participation réelle</th>
                <th className={`${th} text-right`}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {turnoutCertainty.control.measures.map((m) => {
                const real = m.election === null ? null : turnoutOf(REFERENCES[m.election])
                return (
                  <tr key={m.fieldwork.start} className="border-b border-rule/60">
                    <td className={td}>
                      <a href={turnoutCertainty.control.source.url} className="link" target="_blank" rel="noreferrer">
                        {fieldwork(m.fieldwork)}
                      </a>
                    </td>
                    <td className={td}>{m.election ?? '2027'}</td>
                    <td className={`${td} num text-right`}>{pct(m.share, 0)}</td>
                    <td className={`${td} num text-right`}>{real === null ? 'à venir' : pct(real, 2)}</td>
                    <td className={`${td} num text-right`}>{real === null ? '—' : pts(real - m.share, 1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <div className="prose-method">
            <p>
              <strong>Le bilan : un même électeur n’est compté qu’une fois.</strong> Les sondages représentent
              d’abord les certains d’aller voter (E2027). Les options activées leur ajoutent la mobilisation de
              2022 qu’elles reproduisent déjà, pour la part qu’elles couvrent (globalement, pas par candidat) :
            </p>
            <code className="formula">
              couverture de campagne = max(progression, billet) ; couverture de fin de campagne = max(correction,
              billet)
            </code>
            <code className="formula">
              V₀ = E2027 + couverture de campagne × (F2022 − E2022) + couverture de fin de campagne × (P2022 −
              F2022)
            </code>
            <code className="formula">ΔV = P2027 − V₀</code>
            <p>
              V₀ est l’électorat que représentent les sondages corrigés ; P2027 la participation attendue. Par
              défaut, P2027 = P2022 + (E2027 − E2022) : la hausse de la part des certains est reportée point
              pour point sur la participation. Avec le billet à 100 % et la participation par défaut, ΔV = 0 :
              tout est déjà dans les sondages corrigés et l’option n’a aucun effet. Sans aucune correction, ΔV =
              P2027 − E2027 : l’option ajoute toute la mobilisation de la campagne. ΔV peut être négatif (une
              participation attendue inférieure à V₀ retire des votants).
            </p>
            {bal && (
              <p>
                <strong>Scénario en cours.</strong> Couverture : campagne {pct(bal.coverage.campaign * 100, 0)},
                fin de campagne {pct(bal.coverage.late * 100, 0)}. V₀ = {pct(bal.v0, 2)} (E2027{' '}
                {pct(bal.certainNow.share, 2)} + {pts(bal.covered, 2)}). P2027 = {pct(bal.expected, 2)}{' '}
                ({settings.turnoutExpected === null ? 'défaut' : 'réglée'} ; défaut {pct(bal.defaultExpected, 2)}
                ). ΔV = {pts(bal.delta, 2)}.
              </p>
            )}
            <p>
              <strong>Pour qui votent les électeurs en plus (ou en moins) ?</strong> Le meilleur indice disponible
              est le vote, au 1er tour de 2022, des électeurs qui s’étaient abstenus au 1er tour de 2017,
              mesuré par le sondage jour du vote d’Ifop-Fiducial. Pour chaque bloc, l’affinité k rapporte sa
              part chez ces électeurs à sa part chez l’ensemble des votants. Jean Lassalle (
              {pct(TURNOUT_PROFILE_2022.all.lassalle ?? 0, 1)} de l’ensemble,{' '}
              {pct(TURNOUT_PROFILE_2022.abstainers2017.lassalle ?? 0, 0)} de ces électeurs), inclassable, est
              laissé de côté et les parts sont ramenées à 100 %.
            </p>
          </div>
          <Table caption="Vote au 1er tour 2022 selon la participation au 1er tour 2017 (Ifop-Fiducial, sondage jour du vote)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Bloc</th>
                <th className={`${th} text-right`}>Ensemble des votants</th>
                <th className={`${th} text-right`}>Abstentionnistes de 2017 venus voter</th>
                <th className={`${th} text-right`}>Affinité k</th>
              </tr>
            </thead>
            <tbody>
              {BLOCS.map((bloc) => (
                <tr key={bloc} className="border-b border-rule/60">
                  <td className={td}>
                    {BLOC_LABELS[bloc]}
                    <span className="block text-xs text-ink-3">
                      {TURNOUT_BLOCS_2022[bloc].map((id) => pastName(2022, id)).join(', ')}
                    </span>
                  </td>
                  <td className={`${td} num text-right`}>{pct(TURNOUT_SHARES.all[bloc] * 100)}</td>
                  <td className={`${td} num text-right`}>{pct(TURNOUT_SHARES.returning[bloc] * 100)}</td>
                  <td className={`${td} num text-right font-medium`}>
                    {num(calibration.turnout.affinity[bloc], 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="prose-method">
            <code className="formula">facteur du candidat = (V₀ + ΔV × k ÷ K) ÷ (V₀ + ΔV)</code>
            <p>
              k est l’affinité du bloc du candidat (1 sans bloc) et K l’affinité moyenne des votants du scénario
              (moyenne des k pondérée par les scores) : les votants en plus ou en moins s’ajoutent sans changer
              le total. Si ΔV est négatif, les blocs d’affinité supérieure à 1 perdent le plus ; le facteur est
              borné à 0 et vaut 1 si ΔV = 0. Il s’applique après la correction et le billet, puis les scores
              sont ramenés à 100 %. Il ne touche que le 1er tour.
            </p>
            <p>
              <strong>Limites.</strong>
            </p>
            <ul>
              <li>
                La part des certains est mesurée sur un échantillon, la participation sur les inscrits. L’écart
                entre les deux est supposé stable entre 2021 et 2026 (même institut, mêmes questions) ; rien ne
                le garantit.
              </li>
              <li>
                Un seul institut (Ifop-Fiducial) fournit la série ; le contrôle Ipsos bva-CEVIPOF n’entre pas
                dans le calcul.
              </li>
              <li>
                La mobilisation de référence est mesurée sur 2022 seul, alors que le billet combine 2017 et 2022
                pour ses biais.
              </li>
              <li>
                La couverture est traitée globalement, pas par candidat : le billet ne corrige que la gauche et
                l’extrême droite, alors que la mobilisation de 2022 entre en entier dans V₀. La remise à 100 %
                des facteurs de participation répercute cet écart sur l’ensemble des candidats.
              </li>
              <li>
                Le profil des électeurs en plus ou en moins repose sur une partie de l’échantillon d’un seul sondage (marge d’erreur de plusieurs
                points) et sur une seule élection : rien ne garantit que les électeurs qui reviendraient en
                2027 votent comme ceux de 2022.
              </li>
              <li>
                Les travaux sur le sujet trouvent en général un effet modeste d’une participation accrue sur
                les résultats, les abstentionnistes ayant des préférences proches de celles des votants de
                profil comparable (Citrin, Schickler et Sides, 2003, sur les sénatoriales américaines ; van der
                Eijk et van Egmond, 2007, sur les élections nationales et européennes). L’effet devient net
                quand la hausse est forte : en Australie, le vote obligatoire a augmenté la participation
                d’environ 24 points et le vote travailliste de 7 à 10 points (Fowler, 2013). Le modèle reste
                dans ce cadre : l’effet est proportionnel à la hausse et repose sur un profil mesuré, pas sur
                une hypothèse.
              </li>
            </ul>
          </div>
          <p className="text-sm text-ink-3">
            Sources :{' '}
            {PAST_YEARS.map((year) => (
              <span key={year}>
                <a href={REFERENCES[year].resultsSource.url} className="link" target="_blank" rel="noreferrer">
                  {REFERENCES[year].resultsSource.label}
                </a>
                ,{' '}
                <a href={REFERENCES[year].pollsSource.url} className="link" target="_blank" rel="noreferrer">
                  {REFERENCES[year].pollsSource.label}
                </a>
                ,{' '}
              </span>
            ))}
            <a href={TURNOUT_PROFILE_SOURCE.url} className="link" target="_blank" rel="noreferrer">
              {TURNOUT_PROFILE_SOURCE.label}
            </a>{' '}
            (liens vers chaque sondage dans les fichiers <code>reference-2022.json</code> et{' '}
            <code>reference-2017.json</code>).
          </p>
        </Step>

        <Step id="alliances" n={4} title="Alliances">
          <div className="prose-method">
            <p>
              Une alliance retire le candidat rallié du 1er tour : on ne garde que les hypothèses des sondages
              qui testent tous les autres candidats simulés sans lui (ni personne à sa place), et seuls les
              sondages qui en ont une (étape 1). Aucun taux de report n’est appliqué au 1er tour : ce sont les
              sondés eux-mêmes qui répartissent ses électeurs.
            </p>
            <p>
              Le retrait d’un candidat ne mesure son ralliement que si le leader reste le seul candidat principal
              de leur camp (leurs blocs) : quand Philippe se retire alors qu’Attal reste en lice, ses électeurs
              vont aussi vers Attal, et rien ne dit qu’ils suivraient Glucksmann.
            </p>
            {MINORS.length > 0 && (
              <p>
                Les mêmes règles valent pour les petits candidats (étape 1). Le ralliement d’un petit candidat se
                lit dans les hypothèses qui ne le testent pas, si son leader reste le seul candidat principal du
                camp : « Lisnard rejoint Retailleau » retient les hypothèses sans Lisnard. Les autres (Ruffin
                vers Mélenchon, alors que Glucksmann reste en lice à gauche) ne sont proposés qu’avec l’option
                des alliances non évaluées. Un petit candidat qui mène une alliance doit être testé : « Retailleau
                rejoint Lisnard » retient les hypothèses où Lisnard est le candidat de la droite.
              </p>
            )}
            <p>
              Les alliances proposées sont donc celles que les sondages de la période testent, seules ou
              combinées ; la liste suit la synchronisation des sondages.{' '}
              {PROPOSED.length > 0
                ? `Actuellement : ${PROPOSED.map((al) => al.label).join(' ; ')}.`
                : 'Aucune n’est testée actuellement.'}
              {COMBOS.length > 0 &&
                ` Certaines ne sont testées qu’ensemble, et s’activent alors ensemble : ${COMBOS.map((c) => c.map((al) => `« ${al.label} »`).join(' + ')).join(' ; ')}.`}{' '}
              Un candidat ne rallie qu’une alliance, et un candidat rallié ne peut pas en mener une autre.
            </p>
            {INCOMPATIBLE.length > 0 && (
              <details>
                <summary className="cursor-pointer font-sans text-sm font-medium text-ballpoint">
                  {INCOMPATIBLE.length} paires d’alliances proposées incompatibles
                </summary>
                <p className="mt-2">
                  {INCOMPATIBLE.map(([x, y]) => `« ${x.label} » et « ${y.label} »`).join(' ; ')}.
                </p>
              </details>
            )}
            <p>
              {result.allianceIds.length > 0
                ? `Dans le scénario en cours : ${polls.alliances
                    .filter((al) => result.allianceIds.includes(al.id))
                    .map((al) => `« ${al.label} »`)
                    .join(', ')} (hypothèse « ${result.hypothesisSet.label} », ${result.institutesUsed} institut${result.institutesUsed > 1 ? 's' : ''}).`
                : result.estimatedAllianceIds.length === 0 && 'Aucune alliance n’est activée dans le scénario en cours.'}
            </p>
            <h3>Option : alliances non évaluées par les sondeurs</h3>
            <p>
              Désactivée par défaut, l’option « Permettre de tester des alliances non évaluées par les
              sondeurs » propose tout le catalogue d’alliances. Une alliance qu’aucune hypothèse ne teste (avec
              les alliances testées actives) est alors <strong>estimée</strong> : sur la base des sondages,
              les électeurs du candidat rallié se répartissent comme lors des{' '}
              <strong>désistements des législatives 2024</strong>. On lit, dans la grille des reports (étape 6),
              la ligne de son électorat pour le type de duel du leader : une part suit le leader, une part vote
              pour le candidat RN, le reste s’abstient ; les scores sont ensuite ramenés à 100 %. Une part
              modifiée dans les réglages garde, pour le reste, la répartition RN / abstention de 2024.
            </p>
            <p>
              Un petit candidat rallié peut manquer aux hypothèses retenues (Ruffin n’est testé qu’avec Attal :
              absent quand Attal rejoint Philippe). Pour estimer son ralliement, son score est repris des
              hypothèses qui le testent dans les sondages retenus, puis prélevé, après les corrections, sur les
              candidats vers lesquels se reportent ses électeurs en son absence (répartition choisie pour ce
              petit candidat, au prorata de ceux qui sont en lice). Sans référence 2022, il ne reçoit ni
              progression ni correction : le prélever avant aurait privé ses donneurs de leur correction sur ces
              électeurs. Ses électeurs suivent ensuite le leader selon les reports de 2024. Si
              aucun sondage retenu ne le teste, son ralliement ne peut pas être estimé.
            </p>
            <h3>Option : alliances groupées</h3>
            <p>
              Désactivée par défaut, l’option « Alliances groupées » propose des alliances de plusieurs
              candidats d’un même camp :{' '}
              {polls.alliances
                .filter((al) => al.grouped)
                .map((al) => `« ${al.label} » (${al.description}, autour de ${cand(al.leader).name})`)
                .join(' ; ')}
              . Le candidat derrière lequel l’alliance se rassemble est celui qui a le plus d’intentions de vote
              au 1er tour dans la moyenne des sondages (jeu d’hypothèses par défaut, avant corrections) ; il est
              recalculé à chaque synchronisation. Aucun sondage ne teste ces alliances : elles sont toujours
              estimées, comme les alliances non évaluées (reports des législatives 2024), pour chaque candidat
              rallié. Un candidat ne rallie qu’une alliance : elles sont incompatibles avec une alliance qui
              partage l’un de leurs membres sans le même leader.
            </p>
            <p>
              Les hypothèses testées gardent la priorité : l’option ne change pas les sondages retenus. Ce sont
              ceux qui testent la plus grande combinaison d’alliances actives testée par les sondeurs, comme sans
              l’option (par exemple « Philippe seul » pour Attal rejoint Philippe) ; seules les autres alliances
              actives, qu’aucune de leurs hypothèses ne permet, y sont estimées, après la moyenne et les
              corrections.{' '}
              {settings.untestedAlliances
                ? 'L’option est activée dans le scénario en cours.'
                : 'L’option n’est pas activée dans le scénario en cours.'}
            </p>
          </div>
          {(settings.untestedAlliances || settings.groupedAlliances) && <AllianceRates result={result} />}
          <div className="prose-method">
            {result.allianceLeaks.length > 0 && (
              <p>
                Électeurs ralliés qui votent RN :{' '}
                {result.allianceLeaks.map((l) => `${pct(l.points)} venus de ${cand(l.from).shortName}`).join(', ')},
                ajoutés au score de {cand(result.allianceLeaks[0]!.to).shortName}.
              </p>
            )}
            {result.entrants
              .filter((e) => e.allianceIds.length > 0)
              .map((e) => (
                <p key={e.id}>
                  <strong>{entrantLabel(e)}</strong> (alliance estimée) : {pct(shownScore(result, e))}, soit{' '}
                  {e.members
                    .map((m) => `${cand(m.candidateId).shortName} ${pct(m.contribution)} (poids ${num(m.weight, 2)})`)
                    .join(' et ')}
                  . Ces poids servent à mélanger les profils de reports au 2nd tour.
                </p>
              ))}
          </div>
        </Step>

        <Step id="qualification" n={5} title="Qualification">
          <div className="prose-method">
            <p>
              Les deux candidats en tête du 1er tour simulé sont qualifiés :{' '}
              <strong>{entrantLabel(a)}</strong> ({pct(shownScore(result, a))}) et <strong>{entrantLabel(b)}</strong> (
              {pct(shownScore(result, b))})
              {result.entrants[2] && (
                <>
                  , devant {entrantLabel(result.entrants[2])} ({pct(shownScore(result, result.entrants[2]))})
                </>
              )}
              . Quand l’écart entre le 2e et le 3e est inférieur à {num(TIGHT_QUALIFICATION_GAP, 0)} point,
              bien moins que la marge d’erreur des sondages (de l’ordre de 2 à 3 points pour un échantillon de
              1 000 personnes), la qualification est jugée serrée : les deux seconds tours possibles sont
              simulés (1er contre 2e, 1er contre 3e) et un sélecteur permet d’afficher l’un ou l’autre.
              {result.qualification.tight && result.qualification.withThird && (
                <>
                  {' '}
                  C’est le cas ici (écart de {num(result.qualification.gap!, 2)} point) :{' '}
                  {cand(result.qualification.withSecond.a).shortName}{' '}
                  {pct(result.qualification.withSecond.pct.a)} contre{' '}
                  {cand(result.qualification.withSecond.b).shortName}{' '}
                  {pct(result.qualification.withSecond.pct.b)}, ou{' '}
                  {cand(result.qualification.withThird.a).shortName}{' '}
                  {pct(result.qualification.withThird.pct.a)} contre{' '}
                  {cand(result.qualification.withThird.b).shortName}{' '}
                  {pct(result.qualification.withThird.pct.b)}. Les étapes suivantes détaillent le second tour
                  affiché.
                </>
              )}
            </p>
          </div>
        </Step>

        <Step id="reports" n={6} title="Reports de voix et calcul du 2nd tour">
          <div className="prose-method">
            <p>
              Le 2nd tour applique les reports de voix mesurés au 2nd tour des{' '}
              <strong>élections législatives de 2024</strong> par l’enquête Ipsos-Talan publiée par{' '}
              <a href={transfers.sources.franceinfo.url} target="_blank" rel="noreferrer">
                franceinfo le 07/07/2024
              </a>
              , source de référence. Deux articles reprenant la même enquête complètent certaines valeurs :{' '}
              <a href={transfers.sources.publicsenat.url} target="_blank" rel="noreferrer">
                Public Sénat
              </a>{' '}
              et{' '}
              <a href={transfers.sources.lcp.url} target="_blank" rel="noreferrer">
                LCP
              </a>
              .
            </p>
            <p>
              Le type de duel détermine les taux : un candidat LFI face au RN (Mélenchon), un candidat PS,
              écologiste ou PCF face au RN (Glucksmann, Tondelier, Roussel), un candidat Ensemble face au RN
              (Philippe, Attal), un candidat LR face au RN (Retailleau). Pour une alliance estimée (option de
              l’étape 4), on fait la moyenne des profils de ses membres, pondérée par leur poids.
            </p>
            <code className="formula">
              voix du finaliste = Σ (électorat de chaque candidat × taux de report vers ce finaliste)
            </code>
            <code className="formula">
              résultat = voix A ÷ (voix A + voix B), en % des suffrages exprimés
            </code>
            <p>
              Le calcul part de l’électorat de chaque candidat au 1er tour simulé ; les électeurs d’un candidat
              éliminé se reportent selon leur bloc. Le rallié d’une alliance testée par les sondeurs (étape 4) est
              absent des hypothèses retenues : ses électeurs sont déjà répartis entre les autres candidats par les
              sondés. Pour une alliance estimée, le calcul part de l’électorat <strong>avant alliance</strong> :
              les électeurs d’un candidat rallié à un finaliste suivent le taux d’alliance (la part qui a suivi le
              leader dès le 1er tour lui reste fidèle, la part qui a voté RN vote RN, et ceux qui se sont abstenus
              se reportent comme les électeurs de leur bloc) ; une alliance estimée entre candidats éliminés ne
              change pas le 2nd tour, seulement la qualification.
            </p>
            <p>
              <strong>Seuls des taux mesurés en 2024 sont utilisés par défaut.</strong>{' '}
              {transfers.completionRule}
            </p>
            <p>
              Les électeurs des finalistes, de leurs alliés et du camp RN votent pour leur candidat à{' '}
              {pct(sr.fidelity * 100, 0)} : c’est la seule hypothèse sans source des réglages par défaut,
              modifiable dans les réglages.
            </p>
            <p>
              Scénario en cours :{' '}
              {sr.duel.kind === 'sourced'
                ? `profil ${sr.duel.profileWeights.map((w) => `« ${profileLabel(w.profileId)} » (${pct(w.weight * 100, 0)})`).join(', ')}.`
                : 'ce duel n’est couvert par aucune source, le modèle de repli s’applique (voir plus bas).'}{' '}
              Le décompte des voix figure à l’étape 7.
            </p>
          </div>

          <ProvenanceLegend />
          <Table caption="Taux de report par type de duel (en % de chaque électorat : finaliste / RN / blanc, nul ou abstention)">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Type de duel</th>
                {BLOCS.map((bloc) => (
                  <th key={bloc} className={th}>
                    {BLOC_VOTERS[bloc]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfers.profiles.map((p) => (
                <tr key={p.id} className="border-b border-rule/60">
                  <td className={`${td} font-medium`}>{p.label}</td>
                  {BLOCS.map((bloc) => {
                    const row = p.rows[bloc]
                    return (
                      <td key={bloc} className={`${td} whitespace-nowrap`} title={row.note}>
                        <ProvenanceValue value={row.finalist} provenance={row.provenance.finalist} />
                        {' / '}
                        <ProvenanceValue value={row.rn} provenance={row.provenance.rn} />
                        {' / '}
                        <ProvenanceValue value={row.abstention} provenance={row.provenance.abstention} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
          <details className="prose-method text-[0.95rem]">
            <summary className="cursor-pointer font-sans text-sm font-medium text-ballpoint">
              Justification de chaque ligne
            </summary>
            <div className="mt-3 space-y-3">
              {transfers.profiles.map((p) => (
                <div key={p.id}>
                  <p className="font-sans text-sm font-semibold">{p.sourceDuel}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {BLOCS.map((bloc) => (
                      <li key={bloc}>
                        <span className="font-medium">{BLOC_LABELS[bloc]} :</span> {p.rows[bloc].note}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
          <div className="prose-method">
            <p>
              Les électorats sont regroupés en blocs :{' '}
              {BLOCS.map(
                (bloc) =>
                  `${lowerFirst(BLOC_LABELS[bloc])} (${polls.candidates
                    .filter((c) => c.bloc === bloc && !c.minor)
                    .map((c) => c.shortName)
                    .join(', ')})`,
              ).join(', ')}
              . Les chiffres des législatives portent sur des électorats de partis (NFP, Ensemble, LR) et sont
              appliqués aux candidats de ces familles ; Zemmour et Dupont-Aignan sont rattachés au camp RN,
              comme l’électorat « RN et alliés » de 2024.
            </p>
            {MINORS.length > 0 && (
              <>
                <h3>Électeurs des petits candidats</h3>
                <p>
                  Aucune enquête ne mesure le report des électeurs des petits candidats. Éliminés au 1er tour,
                  ils se reportent comme les électeurs d’un ou plusieurs candidats principaux, selon des poids :
                  une part se comporte comme l’électorat de Glucksmann, l’autre comme celui de Philippe, par
                  exemple. Chaque part suit ainsi son candidat s’il est finaliste (fidélité de{' '}
                  {pct(sr.fidelity * 100, 0)}) ou allié d’un finaliste, et sinon le report de son bloc. Ces poids
                  sont des <strong>hypothèses</strong> fondées sur le positionnement de chaque candidat et sur
                  les sources citées ; d’autres répartitions sont proposées dans les réglages.
                </p>
              </>
            )}
          </div>
          {MINORS.length > 0 && (
            <Table caption="Report des électeurs des petits candidats au 2nd tour (répartition du scénario en cours)">
              <thead>
                <tr className="border-b border-rule">
                  <th className={th}>Candidat</th>
                  <th className={th}>Se reportent comme</th>
                  <th className={th}>Justification</th>
                  <th className={th}>Autres répartitions</th>
                </tr>
              </thead>
              <tbody>
                {MINORS.map((c) => {
                  const chosen = minorTransfer(c, settings.minorTransfers)!
                  return (
                    <tr key={c.id} className="border-b border-rule/60">
                      <td className={`${td} font-medium`}>{c.name}</td>
                      <td className={td}>{transferLabel(chosen.parts)}</td>
                      <td className={td}>
                        {chosen.note}
                        {chosen.sources?.map((src) => (
                          <a key={src.url} href={src.url} className="link ml-1.5 text-xs" target="_blank" rel="noreferrer">
                            {src.label}
                          </a>
                        ))}
                      </td>
                      <td className={`${td} text-ink-2`}>
                        {c.minor!.transfers
                          .filter((t) => t !== chosen)
                          .map((t) => `${t.label} (${transferLabel(t.parts)})`)
                          .join(' ; ') || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
          <div className="prose-method">
            <p>
              <strong>Modèle de repli.</strong> {transfers.fallback.description} Abstention par bloc :{' '}
              {BLOCS.map(
                (bloc) => `${lowerFirst(BLOC_LABELS[bloc])} ${pct(transfers.fallback.abstention[bloc], 0)}`,
              ).join(', ')}
              .
            </p>
          </div>
        </Step>

        <Step id="abstention" n={7} title="Blancs, nuls et abstention au 2nd tour">
          <div className="prose-method">
            <p>
              Le niveau global des votes blancs, nuls et de l’abstention au 2nd tour est une hypothèse{' '}
              <strong>propre à chaque duel</strong>. Il se mesure en part des électeurs exprimés du 1er tour qui
              ne s’expriment pas au 2nd (« abandon ») :
            </p>
            <code className="formula">abandon = 1 − exprimés du 2nd tour ÷ exprimés du 1er tour</code>
            <p>
              <strong>Règle de choix.</strong> Pour un duel que les reports de 2024 couvrent, la cible est
              l’abandon constaté aux législatives de 2024 dans les duels équivalents (même profil que les reports
              de l’étape 6), pondéré par les poids du profil quand une alliance en mêle plusieurs. Pour un duel
              sans RN (repli), c’est la moyenne simple des seconds tours présidentiels sans FN ni RN, {listFr(NO_RN_YEARS.map(String))} :{' '}
              {pct(noRnDropout(dropoutData), 2)}. Une valeur saisie dans les réglages l’emporte et vaut pour tous
              les duels ; le calage peut aussi être désactivé (taux bruts de 2024).
            </p>
            <p>
              Le taux d’abstention de chaque électorat, issu des reports de 2024, est multiplié par un même
              coefficient pour atteindre cette cible ; les votes exprimés gardent la répartition des reports de
              2024. Seules les différences d’abstention entre électorats influent sur le résultat en % des
              exprimés.
            </p>
            <p>
              Scénario en cours :{' '}
              {sr.abstention.target === null
                ? `calage désactivé, les taux bruts de 2024 donnent ${pct(sr.abstention.uncalibrated)} de blancs, nuls et abstentions.`
                : `taux bruts de 2024 : ${pct(sr.abstention.uncalibrated)}, cible ${pct(sr.abstention.target, 2)} (${settings.abstentionTarget === null ? `estimation pour ce duel : ${dropoutBasis(sr.duel)}` : 'choisie dans les réglages'}${settings.abstentionTarget === null ? `, soit ${pct(duelDropout(sr.duel, dropoutData), 2)}` : ''}), coefficient ×${num(sr.abstention.factor, 2)}.`}{' '}
              {cand(sr.a).shortName} obtient {num(sr.votes.a)} points et {cand(sr.b).shortName}{' '}
              {num(sr.votes.b)} points sur 100 électeurs exprimés du 1er tour ; {num(sr.votes.abstention)}{' '}
              votent blanc, nul ou s’abstiennent. D’où{' '}
              <strong>
                {cand(sr.a).shortName} {pct(sr.pct.a)}
              </strong>{' '}
              et{' '}
              <strong>
                {cand(sr.b).shortName} {pct(sr.pct.b)}
              </strong>
              .
            </p>
          </div>
          <Table caption="Législatives de 2024 : abandon net dans les duels RN – autre camp, par type de duel">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Type de duel</th>
                <th className={`${th} text-right`}>Circonscriptions</th>
                <th className={`${th} text-right`}>Exprimés du 1er tour</th>
                <th className={`${th} text-right`}>Exprimés du 2nd tour</th>
                <th className={`${th} text-right`}>Abandon</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(DUEL_KIND) as (keyof typeof DUEL_KIND)[]).map((id) => {
                const p = dropoutData.legislatives2024.profiles[id]
                return (
                  <tr key={id} className="border-b border-rule/60">
                    <td className={td}>
                      {p.label}
                      <span className="block text-xs text-ink-3">{DUEL_KIND[id]}</span>
                    </td>
                    <td className={`${td} num text-right`}>{integer(p.constituencies.length)}</td>
                    <td className={`${td} num text-right`}>{integer(p.firstRoundExpressed)}</td>
                    <td className={`${td} num text-right`}>{integer(p.secondRoundExpressed)}</td>
                    <td className={`${td} num text-right font-medium`}>{pct(profileDropout(p), 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <div className="prose-method">
            <p>
              Le profil vient de la nuance du candidat non RN (ministère de l’Intérieur). La nuance « UG »
              ne distinguant pas LFI des autres partis de gauche, le parti du candidat de gauche est lu sur les
              pages Wikipédia « Élections législatives de 2024 dans… » de chaque département.{' '}
              {dropoutData.legislatives2024.unclassified.length} duels RN – gauche, surtout à La Réunion, n’ont
              pas pu être classés et sont exclus. {dropoutData.legislatives2024.method}
            </p>
          </div>
          <Table caption="Seconds tours présidentiels de 2002 à 2022 : abandon net, pour comparaison">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Scrutin</th>
                <th className={th}>Duel</th>
                <th className={`${th} text-right`}>Participation au 1er tour</th>
                <th className={`${th} text-right`}>Exprimés du 1er tour</th>
                <th className={`${th} text-right`}>Exprimés du 2nd tour</th>
                <th className={`${th} text-right`}>Abandon</th>
              </tr>
            </thead>
            <tbody>
              {PRESIDENTIAL_ROWS.map((row) => (
                <tr key={row.year} className="border-b border-rule/60">
                  <td className={td}>{row.year}</td>
                  <td className={td}>{row.duel}</td>
                  <td className={`${td} num text-right`}>{pct(row.turnout, 1)}</td>
                  <td className={`${td} num text-right`}>{integer(row.first)}</td>
                  <td className={`${td} num text-right`}>{integer(row.second)}</td>
                  <td className={`${td} num text-right font-medium`}>{pct(row.dropout, 2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-sm text-ink-3">
            Sources :{' '}
            {[...dropoutData.legislatives2024.sources, ...PRESIDENTIAL_ROWS.flatMap((r) => r.sources)].map((src, i, all) => (
              <span key={src.url}>
                <a href={src.url} className="link" target="_blank" rel="noreferrer">
                  {src.label}
                </a>
                {i === all.length - 1 ? '.' : ', '}
              </span>
            ))}
          </p>
          <div className="prose-method">
            <p>
              <strong>Pourquoi 2024.</strong> Les législatives de 2024 ont eu lieu dans un contexte de risque RN
              élevé et de forte participation, comparable à celui d’un 2nd tour avec le RN en 2027. Les seconds
              tours présidentiels entre candidats acceptables (
              {PRESIDENTIAL_ROWS.filter((r) => NO_RN_YEARS.includes(r.year))
                .map((r) => `${r.year} : ${pct(r.dropout, 1)}`)
                .join(', ')}
              ) sont du même ordre que les duels RN – centre ou droite de 2024 : une forte participation au 1er
              tour ne crée pas à elle seule d’abandon.
            </p>
            <p>
              <strong>Pourquoi pas 2002.</strong> Le 2nd tour de 2002 (
              {pct(PRESIDENTIAL_ROWS.find((r) => r.year === 2002)?.dropout ?? 0, 1)}, un abandon négatif : plus
              d’exprimés au 2nd tour qu’au 1er) partait d’un 1er tour à faible participation (
              {pct(PRESIDENTIAL_ROWS.find((r) => r.year === 2002)?.turnout ?? 0, 1)}), un réservoir d’électeurs
              que 2027 n’aura pas si la participation attendue est élevée.
            </p>
            <p>
              <strong>Lecture.</strong> La mobilisation contre le RN fait baisser l’abandon face au centre, à la
              droite ou à une gauche non LFI, mais pas face à LFI : {pct(profileDropout(dropoutData.legislatives2024.profiles.lfi_rn), 2)}, proche
              des {pct(secondRoundDropout(reference2022), 2)} de 2022. Une partie des électeurs du centre et de la
              droite refuse de choisir, ce qui concorde avec les profils de reports (étape 6) : 43 % des électeurs
              Ensemble vers LFI contre 54 % vers un candidat PS ou écologiste.
            </p>
            <p>
              <strong>Sensibilité.</strong> Le calage compte beaucoup quand le duel est serré. Le même duel est
              donc aussi calculé avec l’abandon du 2nd tour de 2017 ({pct(secondRoundDropout(reference2017), 2)}) puis
              de 2022 ({pct(secondRoundDropout(reference2022), 2)}), présidentielles récentes à risque RN plus faible, tout le reste égal.
              Seule la mention « 2nd tour serré », sous le résultat, signale celles de ces variantes qui
              changent le vainqueur, y compris quand la cible est saisie dans les réglages : le résultat
              affiché ne doit pas être lu comme acquis.
              {result.secondRoundSensitivity &&
                ` Scénario en cours : avec 2017 (${pct(result.secondRoundSensitivity.variants[2017].target, 2)}), ${cand(sr.a).shortName} ${pct(result.secondRoundSensitivity.variants[2017].pct.a)} et ${cand(sr.b).shortName} ${pct(result.secondRoundSensitivity.variants[2017].pct.b)} ; avec 2022 (${pct(result.secondRoundSensitivity.variants[2022].target, 2)}), ${pct(result.secondRoundSensitivity.variants[2022].pct.a)} et ${pct(result.secondRoundSensitivity.variants[2022].pct.b)}. ${result.secondRoundSensitivity.winnerChanges ? 'Le vainqueur change.' : 'Le vainqueur ne change pas.'}`}
            </p>
            <p>
              <strong>Limites.</strong>
            </p>
            <ul>
              <li>
                Une élection législative n’est pas une présidentielle : candidats locaux, désistements
                circonscription par circonscription (le « front républicain »).
              </li>
              <li>
                Le classement des partis de gauche s’appuie sur Wikipédia, et {dropoutData.legislatives2024.unclassified.length} duels
                RN – gauche n’ont pas pu être classés.
              </li>
              <li>
                Les échantillons sont limités : {Object.values(dropoutData.legislatives2024.profiles).map((p) => p.constituencies.length).join(', ')}{' '}
                circonscriptions selon le type de duel.
              </li>
              <li>L’estimation suppose que le contexte de 2024 se reproduise en 2027.</li>
              <li>
                2017 a connu un record de blancs et nuls (
                {pct((100 * (reference2017.secondRound.blank + reference2017.secondRound.invalid)) / reference2017.secondRound.voters, 1)} des votants) :
                son abandon, comme celui de 2022, sert seulement de variante de sensibilité.
              </li>
            </ul>
          </div>
        </Step>

        <section
          id="limites"
          aria-labelledby="limits-title"
          className="scroll-mt-6 border-t border-rule pt-8"
        >
          <h3 id="limits-title" className="text-xl font-bold tracking-tight">
            Limites et précautions
          </h3>
          <ul className="prose-method mt-4 list-disc space-y-2 pl-5">
            <li>
              Cette page est une <strong>simulation</strong> fondée sur des sondages publiés et sur des
              hypothèses. Ce n’est ni un sondage ni une prévision.
            </li>
            <li>
              Les reports des législatives de 2024 ont été mesurés dans un contexte de désistements et de «
              front républicain » circonscription par circonscription. La simulation est nettement plus
              favorable aux adversaires du RN que les sondages directs de 2nd tour, affichés en repère à côté
              du résultat. Ces sondages ne portent que sur les « votants décidés » : à six mois du scrutin,{' '}
              {NO_INTENTION ? range(NO_INTENTION.min, NO_INTENTION.max) : 'une part importante'} des personnes
              interrogées, selon les instituts et les duels, n’expriment aucun choix entre les deux candidats
              (indécis, vote blanc ou nul et abstention compris), alors qu’au 2nd tour de 2022 et de 2017, seuls{' '}
              {pct(secondRoundDropout(reference2022), 2)} et {pct(secondRoundDropout(reference2017), 2)} des
              électeurs exprimés au 1er tour ne se sont pas exprimés au 2nd.
              {NO_INTENTION && (
                <>
                  {' '}
                  La fourchette va de la part la plus basse à la plus haute des {NO_INTENTION.polls.length} duels du
                  tableau ci-dessous, lue dans la notice ou le rapport de chaque institut. La base diffère : l’ensemble
                  des inscrits interrogés ({institutesOf('inscrits')}) ou les seuls inscrits comptant voter (
                  {institutesOf('votants')}), les autres n’étant pas interrogés
                  sur leur choix, ce qui abaisse la part.
                  {COMPUTED.length > 0 &&
                    ` ${listFr(COMPUTED)} ne ${COMPUTED.length > 1 ? 'publient' : 'publie'} pas cette part telle quelle : elle est calculée d’après la notice (≈, détail du calcul dans le tableau).`}
                  {UNDECIDED.length > 0 &&
                    ` Seul${UNDECIDED.length > 1 ? 's' : ''} ${listFr(UNDECIDED)} ${UNDECIDED.length > 1 ? 'distinguent' : 'distingue'} les indécis (« ne sait pas ») du vote blanc ou nul ; les autres instituts ne proposent pas cette réponse ou n’en publient pas le score à part.`}
                  <details className="mt-2 font-sans text-sm">
                    <summary className="cursor-pointer font-medium text-ballpoint">
                      Part sans intention de vote, duel par duel
                    </summary>
                    <div className="mt-2">
                      <Table>
                        <thead>
                          <tr className="border-b border-rule">
                            <th className={th}>Institut</th>
                            <th className={th}>Terrain</th>
                            <th className={th}>Duel publié</th>
                            <th className={th}>Sans intention de vote</th>
                          </tr>
                        </thead>
                        <tbody>
                          {NO_INTENTION.polls.map((p) => {
                            const n = p.noIntention!
                            return (
                              <tr key={`${p.institute}-${p.fieldwork.end}-${Object.keys(p.scores).join('-')}`} className="border-b border-rule/60">
                                <td className={td}>
                                  <span className="font-medium text-ink">{p.institute}</span>
                                  <a href={n.source.url} className="link mt-0.5 block text-xs" target="_blank" rel="noreferrer">
                                    {n.source.label}
                                  </a>
                                </td>
                                <td className={`${td} num whitespace-nowrap`}>{fieldwork(p.fieldwork)}</td>
                                <td className={`${td} num`}>
                                  {Object.entries(p.scores)
                                    .map(([id, v]) => `${cand(id).shortName} ${pct(v, Number.isInteger(v) ? 0 : 1)}`)
                                    .join(' – ')}
                                </td>
                                <td className={td}>
                                  {noIntentionLabel(n)}
                                  {n.calculation && (
                                    <span className="mt-0.5 block text-xs text-ink-3">{n.calculation}</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </Table>
                    </div>
                  </details>
                </>
              )}
            </li>
            <li>
              Chaque sondage a une marge d’erreur et décrit l’opinion au moment de son terrain, à six mois du
              scrutin. Les corrections de 2017 et 2022 supposent que les biais se répètent en moyenne, ce qui
              n’est pas garanti : deux scrutins ne suffisent pas à distinguer un biais durable d’un accident.
            </li>
            <li>
              Par défaut, seule la fidélité des électeurs des finalistes ({pct(sr.fidelity * 100, 0)}) ne
              vient d’aucune source, ainsi que le modèle de repli, utilisé seulement pour un duel sans le RN.
              Les taux repris d’un autre duel et le rattachement de Zemmour et Dupont-Aignan au camp RN sont
              des choix de modélisation, signalés dans le tableau de l’étape 6.
            </li>
            {MINORS.length > 0 && (
              <li>
                Les petits candidats comptent pour 0 % dans les hypothèses qui ne les testent pas : leur score
                moyen dépend du nombre d’hypothèses où les sondeurs les testent, et il est plus faible que
                dans les seules hypothèses où ils figurent. Le report de leurs électeurs au 2nd tour est une
                hypothèse (étape 6).
              </li>
            )}
            <li>
              Le calage de l’abstention suppose une participation au 1er tour comparable à celle de 2017 et 2022.
              L’option de participation attendue ne modifie que le 1er tour, sur un profil d’électeurs mesuré
              par un seul sondage.
            </li>
            <li>
              Les chiffres des sondages viennent de la liste des sondages de Wikipedia et ne sont pas
              revérifiés dans les notices de la Commission des sondages (en lien pour chaque sondage, étape 1).
            </li>
          </ul>
        </section>
      </div>
    </article>
  )
}
