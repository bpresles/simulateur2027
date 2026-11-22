import { useState } from 'react'
import { simulationData } from '../data/schema'
import { useSimulation } from '../hooks/useSimulation'
import { Methodology } from './pages/Methodology'
import { SettingsSheet } from './components/SettingsSheet'
import type { SettingsTab } from './components/SettingsSheet'
import { date } from './format'
import { Link } from './Link'
import { useRoute } from './router'
import type { Route } from './router'
import { useTheme } from './theme'
import type { ThemePreference } from './theme'
import { Simulator } from './pages/Simulator'

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Thème auto',
  light: 'Thème clair',
  dark: 'Thème sombre',
}
const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
const NAV: { route: Route; label: string }[] = [
  { route: 'simulateur', label: 'Simulateur' },
  { route: 'methodologie', label: 'Méthodologie' },
]

export function App() {
  const route = useRoute()
  const result = useSimulation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('reports')
  const { preference, setPreference } = useTheme()
  const openSettings = (tab: SettingsTab = 'reports') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <div className="mx-auto max-w-[120rem] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4">
        <nav aria-label="Pages">
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
            onClick={() => openSettings('reports')}
            className="rounded-lg bg-ballpoint px-4 py-2 text-sm font-semibold text-surface hover:opacity-90"
          >
            Réglages
          </button>
        </div>
      </header>

      <main>
        {route === 'simulateur' ? (
          <Simulator result={result} onOpenSettings={openSettings} />
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

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        result={result}
        tab={settingsTab}
        onTabChange={setSettingsTab}
      />
    </div>
  )
}
