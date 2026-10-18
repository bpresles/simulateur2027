import { useEffect, useState } from 'react'

export type Route = 'simulateur' | 'methodologie'

export const PATHS: Record<Route, string> = { simulateur: '/', methodologie: '/methodologie' }
const TITLES: Record<Route, string> = {
  simulateur: 'Présidentielle 2027 – simulateur',
  methodologie: 'Méthodologie – simulateur présidentielle 2027',
}

export function routeFromPath(pathname: string): Route {
  return pathname.replace(/\/+$/, '') === PATHS.methodologie ? 'methodologie' : 'simulateur'
}

const NAVIGATE_EVENT = 'simulateur2027:navigate'

export function navigate(route: Route, hash?: string) {
  const url = `${PATHS[route]}${hash ? `#${hash}` : ''}`
  window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** Routeur minimal (History API) : deux pages, aucune dépendance. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname))

  useEffect(() => {
    const sync = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', sync)
    window.addEventListener(NAVIGATE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(NAVIGATE_EVENT, sync)
    }
  }, [])

  // Titre de l'onglet et position de lecture après chaque changement de page.
  useEffect(() => {
    document.title = TITLES[route]
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = id ? document.getElementById(id) : null
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [route])

  return route
}
