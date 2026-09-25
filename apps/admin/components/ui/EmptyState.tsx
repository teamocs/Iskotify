import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** An empty state that says what would be here and how to get it there. */
export function EmptyState({ title, description, action, icon = 'list' }: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: IconName
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 gap-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-neutral-soft text-ink-muted">
        <Icon name={icon} size={20} />
      </span>
      <p className="font-heading font-semibold text-[15px] text-ink">{title}</p>
      {description && <p className="max-w-sm text-ui text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
