import type { ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

/** Infobulle accessible (survol et focus clavier), au-dessus de l'élément sauf indication contraire. */
export function InfoTip({
  children,
  content,
  side = 'top',
}: {
  children: ReactNode
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-lg border border-rule bg-surface px-3 py-2 text-sm leading-snug text-ink shadow-lg"
        >
          {content}
          <Tooltip.Arrow className="fill-surface" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
