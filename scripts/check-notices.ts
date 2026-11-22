// Outil local d'aide à la saisie (hors CI) : liste les duels de 2nd tour sans `noIntention`,
// associe directement l'URL de la notice Commission des sondages correspondante et vérifie la fraîcheur
// de `src/data/transfers-2027-declared.json`.
// Usage : bun run check-notices [--offline]
import { readFile } from 'node:fs/promises'
import { daysBetween } from '../src/domain/pollAverage'
import type { DeclaredTransfersData, PollsData } from '../src/domain/types'
import { FEEDS, canonicalInstitute } from '../src/sync/feeds'
import { addSecondRoundNotices, parseNoticeIndex } from '../src/sync/links'

const USER_AGENT = 'simulateur2027-check-notices (+https://github.com/bpresles/simulateur2027)'
const offline = process.argv.includes('--offline')
const today = new Date().toISOString().slice(0, 10)

const polls = JSON.parse(
  await readFile(new URL('../src/data/polls-2027.json', import.meta.url), 'utf8'),
) as PollsData
const declared = JSON.parse(
  await readFile(new URL('../src/data/transfers-2027-declared.json', import.meta.url), 'utf8'),
) as DeclaredTransfersData

let notices: ReturnType<typeof parseNoticeIndex> = []
if (!offline) {
  try {
    const res = await fetch(FEEDS.notices.url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) notices = parseNoticeIndex(await res.text())
  } catch (e) {
    console.warn(`Commission des sondages injoignable (${e instanceof Error ? e.message : String(e)}), mode local.`)
  }
}

const enriched = addSecondRoundNotices(polls.secondRoundPolls, polls.polls, notices)
const missing = enriched.filter((d) => !d.noIntention)

console.log(`=== Contrôle des notices de 2nd tour (${today}) ===`)
console.log(`Duels suivis : ${enriched.length} · avec noIntention : ${enriched.length - missing.length} · manquants : ${missing.length}\n`)

if (missing.length === 0) {
  console.log('Tous les duels de 2nd tour disposent d’une part « sans intention de vote » renseignée.')
} else {
  const byWave = new Map<string, typeof missing>()
  for (const d of missing) {
    const key = `${canonicalInstitute(d.institute)} | ${d.fieldwork.end} | ${d.url}`
    byWave.set(key, [...(byWave.get(key) ?? []), d])
  }
  for (const [key, duels] of byWave.entries()) {
    const [institute, end, url] = key.split(' | ') as [string, string, string]
    const pairs = duels.map((d) => Object.keys(d.scores).join('–')).join(', ')
    const isNotice = /commission-des-sondages\.fr/.test(url)
    console.log(`• ${institute} (${end}) — ${duels.length} duel${duels.length > 1 ? 's' : ''} : ${pairs}`)
    console.log(`  ${isNotice ? 'Notice officielle' : 'Source'} : ${url}`)
  }
  console.log('\nModèle JSON à ajouter sur chaque duel dans src/data/polls-2027.json :')
  console.log(
    JSON.stringify(
      {
        noIntention: {
          share: 0,
          base: 'inscrits',
          undecided: 0,
          source: { label: 'Notice (Commission des sondages)', url: 'https://www.commission-des-sondages.fr/...' },
        },
      },
      null,
      2,
    ),
  )
}

console.log('\n=== Fraîcheur des reports déclarés 2027 ===')
if (!declared.updatedAt) {
  console.log('Aucune date `updatedAt` dans src/data/transfers-2027-declared.json.')
} else {
  const age = Math.round(daysBetween(declared.updatedAt, today))
  console.log(
    `Dernière mise à jour : ${declared.updatedAt} (il y a ${age} jours)${age > 45 ? ' — > 45 j : vérifier si de nouvelles matrices ont été publiées.' : ' — à jour.'}`,
  )
}
