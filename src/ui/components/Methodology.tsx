import type { ReactNode } from 'react'
import { simulationData } from '../../data/schema'
import { BLOCS } from '../../domain/types'
import type { PollOrigin, PollStatus, SimulationResult } from '../../domain/types'
import { alliancesConflict } from '../../domain/alliances'
import { referenceParts } from '../../domain/references'
import { TIGHT_QUALIFICATION_GAP } from '../../domain/simulate'
import { secondRoundDropout2022 } from '../../domain/secondRound'
import { progression2022Stats, reference2022Stats } from '../../hooks/useSimulation'
import { useSettings } from '../../state/settingsStore'
import { anyName, BLOC_LABELS, BLOC_VOTERS, cand, entrantLabel, profileLabel } from '../candidates'
import { date, fieldwork, integer, num, pct, pts, ratio } from '../format'
import { Link } from '../Link'
import { AllianceRates } from './AllianceRates'
import { ProvenanceLegend, ProvenanceValue } from './Provenance'

const { polls, reference2022, transfers } = simulationData

const STEPS: [string, string][] = [
  ['sondages', 'Moyenne des sondages'],
  ['progression', 'Progression comme en 2022'],
  ['corrections', 'Corrections 2022'],
  ['alliances', 'Alliances'],
  ['qualification', 'Qualification'],
  ['reports', 'Reports de voix'],
  ['abstention', 'Abstention du 2nd tour'],
]

const DEFAULT_SET = polls.hypothesisSets.find((s) => s.default) ?? polls.hypothesisSets[0]!
/** Alliances modélisées par un jeu d'hypothèses (ex. Attal rejoint Philippe → sondages sans Attal). */
const HYPOTHESIS_ALLIANCES = polls.alliances.flatMap((al) => {
  const set = polls.hypothesisSets.find((s) => s.id === al.hypothesisSet)
  return set ? [{ ...al, set, rallied: al.members.filter((id) => id !== al.leader) }] : []
})

const INCOMPATIBLE = polls.alliances.flatMap((x, i) =>
  polls.alliances.slice(i + 1).flatMap((y) => (alliancesConflict(x, y) ? [[x, y] as const] : [])),
)

const ORIGIN: Record<PollOrigin, string> = {
  '2027etmoi': 'Notice officielle (2027etmoi)',
  mieuxvoter: 'Notice officielle (Mieux Voter)',
  manuel: 'Saisie manuelle',
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

const th = 'px-3 py-2 text-left font-medium text-ink-3'
const td = 'px-3 py-1.5 align-top'

export function Methodology({ result }: { result: SimulationResult }) {
  const cutoff = new Date(`${polls.asOf}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - polls.windowDays)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const sr = result.secondRound
  const [a, b] = [result.entrants[0]!, result.entrants[1]!]
  const settings = useSettings()
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
          publiques et listées avec leur lien.
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
            <p>
              Base au <strong>{date(polls.asOf)}</strong> : pour chaque institut, on retient son{' '}
              <strong>dernier sondage</strong> dont le terrain s’achève dans les {polls.windowDays} jours
              précédents (depuis le {date(cutoffIso)}).
            </p>
            <p>
              Un sondage teste plusieurs listes de candidats (hypothèses). Pour l’hypothèse «{' '}
              {result.hypothesisSet.label} », on garde celles qui contiennent{' '}
              {result.hypothesisSet.require.map(anyName).join(', ')} et aucun de ces noms :{' '}
              {result.hypothesisSet.exclude.map(anyName).join(', ')}. Les petits candidats non simulés
              (Dominique de Villepin, Natacha Polony…) sont retirés et l’hypothèse est ramenée à 100 %.
            </p>
            {HYPOTHESIS_ALLIANCES.map((al) => (
              <p key={al.id}>
                {result.hypothesisAllianceId === al.id
                  ? `Cette hypothèse est retenue parce que l’alliance « ${al.label} » est activée (étape 4) ; sans elle, la base est l’hypothèse « ${DEFAULT_SET.label} ».`
                  : `L’hypothèse « ${DEFAULT_SET.label} » est la base par défaut ; l’alliance « ${al.label} » (étape 4) la remplace par l’hypothèse « ${al.set.label} ».`}
              </p>
            ))}
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

        <Step id="corrections" n={3} title="Correction des écarts constatés en 2022">
          <div className="prose-method">
            <p>
              En 2022, les derniers sondages avant le 1er tour ont sous-estimé certains candidats et en ont
              surestimé d’autres. On mesure cet écart par un ratio, puis on l’applique au candidat de 2027 de
              la même famille politique.
            </p>
            <code className="formula">
              ratio = résultat officiel 2022 ÷ moyenne des derniers sondages 2022
            </code>
            <code className="formula">
              correction (points) = moyenne 2027 (ou sondages projetés, étape 2) × (ratio − 1) × intensité de
              la correction
            </code>
            <p>
              Moyenne 2022 : dernier sondage de chaque institut dont le terrain s’achève dans les{' '}
              {reference2022.windowDays} jours précédant le scrutin du {date(reference2022.electionDate)} (
              {reference2022Stats.pollsUsed.length} instituts :{' '}
              {reference2022Stats.pollsUsed.map((p) => p.institute).join(', ')}). Résultats : voix officielles
              divisées par les {integer(reference2022.expressed)} suffrages exprimés.
            </p>
            <p>
              C’est strictement le scénario de 2022 : appliquée aux derniers sondages de 2022, cette
              correction redonne exactement le résultat officiel du 1er tour (un test automatique le vérifie).
              À 100 % d’intensité, chaque candidat de 2027 reçoit donc l’écart relatif réel de sa référence de
              2022.
            </p>
            <p>
              Après correction, les scores sont ramenés à 100 %.{' '}
              {settings.correctionsEnabled
                ? `Intensité actuelle de la correction : ${pct(settings.correctionIntensity * 100, 0)}${result.firstRound.some((r) => r.isOverride) ? ', certaines corrections sont saisies à la main' : ''}.`
                : 'Les corrections sont désactivées dans le scénario en cours.'}
            </p>
          </div>
          <Table caption="Écarts de 2022">
            <thead>
              <tr className="border-b border-rule">
                <th className={th}>Candidat 2022</th>
                <th className={`${th} text-right`}>Derniers sondages</th>
                <th className={`${th} text-right`}>Résultat</th>
                <th className={`${th} text-right`}>Ratio</th>
                <th className={th}>Référence pour 2027</th>
              </tr>
            </thead>
            <tbody>
              {reference2022.candidates.map((c) => {
                const users = usersOf(c.id)
                return (
                  <tr key={c.id} className="border-b border-rule/60">
                    <td className={td}>{c.name}</td>
                    <td className={`${td} num text-right`}>
                      {pct(reference2022Stats.pollAverage[c.id] ?? 0, 2)}
                    </td>
                    <td className={`${td} num text-right`}>{pct(reference2022Stats.result[c.id] ?? 0, 2)}</td>
                    <td className={`${td} num text-right font-medium`}>
                      {ratio(reference2022Stats.ratio[c.id] ?? 1)}
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
              Pour une référence pondérée, le ratio est la moyenne des ratios de chaque référence, pondérée
              par son poids.
            </li>
            <li>Les autres candidats sont comparés à eux-mêmes en 2022.</li>
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
                <th className={`${th} text-right`}>Correction</th>
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
                const corr = reference2022Stats.ratio[ref.id]
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
                <th className={`${th} text-right`}>Ratio</th>
                <th className={`${th} text-right`}>Correction</th>
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
                  <td className={`${td} num text-right`}>{r.ratio2022 ? ratio(r.ratio2022) : '—'}</td>
                  <td className={`${td} num text-right`}>
                    {pts(r.appliedCorrection, 2)}
                    {r.isOverride && <span className="ml-1 text-xs text-ballpoint">manuelle</span>}
                  </td>
                  <td className={`${td} num text-right font-medium`}>{pct(r.corrected, 2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-sm text-ink-3">
            Sources :{' '}
            <a href={reference2022.resultsSource.url} className="link" target="_blank" rel="noreferrer">
              {reference2022.resultsSource.label}
            </a>
            ,{' '}
            <a href={reference2022.pollsSource.url} className="link" target="_blank" rel="noreferrer">
              {reference2022.pollsSource.label}
            </a>{' '}
            (liens vers chaque sondage dans le fichier <code>reference-2022.json</code>).
          </p>
        </Step>

        <Step id="alliances" n={4} title="Alliances">
          <div className="prose-method">
            <p>
              Quand une alliance est activée, le candidat rallié se retire. Ses électeurs se répartissent
              comme lors des <strong>désistements des législatives 2024</strong> : on lit, dans la grille des
              reports (étape 6), la ligne de son électorat pour le type de duel du leader. Une part suit le
              leader, une part vote pour le candidat RN, le reste s’abstient ; les scores sont ensuite ramenés
              à 100 %. Une part modifiée dans les réglages garde, pour le reste, la répartition RN /
              abstention de 2024.
            </p>
            <p>
              Alliances proposées : {polls.alliances.map((al) => al.label).join(' ; ')}. Un candidat ne rallie
              qu’une alliance, et un candidat rallié ne peut pas en mener une autre. Plusieurs alliances
              autour du même leader se cumulent. Paires incompatibles :{' '}
              {INCOMPATIBLE.map(([x, y]) => `« ${x.label} » et « ${y.label} »`).join(' ; ')}.
            </p>
            {HYPOTHESIS_ALLIANCES.map((al) => {
              const rallied = al.rallied.map((id) => cand(id).name).join(', ')
              return (
                <p key={al.id}>
                  <strong>« {al.label} » fait exception.</strong> Les sondages testent directement un 1er tour
                  sans {rallied} : l’activer remplace la base du 1er tour par l’hypothèse « {al.set.label} »
                  (étape 1) au lieu d’appliquer des taux de report. Ce sont donc les sondés eux-mêmes qui
                  répartissent les électeurs de {rallied}. Seul le rallié est engagé : {cand(al.leader!).name}{' '}
                  peut encore mener ou rallier une autre alliance.{' '}
                  {result.hypothesisAllianceId === al.id
                    ? 'Cette alliance est activée dans le scénario en cours.'
                    : 'Elle n’est pas activée dans le scénario en cours.'}
                </p>
              )
            })}
          </div>
          <AllianceRates result={result} />
          <div className="prose-method">
            {result.allianceLeaks.length > 0 && (
              <p>
                Électeurs ralliés qui votent RN :{' '}
                {result.allianceLeaks
                  .map((l) => `${pct(l.points)} venus de ${cand(l.from).shortName}`)
                  .join(', ')}
                , ajoutés au score de {cand(result.allianceLeaks[0]!.to).shortName}.
              </p>
            )}
            {result.entrants.some((e) => e.allianceIds.length > 0) ? (
              result.entrants
                .filter((e) => e.allianceIds.length > 0)
                .map((e) => (
                  <p key={e.id}>
                    <strong>{entrantLabel(e)}</strong> : {pct(e.score)}, soit{' '}
                    {e.members
                      .map(
                        (m) =>
                          `${cand(m.candidateId).shortName} ${pct(m.contribution)} (poids ${num(m.weight, 2)})`,
                      )
                      .join(' et ')}
                    . Ces poids servent à mélanger les profils de reports au 2nd tour.
                  </p>
                ))
            ) : (
              !result.hypothesisAllianceId && <p>Aucune alliance n’est activée dans le scénario en cours.</p>
            )}
          </div>
        </Step>

        <Step id="qualification" n={5} title="Qualification">
          <div className="prose-method">
            <p>
              Les deux candidats en tête du 1er tour simulé sont qualifiés :{' '}
              <strong>{entrantLabel(a)}</strong> ({pct(a.score)}) et <strong>{entrantLabel(b)}</strong> (
              {pct(b.score)})
              {result.entrants[2] && (
                <>
                  , devant {entrantLabel(result.entrants[2])} ({pct(result.entrants[2].score)})
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
              (Philippe, Attal), un candidat LR face au RN (Retailleau). Pour un candidat d’alliance, on fait
              la moyenne des profils de ses membres, pondérée par leur poids (étape 4).
            </p>
            <code className="formula">
              voix du finaliste = Σ (électorat de chaque candidat × taux de report vers ce finaliste)
            </code>
            <code className="formula">
              résultat = voix A ÷ (voix A + voix B), en % des suffrages exprimés
            </code>
            <p>
              Le calcul part de l’électorat de chaque candidat au 1er tour simulé{' '}
              <strong>avant alliances</strong>. Les électeurs d’un candidat éliminé se reportent selon leur
              bloc, qu’il ait rallié un autre éliminé ou non : une alliance entre candidats éliminés ne change
              donc pas le 2nd tour, seulement la qualification. Pour les électeurs d’un candidat rallié à un
              finaliste, on reprend le taux d’alliance (étape 4) : la part qui a suivi le leader dès le 1er
              tour lui reste fidèle, la part qui a voté RN vote RN, et ceux qui se sont abstenus au 1er tour
              se reportent comme les électeurs de leur bloc. Une alliance avec un finaliste renforce donc son
              report : aux taux de 2024, 72 % + 25 % × 72 % ≈ 90 % des électeurs ralliés de gauche votent pour
              lui, contre 72 % sans alliance.
            </p>
            <p>
              <strong>Hors alliance, seuls des taux mesurés en 2024 sont utilisés par défaut.</strong>{' '}
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
              Les électorats sont regroupés en blocs : gauche (Arthaud, Mélenchon, Roussel, Tondelier,
              Glucksmann), centre (Philippe, Attal), droite (Retailleau), extrême droite (Le Pen, Zemmour,
              Dupont-Aignan). Les chiffres des législatives portent sur des électorats de partis (NFP,
              Ensemble, LR) et sont appliqués aux candidats de ces familles ; Zemmour et Dupont-Aignan sont
              rattachés au camp RN, comme l’électorat « RN et alliés » de 2024.
            </p>
            <p>
              <strong>Modèle de repli.</strong> {transfers.fallback.description} Abstention par bloc :{' '}
              {BLOCS.map(
                (bloc) => `${BLOC_LABELS[bloc].toLowerCase()} ${pct(transfers.fallback.abstention[bloc], 0)}`,
              ).join(', ')}
              .
            </p>
          </div>
        </Step>

        <Step id="abstention" n={7} title="Blancs, nuls et abstention au 2nd tour">
          <div className="prose-method">
            <p>
              Le niveau global des votes blancs, nuls et de l’abstention au 2nd tour reprend celui, réel, du
              2nd tour de 2022. Dans le modèle, il se mesure en part des électeurs exprimés du 1er tour qui ne
              s’expriment pas au 2nd :
            </p>
            <code className="formula">
              cible = 1 − exprimés du 2nd tour 2022 ÷ exprimés du 1er tour 2022 = 1 −{' '}
              {integer(reference2022.secondRound.expressed)} ÷ {integer(reference2022.expressed)} ={' '}
              {pct(secondRoundDropout2022(reference2022), 2)}
            </code>
            <p>
              Le taux d’abstention de chaque électorat, issu des reports de 2024, est multiplié par un même
              coefficient pour atteindre cette cible ; les votes exprimés gardent la répartition des reports
              de 2024. Seules les différences d’abstention entre électorats influent sur le résultat en % des
              exprimés.
            </p>
            <p>
              Scénario en cours :{' '}
              {sr.abstention.target === null
                ? `calage désactivé, les taux bruts de 2024 donnent ${pct(sr.abstention.uncalibrated)} de blancs, nuls et abstentions.`
                : `taux bruts de 2024 : ${pct(sr.abstention.uncalibrated)}, cible ${pct(sr.abstention.target, 2)}, coefficient ×${num(sr.abstention.factor, 2)}.`}{' '}
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
          <Table caption="2nd tour de 2022 (chiffres officiels)">
            <tbody>
              {[
                ['Électeurs inscrits', reference2022.secondRound.registered],
                ['Votants', reference2022.secondRound.voters],
                ['Bulletins blancs', reference2022.secondRound.blank],
                ['Bulletins nuls', reference2022.secondRound.invalid],
                ['Suffrages exprimés', reference2022.secondRound.expressed],
                ['Pour mémoire : exprimés du 1er tour', reference2022.expressed],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-rule/60">
                  <td className={td}>{label}</td>
                  <td className={`${td} num text-right`}>{integer(value as number)}</td>
                </tr>
              ))}
              <tr>
                <td className={td}>Abstention (en % des inscrits)</td>
                <td className={`${td} num text-right`}>
                  {pct(
                    100 * (1 - reference2022.secondRound.voters / reference2022.secondRound.registered),
                    2,
                  )}
                </td>
              </tr>
            </tbody>
          </Table>
          <p className="text-sm text-ink-3">
            Source :{' '}
            <a href={reference2022.secondRound.source.url} className="link" target="_blank" rel="noreferrer">
              {reference2022.secondRound.source.label}
            </a>
            .
          </p>
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
              du résultat. Ces sondages ne portent que sur les « votants décidés » : à six mois du scrutin,
              plus de 40 % des personnes interrogées n’expriment aucun choix entre les deux candidats, alors
              qu’en 2022 seuls {pct(secondRoundDropout2022(reference2022), 2)} des électeurs exprimés au 1er
              tour ne se sont pas exprimés au 2nd.
            </li>
            <li>
              Chaque sondage a une marge d’erreur et décrit l’opinion au moment de son terrain, à six mois du
              scrutin. Les corrections de 2022 supposent que les biais se répètent, ce qui n’est pas garanti.
            </li>
            <li>
              Par défaut, seule la fidélité des électeurs des finalistes ({pct(sr.fidelity * 100, 0)}) ne
              vient d’aucune source, ainsi que le modèle de repli, utilisé seulement pour un duel sans le RN.
              Les taux repris d’un autre duel et le rattachement de Zemmour et Dupont-Aignan au camp RN sont
              des choix de modélisation, signalés dans le tableau de l’étape 6.
            </li>
            <li>
              Le calage de l’abstention suppose une participation au 1er tour comparable à celle de 2022.
            </li>
            <li>
              Les chiffres de certains sondages proviennent de Wikipedia et n’ont pas pu être revérifiés dans
              la publication de l’institut (indiqué dans le tableau de l’étape 1).
            </li>
          </ul>
        </section>
      </div>
    </article>
  )
}
