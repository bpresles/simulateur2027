import { useState } from 'react'
import { simulationData } from '../data/schema'
import { noIntentionRange } from '../domain/secondRound'
import type { SimulationResult } from '../domain/types'
import { useSimulation } from '../hooks/useSimulation'
import { ElectedPresident } from './components/ElectedPresident'
import { FirstRoundChart } from './components/FirstRoundChart'
import { Methodology } from './components/Methodology'
import { QualificationSwitch } from './components/QualificationSwitch'
import { ScenarioBar } from './components/ScenarioBar'
import { SecondRoundDuel } from './components/SecondRoundDuel'
import { SettingsSheet } from './components/SettingsSheet'
import { VoteFlow } from './components/VoteFlow'
import { date, range } from './format'
import { Link } from './Link'
import { useRoute } from './router'
import type { Route } from './router'
import { useTheme } from './theme'
import type { ThemePreference } from './theme'

const THEME_LABELS: Record<ThemePreference, string> = { system: 'Thème auto', light: 'Thème clair', dark: 'Thème sombre' }
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }
const NO_INTENTION = noIntentionRange(simulationData.polls.secondRoundPolls)
const NAV: { route: Route; label: string }[] = [
  { route: 'simulateur', label: 'Simulateur' },
  { route: 'methodologie', label: 'Méthodologie' },
]

export function App() {
  const route = useRoute()
  const result = useSimulation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { preference, setPreference } = useTheme()
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="mx-auto max-w-[80rem] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4">
        <nav aria-label="Pages">
          {/* Marge négative : le texte du premier lien s'aligne sur le bord gauche du contenu. */}
          <ul className="-ml-3 flex gap-1">
            {NAV.map((item) => (
              <li key={item.route}>
                <Link
                  to={item.route}
                  current={route === item.route}
                  className="block rounded-lg px-3 py-2 text-[0.95rem] font-medium text-ink-2 hover:bg-sunken hover:text-ink aria-[current=page]:bg-ballpoint-soft aria-[current=page]:text-ballpoint"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreference(NEXT_THEME[preference])}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-sunken"
            aria-label={`${THEME_LABELS[preference]}, changer de thème`}
          >
            {THEME_LABELS[preference]}
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="rounded-lg bg-ballpoint px-4 py-2 text-sm font-semibold text-surface hover:opacity-90"
          >
            Réglages
          </button>
        </div>
      </header>

      <main>
        {route === 'simulateur' ? (
          <SimulatorPage result={result} onOpenSettings={openSettings} />
        ) : (
          <div className="pt-10 sm:pt-14">
            <Methodology result={result} />
          </div>
        )}
      </main>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6 text-sm text-ink-3">
        <p className="max-w-full">
          Simulation fondée sur des sondages publiés et des hypothèses explicites. Données au{' '}
          {date(simulationData.polls.asOf)}. Vos réglages restent dans ce navigateur.
        </p>
      </footer>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} result={result} />
    </div>
  )
}

function SimulatorPage({ result, onOpenSettings }: { result: SimulationResult; onOpenSettings: () => void }) {
  return (
    <>
      <div className="max-w-full pb-8 pt-10 sm:pt-14">
        <h1 className="wide text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]">
          Présidentielle 2027
        </h1>
        <h2 className="text-[1.7rem]" >Simulateur des résultats de second tour</h2>
        <div className="mt-3 space-y-[1lh] text-[1.05rem] leading-relaxed text-ink-2">
          <p>
            Cet outil a été développé suite au constat que, dans les sondages de second tour,{' '}
            {NO_INTENTION ? range(NO_INTENTION.min, NO_INTENTION.max) : 'une part importante'} des personnes
            interrogées n’expriment aucun choix entre les deux candidats selon les instituts et les duels (indécis,
            vote blanc ou nul et abstention compris), réduisant de ce fait leur fiabilité.
            {NO_INTENTION && (
              <>
                {' '}
                Cette fourchette va de la part la plus basse à la plus haute des {NO_INTENTION.polls.length} duels
                publiés en dernier par chaque institut (
                {new Set(NO_INTENTION.polls.map((p) => p.institute)).size} instituts) ; selon l’institut, elle porte
                sur l’ensemble des inscrits ou sur les seuls inscrits comptant voter (
                <Link to="methodologie" hash="limites" className="link">
                  détail par sondage
                </Link>
                ).
              </>
            )}
          </p>
          <p>
            Pour tenter d’offrir une meilleure simulation du résultat du second tour pour les présidentielles de 2027, cet outil se base sur les hypothèses
            suivantes :
          </p>
          <div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                La moyenne du dernier sondage de chaque institut (ou des seuls sondages choisis en option), repris
                de la liste des sondages de Wikipedia
              </li>
              <li>Les reports de voix des législatives 2024 entre le premier tour et le second tour</li>
              <li>
                Les données réelles d’écarts entre les sondages d’avant premier tour et les résultats réels du premier
                tour de la présidentielle 2022 (en option)
              </li>
              <li>L’évolution des sondages de fin 2021 jusqu’aux derniers sondages de 2022 (en option)</li>
            </ul>
          </div>
          <p>
            Les alliances ne sont pas des calculs de report : chaque sondeur teste plusieurs listes de candidats
            (hypothèses), et activer une alliance revient à retenir les hypothèses où le candidat rallié n’est
            pas présent (et où personne ne le remplace), le leader de l’alliance l’étant. Ce sont donc les
            sondés eux-mêmes qui répartissent ses électeurs, et seuls les sondages qui testent cette hypothèse
            sont retenus. Pour qu’une absence vaille ralliement, le leader doit rester le seul candidat principal
            de leur camp. Les alliances proposées sont celles que les sondages testent : la liste évolue avec
            les hypothèses publiées par les instituts.
          </p>
          <p>
            En option, désactivée par défaut, vous pouvez aussi tester des alliances qu’aucun sondeur n’a
            évaluées : elles sont alors estimées en appliquant aux sondages les reports de voix des législatives
            2024. Une estimation reste moins fiable qu’une hypothèse testée, qui garde toujours la priorité :
            chaque sondage utilise l’hypothèse la plus proche qu’il teste, et seules les alliances qu’il ne teste
            pas y sont estimées, avant la moyenne entre instituts.
          </p>
          <p>
            Les résultats et reports de voix des élections passées ne présagent pas des résultats futurs réels : il ne faut donc pas
            prendre ce simulateur comme un outil de prévision des résultats de 2027.
          </p>
          <p>
            Cet outil est proposé à titre d’expérimentation uniquement.{' '}
            <Link to="methodologie" className="link">
              Voir la méthodologie
            </Link>
          </p>
        </div>
      </div>

      <ScenarioBar result={result} />

      {result.warnings.length > 0 && (
        <ul aria-live="polite" className="mt-4 space-y-2">
          {result.warnings.map((w) => (
            <li key={w} className="rounded-lg border-l-4 border-hypo bg-hypo-soft px-4 py-2.5 text-sm text-ink">
              {w}
            </li>
          ))}
        </ul>
      )}

      <QualificationSwitch result={result} />

      <ElectedPresident result={result} />

      <div className="mt-12 grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="order-2 lg:order-1">
          <FirstRoundChart result={result} />
          <p className="mt-4 text-sm text-ink-3">
            Survolez ou sélectionnez un candidat pour voir le détail du calcul. Les corrections se règlent
            candidat par candidat dans les{' '}
            <button type="button" className="link" onClick={onOpenSettings}>
              réglages
            </button>
            .
          </p>
          <VoteFlow result={result} />
        </div>
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-6">
            <SecondRoundDuel result={result} />
          </div>
        </div>
      </div>
    </>
  )
}
