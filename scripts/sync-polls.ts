// Synchronise src/data/polls-2027.json avec les flux de sondages (bun run sync-polls).
// N'écrit le fichier que si les données changent ; échoue si les données obtenues sont invalides.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { parseData } from '../src/data/schema'
import { computeReference2022 } from '../src/domain/corrections'
import type { PollsData } from '../src/domain/types'
import { FEEDS, etmoiSchema, mieuxVoterSchema } from '../src/sync/feeds'
import { syncPolls } from '../src/sync/sync'
import type { SyncFeeds } from '../src/sync/sync'
import reference2022 from '../src/data/reference-2022.json'
import transfers from '../src/data/transfers-legislatives-2024.json'

const POLLS_FILE = new URL('../src/data/polls-2027.json', import.meta.url)

async function fetchFeed<T>(name: string, url: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } }) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'simulateur2027-sync' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = schema.safeParse(await res.json())
    if (!parsed.success) throw new Error(`format inattendu : ${String(parsed.error).slice(0, 300)}`)
    console.log(`✓ ${name} récupéré`)
    return parsed.data
  } catch (error) {
    console.warn(`⚠ ${name} ignoré (${url}) : ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const today = process.env.SYNC_DATE ?? new Date().toISOString().slice(0, 10)
const feeds: SyncFeeds = {
  etmoi: await fetchFeed('2027etmoi', FEEDS.etmoi.url, etmoiSchema),
  mieuxvoter: await fetchFeed('Mieux Voter', FEEDS.mieuxvoter.url, mieuxVoterSchema),
}
if (!feeds.etmoi && !feeds.mieuxvoter) {
  console.error('Aucun flux disponible : données inchangées.')
  process.exit(1)
}

// Fichier brut (ordre des champs conservé à l'écriture) et version validée pour les calculs.
const current = JSON.parse(await readFile(POLLS_FILE, 'utf8')) as PollsData
const validated = parseData({ polls: current, reference2022, transfers })
const stats = computeReference2022(validated.reference2022)
const { data, report } = syncPolls(current, feeds, today, validated.reference2022, stats)

// Les données obtenues doivent passer la même validation que celle de l'application.
parseData({ polls: data, reference2022, transfers })

const lines = [
  report.changed ? `Données mises à jour au ${report.asOf}.` : 'Aucun changement dans les données.',
  `Sondages ajoutés : ${report.added.length ? report.added.join(', ') : 'aucun'}`,
  `Sondages mis à jour : ${report.replaced.length ? report.replaced.join(', ') : 'aucun'}`,
  `Sondages de 2nd tour ajoutés : ${report.secondRoundAdded}`,
  `Nouveaux candidats non simulés : ${report.newCandidates.length ? report.newCandidates.join(', ') : 'aucun'}`,
  `Sélection de la fenêtre modifiée : ${report.selectionChanged ? 'oui' : 'non'}`,
]
console.log(lines.join('\n'))

if (report.changed) await writeFile(POLLS_FILE, `${JSON.stringify(data, null, 2)}\n`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${report.changed}\n`)
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Synchronisation des sondages\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`)
}
