import { newestFirst } from '../../domain/pollAverage'
import type { SimulationResult } from '../../domain/types'
import { fieldwork, integer } from '../format'

/** Rappel des sondages qui entrent dans la simulation (cochés et testant l'hypothèse), du plus récent au plus ancien. */
export function RetainedPolls({ result }: { result: SimulationResult }) {
  const used = result.pollUsage.filter((u) => u.status === 'used').sort((a, b) => newestFirst(a.poll, b.poll))

  return (
    <section aria-labelledby="retained-polls-title" className="mt-10">
      <h2 id="retained-polls-title" className="text-2xl font-bold tracking-tight">
        Sondages retenus pour la simulation
      </h2>
      <p className="mt-2 text-ink-2">
        {used.length === 1
          ? 'Un seul sondage, utilisé tel quel :'
          : `Moyenne des ${used.length} sondages suivants :`}
      </p>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {used.map(({ poll: p }) => {
          // Synthèse de l'institut, à défaut la publication reprise par Wikipedia.
          const source =
            p.sources.find((s) => s.kind === 'synthese') ??
            p.sources.find((s) => !s.kind && !/wikipedia|commission-des-sondages/.test(s.url)) ??
            p.sources[0]
          return (
            <li key={p.id} className="text-sm">
              {source ? (
                <a href={source.url} target="_blank" rel="noreferrer" className="link font-medium">
                  {p.institute}
                </a>
              ) : (
                <span className="font-medium">{p.institute}</span>
              )}
              <span className="text-ink-3">
                , <span className="num">{fieldwork(p.fieldwork)}</span>,{' '}
                <span className="num">{integer(p.sampleSize)}</span> personnes
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
