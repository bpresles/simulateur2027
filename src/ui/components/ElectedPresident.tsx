import { AnimatePresence, motion } from 'motion/react'
import { simulationData } from '../../data/schema'
import type { SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { num, pct } from '../format'
import { AnimatedNumber } from './AnimatedNumber'

/** Écart (en points) en dessous duquel le 2nd tour est présenté comme une égalité. */
const TIE_MARGIN = 0.05
const allianceLabels = new Map(simulationData.polls.alliances.map((a) => [a.id, a.label]))

export function ElectedPresident({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const { correctionsEnabled, correctionIntensity, progressionEnabled, progressionIntensity } = useSettings()
  const aWins = sr.pct.a >= sr.pct.b
  const winnerId = aWins ? sr.a : sr.b
  const loserId = aWins ? sr.b : sr.a
  const winnerPct = Math.max(sr.pct.a, sr.pct.b)
  const margin = Math.abs(sr.pct.a - sr.pct.b)
  const tie = margin < TIE_MARGIN

  const winner = cand(winnerId)
  const hypothesisAlliance = simulationData.polls.alliances.find((a) => a.id === result.hypothesisAllianceId)
  const allies = [
    ...(hypothesisAlliance?.leader === winnerId ? hypothesisAlliance.members.filter((id) => id !== winnerId) : []),
    ...result.entrants
      .find((e) => e.id === winnerId)!
      .members.slice(1)
      .map((m) => m.candidateId),
  ].map((id) => cand(id).shortName)
  const [firstName, ...lastName] = winner.name.split(' ')

  const alliances = [
    ...(result.hypothesisAllianceId ? [result.hypothesisAllianceId] : []),
    ...result.entrants.flatMap((e) => e.allianceIds),
  ].map((id) => allianceLabels.get(id) ?? id)
  const third = result.qualification.picked === 'third'
  const scenario = [
    `hypothèse « ${result.hypothesisSet.label} »`,
    ...(progressionEnabled ? [`progression des sondages comme en 2022 à ${pct(progressionIntensity * 100, 0)}`] : []),
    ...(result.qualification.tight
      ? [`qualification serrée, 2nd tour avec le ${third ? '3e' : '2e'} du 1er tour`]
      : []),
    correctionsEnabled ? `correction 2022 à ${pct(correctionIntensity * 100, 0)}` : 'sans correction 2022',
    alliances.length > 0 ? alliances.join(', ') : 'sans alliance',
  ].join(' ; ')

  return (
    <section aria-labelledby="elected-title" className="mt-10">
      <h2 id="elected-title" className="text-2xl font-bold tracking-tight">
        Président élu
      </h2>

      <div aria-live="polite" className="mt-4">
        <AnimatePresence mode="wait" initial={false}>
          {tie ? (
            <motion.div
              key="tie"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-xl bg-surface px-6 py-7 shadow-[var(--ballot-shadow)]"
            >
              <p className="wide text-3xl font-extrabold tracking-tight">Égalité</p>
              <p className="mt-2 text-ink-2">
                {cand(sr.a).shortName} et {cand(sr.b).shortName} sont à moins de {num(TIE_MARGIN, 2)} point l’un
                de l’autre.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={winnerId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="relative grid items-end gap-x-10 gap-y-5 overflow-hidden rounded-xl bg-surface py-6 pl-8 pr-6 shadow-[var(--ballot-shadow)] md:grid-cols-[minmax(0,1fr)_auto] md:py-8 md:pl-12 md:pr-10"
            >
              <span aria-hidden style={colorVars(winner)} className="cand-fill absolute inset-y-0 left-0 w-2 md:w-3" />
              <div className="min-w-0">
                <p className="text-lg leading-tight text-ink-2 md:text-xl">{firstName}</p>
                <p className="wide break-words text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight sm:text-[3.25rem] lg:text-[4.5rem]">
                  {lastName.join(' ')}
                </p>
                <p className="mt-2 text-ink-3 md:text-lg">
                  {winner.party}
                  {allies.length > 0 && `, en alliance avec ${allies.join(', ')}`}
                </p>
              </div>
              <div className="md:text-right">
                <AnimatedNumber
                  value={winnerPct}
                  format={pct}
                  className="figure block text-[3.5rem] sm:text-[4rem] lg:text-[5.5rem]"
                />
                <p className="mt-1 text-ink-2">
                  des suffrages exprimés, {num(margin)} point{margin >= 2 ? 's' : ''} d’avance sur{' '}
                  {cand(loserId).shortName}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-sm text-ink-3">
        Selon cette simulation ({scenario}). Ce n’est ni un sondage ni une prévision.
      </p>
    </section>
  )
}
