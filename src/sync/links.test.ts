import type { Poll } from '../domain/types'
import { frozenData } from '../test/frozenData'
import { WIKITEXT } from '../test/wikipediaFixture'
import {
  NOTICE_LABEL,
  SYNTHESIS_LABEL,
  findNotice,
  findSynthesis,
  isVotingIntentionNotice,
  parseFeed,
  parseNoticeIndex,
} from './links'
import type { LinkSources } from './links'
import { syncPolls } from './sync'

const ADD = 'https://www.commission-des-sondages.fr/notices/medias/fichiers/add'

const notice = (id: number, title: string) =>
  `<p class="download-line"><a href="/notices/medias/fichiers/add/${id}" class="pdf_download" target="_blank">${title}</a></p>`

// Extrait réduit de la liste des notices de la Commission des sondages.
const INDEX = `
<h2 class="notices-mois-titre" rel="pannel_0">Janvier 2027</h2>
<img src="/notices/img/theme/picto-fleche.png" class="notices-arrow"/><div id=pannel_0 class="notices-elements">
${notice(2400, '10400 Pres IV ELABE 30 décembre')}
</div>
<h2 class="notices-mois-titre" rel="pannel_1">Octobre 2026</h2>
<div id=pannel_1 class="notices-elements">
${notice(2342, '10326 Pres Tableau de bord des personnalites IFOP 20 octobre')}
${notice(2335, '10320 Pres Budget 2027 ODOXA 15 octobre')}
${notice(2331, '10315 Pres La fête de l&#039;entreprise IFOP 15 octobre')}
${notice(2329, '10313 Pres IV IFOP LCI 15 octobre')}
${notice(2325, '10310 Pres IV ODOXA 14 octobre')}
${notice(2318, '10299 Pres IV ODOXA 2 octobre')}
${notice(2090, '10102 Mun Colombes CLUSTER 17 Facebook février')}
</div>`

const item = (title: string, link: string, pubDate: string) =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${pubDate}</pubDate></item>`

const poll = (institute: string, end: string) => ({ institute, fieldwork: { start: end, end } }) as Poll

describe('liste des notices de la Commission des sondages', () => {
  const notices = parseNoticeIndex(INDEX)

  it('lit chaque notice avec son jour de publication, l’année venant du titre du mois', () => {
    expect(notices[0]).toEqual({
      title: '10400 Pres IV ELABE 30 décembre',
      url: `${ADD}/2400`,
      date: '2026-12-30',
    })
    expect(notices.find((n) => n.url === `${ADD}/2331`)).toMatchObject({
      title: "10315 Pres La fête de l'entreprise IFOP 15 octobre",
      date: '2026-10-15',
    })
    // Sans jour de publication : écartée.
    expect(notices.some((n) => n.url === `${ADD}/2090`)).toBe(false)
  })

  it('reconnaît les notices d’intentions de vote à la présidentielle', () => {
    expect(isVotingIntentionNotice('10324 Pres IV ELABE 17 octobre')).toBe(true)
    expect(isVotingIntentionNotice('10318 Pres Presitrack V3 OPINIONWAY 15 octobre')).toBe(true)
    expect(isVotingIntentionNotice('10326 Pres Tableau de bord des personnalites IFOP 20 octobre')).toBe(
      false,
    )
    expect(isVotingIntentionNotice('10101 Mun IV Marseille CLUSTER 17 Politico 26 février')).toBe(false)
  })

  it('associe la notice d’intentions de vote de l’institut publiée le plus tôt après le terrain', () => {
    expect(findNotice(poll('Odoxa', '2026-10-07'), notices)?.url).toBe(`${ADD}/2325`)
    expect(findNotice(poll('Ifop-Fiducial', '2026-10-14'), notices)?.url).toBe(`${ADD}/2329`)
    // Notice de l'institut pas encore publiée : le « Tableau de bord » n'est pas un sondage d'intentions.
    expect(findNotice(poll('Ifop-Fiducial', '2026-10-19'), notices)).toBeUndefined()
  })
})

describe('synthèses des instituts', () => {
  it('lit les publications d’un flux RSS', () => {
    const xml = `<rss><channel><title>Ifop</title>${item(
      'Baromètre de l&#8217;élection présidentielle &#8211; vague 7',
      'https://www.ifopgroup.com/article/barometre-vague-7',
      'Tue, 20 Oct 2026 08:00:00 +0000',
    )}</channel></rss>`
    expect(parseFeed(xml)).toEqual([
      {
        title: 'Baromètre de l’élection présidentielle – vague 7',
        url: 'https://www.ifopgroup.com/article/barometre-vague-7',
        date: '2026-10-20',
      },
    ])
  })

  it('retient la synthèse d’intentions de vote publiée le plus tôt après le terrain', () => {
    const items = [
      {
        title: 'Périnatalité : plaidoyer pour la campagne présidentielle 2027',
        url: 'a',
        date: '2026-10-20',
      },
      { title: 'Baromètre de l’élection présidentielle – vague 7', url: 'b', date: '2026-10-20' },
      { title: 'Baromètre de l’élection présidentielle – vague 6', url: 'c', date: '2026-10-02' },
    ]
    expect(findSynthesis(poll('Ifop-Fiducial', '2026-10-19'), items)?.url).toBe('b')
    // Publiée plus de 10 jours après le terrain : pas la synthèse de ce sondage.
    expect(findSynthesis(poll('Ifop-Fiducial', '2026-09-20'), items)).toBeUndefined()
    // Institut sans flux connu.
    expect(findSynthesis(poll('YouGov', '2026-10-19'), items)).toBeUndefined()
  })
})

describe('liens ajoutés par la synchronisation', () => {
  const links: LinkSources = {
    notices: parseNoticeIndex(INDEX),
    publications: {
      Elabe: [
        {
          title: 'Les Français et les mobilisations sociales',
          url: 'https://elabe.fr/mobilisations/',
          date: '2026-10-16',
        },
        {
          title: 'Les Français et l’élection présidentielle 2027',
          url: 'https://elabe.fr/presidentielle/',
          date: '2026-10-17',
        },
      ],
      Odoxa: [
        {
          title: 'Mélenchon passe devant Philippe au premier tour',
          url: 'https://www.odoxa.fr/sondage',
          date: '2026-10-14',
        },
      ],
    },
  }
  const { data, report } = syncPolls(frozenData.polls, WIKITEXT, '2026-10-20', links)!
  const sources = (id: string) => data.polls.find((p) => p.id === id)!.sources

  it('place la synthèse en premier et ajoute la notice quand la page n’en donne pas', () => {
    expect(sources('elabe-20261016')[0]).toEqual({
      label: SYNTHESIS_LABEL,
      url: 'https://elabe.fr/presidentielle/',
      kind: 'synthese',
    })
    expect(sources('ifop-20261014')[0]).toEqual({ label: NOTICE_LABEL, url: `${ADD}/2329`, kind: 'notice' })
    // Lien de la page déjà vers la synthèse : un seul lien, typé.
    expect(sources('odoxa-20261007').map((s) => s.kind ?? s.url)).toEqual([
      'synthese',
      'notice',
      'https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027',
    ])
    // Notices données par la page : typées, aucune autre ajoutée.
    expect(sources('opinionway-20261014').map((s) => s.kind)).toEqual(['notice', 'notice', undefined])
    expect(report.newLinks).toEqual([
      `elabe-20261016 (${SYNTHESIS_LABEL})`,
      `ifop-20261014 (${NOTICE_LABEL})`,
      `odoxa-20261007 (${NOTICE_LABEL})`,
    ])
  })

  it('garde les liens déjà trouvés quand les sites sont injoignables', () => {
    const again = syncPolls(data, WIKITEXT, '2026-10-21')!
    expect(again.report.changed).toBe(false)
    expect(again.data).toBe(data)
  })
})
