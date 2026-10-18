import { useCallback } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { navigate, PATHS, routeFromPath } from './router'
import type { Route } from './router'

/** Lien interne : change de page sans recharger, et défile jusqu'à l'ancre éventuelle. */
export function Link({
  to,
  hash,
  children,
  className,
  current,
}: {
  to: Route
  hash?: string
  children: ReactNode
  className?: string
  current?: boolean
}) {
  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      const samePage = routeFromPath(window.location.pathname) === to
      navigate(to, hash)
      if (samePage) {
        const target = hash ? document.getElementById(hash) : null
        if (target) target.scrollIntoView({ behavior: 'smooth' })
        else window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    [to, hash],
  )
  return (
    <a
      href={`${PATHS[to]}${hash ? `#${hash}` : ''}`}
      onClick={onClick}
      className={className}
      aria-current={current ? 'page' : undefined}
    >
      {children}
    </a>
  )
}
