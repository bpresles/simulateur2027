// Synchronise src/data/polls-2027.json et src/data/polls-history-2027.json avec la page Wikipedia de la liste
// des sondages (bun run sync-polls), en y ajoutant les synthèses des instituts et les notices de la Commission
// des sondages. N'écrit les fichiers que si les données changent ; échoue si la page est injoignable, si son
// format n'est plus reconnu ou si les données obtenues sont invalides.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { parseData } from '../src/data/schema'
import { daysBetween } from '../src/domain/pollAverage'
import type { PollHistoryData, PollsData } from '../src/domain/types'
import { FEEDS, SYNTHESES } from '../src/sync/feeds'
import { parseFeed, parseNoticeIndex } from '../src/sync/links'
import { mergePollHistory, syncPolls } from '../src/sync/sync'
import reference2017 from '../src/data/reference-2017.json'
import reference2022 from '../src/data/reference-2022.json'
import transfers from '../src/data/transfers-legislatives-2024.json'
import declaredTransfers from '../src/data/transfers-2027-declared.json'
import secondRoundDropout from '../src/data/second-round-dropout.json'
import secondRoundPollBias from '../src/data/second-round-poll-bias.json'

const POLLS_FILE = new URL('../src/data/polls-2027.json', import.meta.url)
const HISTORY_FILE = new URL('../src/data/polls-history-2027.json', import.meta.url)
const DECLARED_STALE_DAYS = 45

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
const currentHistory = JSON.parse(await readFile(HISTORY_FILE, 'utf8')) as PollHistoryData
parseData({
  polls: current,
  pollHistory: currentHistory,
  reference2022,
  reference2017,
  transfers,
  declaredTransfers,
  secondRoundDropout,
  secondRoundPollBias,
})
const result = syncPolls(current, wikitext, today, links)
if (!result) fail('Aucun sondage de 1er tour reconnu sur la page Wikipedia (format modifié ?).')
const { data, report } = result!
const { data: historyData, changed: historyChanged } = mergePollHistory(currentHistory, report.history)

// Les données obtenues doivent passer la même validation que celle de l'application.
parseData({
  polls: data,
  pollHistory: historyData,
  reference2022,
  reference2017,
  transfers,
  declaredTransfers,
  secondRoundDropout,
  secondRoundPollBias,
})

// Rappel non bloquant si les matrices de reports déclarés 2027 datent de plus de 45 jours.
const declaredUpdatedAt = (declaredTransfers as { updatedAt?: string }).updatedAt
if (declaredUpdatedAt && daysBetween(declaredUpdatedAt, today) > DECLARED_STALE_DAYS) {
  const age = Math.round(daysBetween(declaredUpdatedAt, today))
  warnings.push(
    `Reports déclarés 2027 (src/data/transfers-2027-declared.json) mis à jour il y a ${age} j (${declaredUpdatedAt}) : vérifier si de nouvelles matrices Harris/Ipsos/Ifop ont été publiées`,
  )
}

const anyChanged = report.changed || historyChanged
const hasAlerts = report.structuralAlerts.length > 0
const list = (items: string[], none: string) => (items.length ? items.join(', ') : none)
const missingMd = report.missingNoIntentionNotices.length
  ? report.missingNoIntentionNotices.map((m) => `[${m.label}](${m.url})`).join(', ')
  : 'aucun'
const lines = [
  anyChanged ? `Données mises à jour au ${report.asOf}.` : 'Aucun changement dans les données.',
  `Période retenue : ${report.period}${report.officialList ? ' (liste officielle)' : ''}`,
  `Historique des vagues (2025–2027) : ${historyData.polls.length} sondages`,
  `Sondages ajoutés : ${list(report.added, 'aucun')}`,
  `Sondages mis à jour : ${list(report.replaced, 'aucun')}`,
  `Sondages retirés : ${list(report.removed, 'aucun')}`,
  `Duels de 2nd tour : ${report.secondRound}`,
  `Duels sans part sans intention de vote (à saisir d'après la notice) : ${list(report.missingNoIntention, 'aucun')}`,
  `Liens ajoutés : ${list(report.newLinks, 'aucun')}`,
  `Candidats ajoutés aux simulés (≥ 3 instituts, bloc/couleurs/reports par défaut à compléter) : ${list(report.promoted, 'aucun')}`,
  `Nouveaux candidats non simulés : ${list(report.newCandidates, 'aucun')}`,
  `Alertes structurelles : ${report.structuralAlerts.length ? report.structuralAlerts.join(' ; ') : 'aucune'}`,
  `Lignes écartées : ${report.skipped.length ? report.skipped.join(' ; ') : 'aucune'}`,
  ...(warnings.length ? [`Avertissements : ${warnings.join(' ; ')}.`] : []),
]

console.log(lines.join('\n'))

if (report.changed) await writeFile(POLLS_FILE, `${JSON.stringify(data, null, 2)}\n`)
if (historyChanged) await writeFile(HISTORY_FILE, `${JSON.stringify(historyData, null, 2)}\n`)

if (hasAlerts && process.env.SYNC_ALERTS_FILE) {
  const alertBody = [
    `## Alertes structurelles détectées le ${today}`,
    '',
    'La synchronisation quotidienne des sondages a détecté un changement de structure de l’offre de candidatures nécessitant une vérification humaine (les sondages valides restent publiés normalement) :',
    '',
    ...report.structuralAlerts.map((a) => `- ${a}`),
    '',
    `Période active : **${report.period}** (${data.polls.length} sondages retenus).`,
  ].join('\n')
  await writeFile(process.env.SYNC_ALERTS_FILE, `${alertBody}\n`)
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${anyChanged}\nhas_alerts=${hasAlerts}\n`)
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const summaryLines = lines.map((l) =>
    l.startsWith('Duels sans part sans intention de vote')
      ? `Duels sans part sans intention de vote (notices) : ${missingMd}`
      : l,
  )
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Synchronisation des sondages\n\n${summaryLines.map((l) => `- ${l}`).join('\n')}\n`,
  )
}
