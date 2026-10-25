import { AnimatePresence, motion } from 'motion/react'
import { simulationData } from '../../data/schema'
import type { CandidateId, SimulationResult } from '../../domain/types'
import { useSettings } from '../../state/settingsStore'
import { cand, colorVars } from '../candidates'
import { num, pct } from '../format'
import { AnimatedNumber } from './AnimatedNumber'

/** Écart (en points) en dessous duquel le 2nd tour est présenté comme une égalité. */
const TIE_MARGIN = 0.05

const list = new Intl.ListFormat('fr', { type: 'conjunction' })

export function ElectedPresident({ result }: { result: SimulationResult }) {
  const sr = result.secondRound
  const settings = useSettings()
  const { correctionsEnabled, correctionIntensity, progressionEnabled, progressionIntensity } = settings
  const aWins = sr.pct.a >= sr.pct.b
  const winnerId = aWins ? sr.a : sr.b
  const loserId = aWins ? sr.b : sr.a
  const winnerPct = Math.max(sr.pct.a, sr.pct.b)
  const margin = Math.abs(sr.pct.a - sr.pct.b)
  const tie = margin < TIE_MARGIN

  const winner = cand(winnerId)
  // Candidats ralliés au vainqueur : absents des hypothèses retenues (alliances testées) ou estimés.
  const allies = [
    ...simulationData.polls.alliances
      .filter((a) => result.allianceIds.includes(a.id) && a.leader === winnerId)
      .flatMap((a) => a.members.filter((id) => id !== winnerId)),
    ...result.entrants
      .find((e) => e.id === winnerId)!
      .members.slice(1)
      .map((m) => m.candidateId),
  ]
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((id) => cand(id).shortName)
  const [firstName, ...lastName] = winner.name.split(' ')

  const alliances = simulationData.polls.alliances.flatMap((a) => {
    const [read, estimated] = [result.allianceIds.includes(a.id), result.estimatedAllianceIds.includes(a.id)]
    if (!read && !estimated) return []
    return [`${a.label}${estimated ? (read ? ' (en partie estimée)' : ' (estimée)') : ''}`]
  })
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

  // Lecture du résultat : les hypothèses retenues, dans l'ordre chronologique jusqu'au 2nd tour.
  const share = (intensity: number) => (intensity === 1 ? '' : `, à ${pct(intensity * 100, 0)} de leur ampleur`)
  const transfersAdjusted =
    Object.keys(settings.transferOverrides).length > 0 ||
    Object.keys(settings.minorTransfers).length > 0 ||
    settings.fidelity !== null
  // Ralliements retenus, regroupés par tête de liste : « Tondelier et Roussel se rangent derrière Mélenchon ».
  const rallies = [
    ...simulationData.polls.alliances
      .filter((a) => result.allianceIds.includes(a.id) || result.estimatedAllianceIds.includes(a.id))
      .reduce((byLeader, a) => {
        const members = a.members.filter((id) => id !== a.leader)
        return byLeader.set(a.leader, [...(byLeader.get(a.leader) ?? []), ...members])
      }, new Map<CandidateId, CandidateId[]>()),
  ].map(([leader, members], i) => {
    const names = list.format(members.filter((id, j) => members.indexOf(id) === j).map((id) => cand(id).shortName))
    const verb = i > 0 ? '' : members.length > 1 ? ' se rangent' : ' se range'
    return `${names}${verb} derrière ${cand(leader).shortName}`
  })
  const conditions = [
    ...(rallies.length > 0 ? [`${list.format(rallies)} dès le 1er tour`] : []),
    progressionEnabled
      ? `les intentions de vote évoluent d’ici au scrutin comme en 2022 à la même distance de l’élection${share(progressionIntensity)}`
      : 'les intentions de vote n’évoluent plus d’ici au scrutin',
    correctionsEnabled
      ? `les sondages se trompent sur le 1er tour comme en 2022${share(correctionIntensity)}${Object.keys(settings.correctionOverrides).length > 0 ? ' (avec vos ajustements par candidat)' : ''}`
      : 'les sondages donnent exactement le résultat du 1er tour',
    transfersAdjusted
      ? 'les reports de voix entre les deux tours suivent vos réglages, à partir de ceux des législatives 2024'
      : 'les reports de voix entre les deux tours ressemblent à ceux des législatives 2024',
  ]
  const reading = `${tie ? 'Ce duel serait indécis' : `${winner.shortName} l’emporterait`} si ${conditions
    .slice(0, -1)
    .join(', si ')} et si ${conditions.at(-1)}.`

  return (
    <section aria-labelledby="elected-title" className="mt-10">
      <h2 id="elected-title" className="text-2xl font-bold tracking-tight">
        Président élu
      </h2>
      <p className="mt-2 text-ink-2">{reading}</p>

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
