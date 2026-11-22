import { newestFirst, POLL_HALF_LIFE_DAYS, SAMPLE_SIZE_CAP } from '../../domain/pollAverage'
import type { SimulationResult } from '../../domain/types'
import { fieldwork, integer, pct } from '../format'

/** Sondages entrant dans la moyenne pondérée, du plus récent au plus ancien, avec poids et éventuelle projection. */
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
          : `Moyenne pondérée des ${used.length} instituts suivants (demi-vie ${POLL_HALF_LIFE_DAYS} jours, échantillon plafonné à ${integer(SAMPLE_SIZE_CAP)}) :`}
      </p>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {used.map((u) => {
          const p = u.poll
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
                <span className="num">{integer(p.sampleSize)}</span> pers.
                {used.length > 1 && (
                  <>
                    {' '}
                    · <span className="num font-medium text-ink-2">{pct(u.weightShare, 0)}</span>
                  </>
                )}
              </span>
              {u.projected && (
                <span
                  className="ml-1.5 inline-block rounded bg-sunken px-1.5 py-0.5 text-xs text-ink-2"
                  title="Hypothèse projetée vers l'offre cible via paires propres intra-institut"
                >
                  projeté {u.projectionSteps.join(', ')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
