// Synchronise src/data/polls-2027.json avec la page Wikipedia de la liste des sondages (bun run sync-polls),
// en y ajoutant les synthèses des instituts et les notices de la Commission des sondages.
// N'écrit le fichier que si les données changent ; échoue si la page est injoignable, si son format n'est
// plus reconnu ou si les données obtenues sont invalides. Un site d'institut ou de la Commission injoignable
// n'est qu'un avertissement : les liens déjà trouvés sont gardés.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { parseData } from '../src/data/schema'
import type { PollsData } from '../src/domain/types'
import { FEEDS, SYNTHESES } from '../src/sync/feeds'
import { parseFeed, parseNoticeIndex } from '../src/sync/links'
import { syncPolls } from '../src/sync/sync'
import reference2022 from '../src/data/reference-2022.json'
import transfers from '../src/data/transfers-legislatives-2024.json'

const POLLS_FILE = new URL('../src/data/polls-2027.json', import.meta.url)

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
const optional = async (label: string, url: string): Promise<string> => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } catch (e) {
    warnings.push(`${label} injoignable (${e instanceof Error ? e.message : String(e)})`)
    return ''
  }
}
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
parseData({ polls: current, reference2022, transfers })
const result = syncPolls(current, wikitext, today, links)
if (!result) fail('Aucun sondage de 1er tour reconnu sur la page Wikipedia (format modifié ?).')
const { data, report } = result!

// Les données obtenues doivent passer la même validation que celle de l'application.
parseData({ polls: data, reference2022, transfers })

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
  `Nouveaux candidats non simulés : ${list(report.newCandidates, 'aucun')}`,
  `Lignes écartées : ${report.skipped.length ? report.skipped.join(' ; ') : 'aucune'}`,
  ...(warnings.length ? [`Avertissements : ${warnings.join(' ; ')} — liens déjà trouvés conservés.`] : []),
]
console.log(lines.join('\n'))

if (report.changed) await writeFile(POLLS_FILE, `${JSON.stringify(data, null, 2)}\n`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${report.changed}\n`)
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Synchronisation des sondages\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`,
  )
}
