import { useState } from 'react'
import { simulationData } from '../data/schema'
import type { SimulationResult } from '../domain/types'
import { useSimulation } from '../hooks/useSimulation'
import { useSettings } from '../state/settingsStore'
import { ElectedPresident } from './components/ElectedPresident'
import { FirstRoundChart } from './components/FirstRoundChart'
import { Methodology } from './components/Methodology'
import { QualificationSwitch } from './components/QualificationSwitch'
import { ScenarioBar } from './components/ScenarioBar'
import { SecondRoundDuel } from './components/SecondRoundDuel'
import { SettingsSheet } from './components/SettingsSheet'
import { VoteFlow } from './components/VoteFlow'
import { date } from './format'
import { Link } from './Link'
import { useRoute } from './router'
import type { Route } from './router'
import { useTheme } from './theme'
import type { ThemePreference } from './theme'

const THEME_LABELS: Record<ThemePreference, string> = { system: 'Thème auto', light: 'Thème clair', dark: 'Thème sombre' }
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }
const NAV: { route: Route; label: string }[] = [
  { route: 'simulateur', label: 'Simulateur' },
  { route: 'methodologie', label: 'Méthodologie' },
]

export function App() {
  const route = useRoute()
  const result = useSimulation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { preference, setPreference } = useTheme()
  const resetAll = useSettings((s) => s.resetAll)
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="mx-auto max-w-[80rem] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <Link to="simulateur" className="wide text-lg font-extrabold tracking-tight">
            Présidentielle 2027
          </Link>
          <nav aria-label="Pages">
            <ul className="flex gap-1">
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
        </div>
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
        <p className="max-w-2xl">
          Simulation fondée sur des sondages publiés et des hypothèses explicites. Données au{' '}
          {date(simulationData.polls.asOf)}. Vos réglages restent dans ce navigateur.
        </p>
        <button type="button" className="link" onClick={resetAll}>
          Réinitialiser le scénario
        </button>
      </footer>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} result={result} />
    </div>
  )
}

function SimulatorPage({ result, onOpenSettings }: { result: SimulationResult; onOpenSettings: () => void }) {
  return (
    <>
      <div className="max-w-2xl pb-8 pt-10 sm:pt-14">
        <h1 className="wide text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]">
          Présidentielle 2027, simulateur
        </h1>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-2">
          Moyenne des derniers sondages au {date(simulationData.polls.asOf)}, corrigée des écarts constatés en
          2022 (et, en option, projetée selon la progression des sondages de 2022), puis reports de voix des
          législatives 2024 pour le second tour. Une simulation, pas une prévision.{' '}
          <Link to="methodologie" className="link">
            Voir la méthodologie
          </Link>
        </p>
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
