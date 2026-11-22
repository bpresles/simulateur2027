import { motion } from 'motion/react'
import { simulationData } from '../../data/schema'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { distance, integer, pct } from '../format'

const spring = { type: 'spring', stiffness: 160, damping: 24 } as const

/** Synthèse probabiliste des issues simulées (Monte-Carlo) : remplace l'annonce déterministe « Président élu ». */
export function ElectedPresident({ result }: { result: SimulationResult }) {
  const mc = result.monteCarlo
  const sr = result.secondRound
  const settings = useSettings()

  const contenders = Object.values(mc.candidates)
    .filter((c) => c.winProb >= 1 || c.qualifProb >= 5)
    .sort((x, y) => y.winProb - x.winProb || y.qualifProb - x.qualifProb)
  const leader = contenders[0]
  const leaderCand = leader ? cand(leader.candidateId) : null

  const alliances = simulationData.polls.alliances
    .filter((a) => result.allianceIds.includes(a.id))
    .map((a) => a.label)
  const rf = settings.republicanFront
  const transferDesc =
    settings.transferSource === 'legislatives2024'
      ? `base historique 2022 ↔ 2024 (front républicain par électorat : gauche ${pct(rf.gauche * 100, 0)}, centre ${pct(rf.centre * 100, 0)}, droite ${pct(rf.droite * 100, 0)} ; plage MC gauche hors LFI : ${settings.lfiLeftTransferRange[0]}–${settings.lfiLeftTransferRange[1]} %)`
      : settings.transferSource === 'blend'
        ? `mélange base historique / déclarations 2027 (${pct(settings.declaredWeight * 100, 0)})`
        : 'déclarations 2027 corrigées en logit'

  return (
    <section
      aria-labelledby="elected-title"
      className="rounded-xl bg-surface p-5 shadow-(--ballot-shadow) sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="elected-title" className="text-2xl font-bold tracking-tight">
          Issues simulées
        </h2>
        <span className="text-sm text-ink-3">
          {integer(mc.iterations)} tirages · à {distance(mc.daysToElection)} du 1er tour
        </span>
      </div>

      {leader && leaderCand && (
        <p className="mt-2 text-ink-2">
          À cet horizon, aucune issue n’est acquise : compte tenu de la volatilité historique des campagnes
          (1995–2022) et de l’incertitude des reports, <strong>{leaderCand.shortName}</strong> l’emporte dans{' '}
          <strong className="num">{pct(leader.winProb, 0)}</strong> des simulations (qualification dans{' '}
          <span className="num">{pct(leader.qualifProb, 0)}</span> des cas). Dans le duel affiché (
          {cand(sr.a).shortName} – {cand(sr.b).shortName}), {cand(sr.a).shortName} gagne dans{' '}
          <strong className="num">{pct(mc.displayedDuel.aWinProb, 0)}</strong> des tirages (intervalle 80 % :{' '}
          <span className="num">
            {pct(mc.displayedDuel.aScoreP10)} – {pct(mc.displayedDuel.aScoreP90)}
          </span>
          ).
        </p>
      )}

      <div aria-live="polite" className="mt-4 p-6">
        <div className="mb-3 grid grid-cols-[9rem_1fr_4.5rem_5rem] gap-x-3 text-xs font-medium uppercase tracking-wide text-ink-3">
          <span>Candidat</span>
          <span className="flex items-baseline justify-between">
            <span>Probabilité de victoire</span>
            <span className="num font-normal normal-case tracking-normal text-ink-3/70">0 – 100 %</span>
          </span>
          <span className="text-right">Victoire</span>
          <span className="text-right">Qualif. T2</span>
        </div>
        <ol className="space-y-2.5">
          {contenders.map((c) => {
            const info = cand(c.candidateId)
            const widthPct = Math.min(100, Math.max(0, c.winProb))
            return (
              <li
                key={c.candidateId}
                className="grid grid-cols-[9rem_1fr_4.5rem_5rem] items-center gap-x-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span style={colorVars(info)} className="cand-fill h-2.5 w-2.5 shrink-0 rounded-full" />
                  <span className="truncate">{info.shortName}</span>
                </span>
                <div className="relative h-3 overflow-hidden rounded-full bg-sunken">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-rule"
                  />
                  <motion.div
                    style={colorVars(info)}
                    className="cand-fill relative h-full rounded-full"
                    animate={{ width: `${widthPct}%` }}
                    transition={spring}
                  />
                </div>
                <span className="num text-right font-semibold">{pct(c.winProb, 0)}</span>
                <span className="num text-right text-ink-2">{pct(c.qualifProb, 0)}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <p className="mt-3 text-sm text-ink-3">
        Scénario : {result.projection.enabled ? 'projection avril 2027' : 'photographie actuelle'}, hypothèse
        « {result.hypothesisSet.label} »
        {settings.candidacyUncertaintyEnabled && result.allianceIds.length === 0
          ? ' (+ incertitude des candidatures pondérée)'
          : ''}
        , {transferDesc}, {alliances.length > 0 ? alliances.join(', ') : 'sans alliance'}. Ce n’est ni un
        sondage ni une prévision.
      </p>
    </section>
  )
}
