// Synchronise src/data/polls-2027.json avec la page Wikipedia de la liste des sondages (bun run sync-polls),
// en y ajoutant les synthèses des instituts et les notices de la Commission des sondages.
// N'écrit le fichier que si les données changent ; échoue si la page est injoignable, si son format n'est
// plus reconnu ou si les données obtenues sont invalides. Un site d'institut ou de la Commission injoignable
// n'est qu'un avertissement : les liens déjà trouvés sont gardés.
// Met aussi à jour src/data/turnout-certainty.json : les mesures de participation (« certains d'aller voter »)
// sont lues dans les notices Ifop (PDF) des sondages et de la liste de la Commission. Une mesure ancienne ou une
// notice illisible n'est qu'un avertissement du rapport : cela ne doit jamais bloquer la synchronisation.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { parseData } from '../src/data/schema'
import type { PollsData } from '../src/domain/types'
import { extractText, getDocumentProxy } from 'unpdf'
import { daysBetween } from '../src/domain/pollAverage'
import type { TurnoutCertaintyData, TurnoutMeasure } from '../src/domain/types'
import { FEEDS, SYNTHESES, canonicalInstitute, knownInstitute } from '../src/sync/feeds'
import { isVotingIntentionNotice, parseFeed, parseNoticeIndex } from '../src/sync/links'
import { syncPolls } from '../src/sync/sync'
import { mergeTurnoutMeasures, parseTurnoutNotice, serializeTurnout } from '../src/sync/turnout'
import reference2017 from '../src/data/reference-2017.json'
import reference2022 from '../src/data/reference-2022.json'
import transfers from '../src/data/transfers-legislatives-2024.json'
import turnoutCertainty from '../src/data/turnout-certainty.json'
import secondRoundDropout from '../src/data/second-round-dropout.json'
import secondRoundPollBias from '../src/data/second-round-poll-bias.json'

const POLLS_FILE = new URL('../src/data/polls-2027.json', import.meta.url)
const TURNOUT_FILE = new URL('../src/data/turnout-certainty.json', import.meta.url)

/** Les notices de la liste de la Commission ne sont lues que si elles ont été publiées dans ces derniers jours. */
const TURNOUT_NOTICE_DAYS = 45
/** Au-delà de cet écart (jours) entre la dernière mesure et la base, le rapport avertit. */
const TURNOUT_WARNING_DAYS = 30

// Wikipedia demande un user-agent qui permette de contacter l'auteur.
const USER_AGENT = 'simulateur2027-sync (+https://github.com/bpresles/simulateur2027)'

const fail = (message: string): never => {
  console.error(`${message} Données inchangées.`)
  process.exit(1)
}

const today = process.env.SYNC_DATE ?? new Date().toISOString().slice(0, 10)
const res = await fetch(FEEDS.wikipedia.url, { headers: { 'user-agent': USER_AGENT } }).catch((e: unknown) =>
  fail(`Wikipedia injoignable (${e instanceof Error ? e.message : String(e)}).`),
)
if (!res.ok) fail(`Wikipedia : HTTP ${res.status}.`)
const wikitext = await res.text()

// Notices et flux des instituts : en parallèle, chacun facultatif.
const warnings: string[] = []
/** Réponse d'une ressource facultative : null (avec un avertissement) si elle est injoignable. */
const optionalResponse = async (label: string, url: string): Promise<Response | null> => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r
  } catch (e) {
    warnings.push(`${label} injoignable (${e instanceof Error ? e.message : String(e)})`)
    return null
  }
}
const optional = async (label: string, url: string): Promise<string> =>
  (await (await optionalResponse(label, url))?.text()) ?? ''
const [noticeIndex, ...feeds] = await Promise.all([
  optional('Liste des notices de la Commission des sondages', FEEDS.notices.url),
  ...Object.entries(SYNTHESES).map(([institute, { url }]) => optional(`Flux ${institute}`, url)),
])
const links = {
  notices: parseNoticeIndex(noticeIndex!),
  publications: Object.fromEntries(
    Object.keys(SYNTHESES).map((institute, i) => [institute, parseFeed(feeds[i]!)]),
  ),
}

// Fichier brut : l'ordre des champs est conservé à l'écriture.
const current = JSON.parse(await readFile(POLLS_FILE, 'utf8')) as PollsData
parseData({ polls: current, reference2022, reference2017, transfers, turnoutCertainty, secondRoundDropout, secondRoundPollBias })
const result = syncPolls(current, wikitext, today, links)
if (!result) fail('Aucun sondage de 1er tour reconnu sur la page Wikipedia (format modifié ?).')
const { data, report } = result!

// Les données obtenues doivent passer la même validation que celle de l'application.
parseData({ polls: data, reference2022, reference2017, transfers, turnoutCertainty, secondRoundDropout, secondRoundPollBias })

const list = (items: string[], none: string) => (items.length ? items.join(', ') : none)
const lines = [
  report.changed ? `Données mises à jour au ${report.asOf}.` : 'Aucun changement dans les données.',
  `Période retenue : ${report.period}`,
  `Sondages ajoutés : ${list(report.added, 'aucun')}`,
  `Sondages mis à jour : ${list(report.replaced, 'aucun')}`,
  `Sondages retirés : ${list(report.removed, 'aucun')}`,
  `Duels de 2nd tour : ${report.secondRound}`,
  `Duels sans part sans intention de vote (à saisir d'après la notice) : ${list(report.missingNoIntention, 'aucun')}`,
  `Liens ajoutés : ${list(report.newLinks, 'aucun')}`,
  `Candidats ajoutés aux simulés (bloc, couleurs et reports par défaut, à compléter) : ${list(report.promoted, 'aucun')}`,
  `Nouveaux candidats non simulés : ${list(report.newCandidates, 'aucun')}`,
  `Lignes écartées : ${report.skipped.length ? report.skipped.join(' ; ') : 'aucune'}`,
  ...(warnings.length ? [`Avertissements : ${warnings.join(' ; ')} — liens déjà trouvés conservés.`] : []),
]

// ——— Participation : mesures des notices Ifop ———

// Fichier brut : l'ordre des champs est conservé à l'écriture.
const turnoutCurrent = JSON.parse(await readFile(TURNOUT_FILE, 'utf8')) as TurnoutCertaintyData
const knownUrls = new Set(turnoutCurrent.measures.map((m) => m.source.url))
const candidates = new Map<string, { url: string; title?: string }>()
for (const poll of data.polls.filter((p) => canonicalInstitute(p.institute) === 'Ifop-Fiducial')) {
  for (const src of poll.sources) if (src.kind === 'notice') candidates.set(src.url, { url: src.url })
}
for (const n of links.notices) {
  if (
    knownInstitute(n.title) === 'Ifop-Fiducial' &&
    isVotingIntentionNotice(n.title) &&
    daysBetween(n.date, today) <= TURNOUT_NOTICE_DAYS
  )
    candidates.set(n.url, { url: n.url, title: n.title })
}
const found: TurnoutMeasure[] = []
const unrecognized: string[] = []
for (const c of [...candidates.values()].filter((c) => !knownUrls.has(c.url))) {
  const res = await optionalResponse(`Notice Ifop ${c.title ?? c.url}`, c.url)
  if (!res) continue
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()))
    const { text } = await extractText(pdf, { mergePages: true })
    // L'adresse finale (après redirection de la liste de la Commission) est celle du PDF.
    const measure = parseTurnoutNotice(text, { url: res.url || c.url, title: c.title })
    if (measure) found.push(measure)
    else unrecognized.push(c.title ?? c.url)
  } catch (e) {
    warnings.push(`Notice Ifop ${c.title ?? c.url} illisible (${e instanceof Error ? e.message : String(e)})`)
  }
}
const merged = mergeTurnoutMeasures(turnoutCurrent.measures, found)
const turnout: TurnoutCertaintyData = { ...turnoutCurrent, measures: merged.measures }
parseData({ polls: data, reference2022, reference2017, transfers, turnoutCertainty: turnout, secondRoundDropout, secondRoundPollBias })
const turnoutChanged = merged.added.length > 0

const latest = turnout.measures
  .filter((m) => m.cycle === 2027)
  .sort((a, b) => b.fieldwork.end.localeCompare(a.fieldwork.end))[0]
lines.push(
  `Mesures de participation ajoutées : ${list(merged.added.map((m) => `${m.id} (${m.envisage} / ${m.certain})`), 'aucune')}`,
  `Notices Ifop sans mesure reconnue : ${list(unrecognized, 'aucune')}${unrecognized.length ? ' (format modifié ?)' : ''}`,
)
if (latest) {
  const gap = Math.abs(daysBetween(latest.fieldwork.end, data.asOf))
  const fr = latest.fieldwork.end.split('-').reverse().join('/')
  lines.push(
    `Dernière mesure de participation : J−${daysBetween(latest.fieldwork.end, data.electionDate)} (fin de terrain ${fr}), à ${gap} jours de la base`,
  )
  if (gap > TURNOUT_WARNING_DAYS)
    lines.push(
      `⚠ La dernière mesure de participation précède la base de plus de ${TURNOUT_WARNING_DAYS} jours : le site signalera un bilan de participation peu fiable.`,
    )
}
console.log(lines.join('\n'))

if (report.changed) await writeFile(POLLS_FILE, `${JSON.stringify(data, null, 2)}\n`)
if (turnoutChanged) await writeFile(TURNOUT_FILE, serializeTurnout(turnout))
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${report.changed || turnoutChanged}\n`)
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Synchronisation des sondages\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`,
  )
}
