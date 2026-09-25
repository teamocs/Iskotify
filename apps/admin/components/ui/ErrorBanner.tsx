import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A failure the operator must see: announced immediately (role="alert"), names
 * the problem, and carries the recovery when there is one. Use it instead of
 * rendering an empty list when a query fails.
 */
export function ErrorBanner({ title, message, action }: { title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-sm bg-danger-soft px-4 py-3 text-danger-strong">
      <Icon name="alert" size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {message && <p className="text-ui mt-0.5 break-words">{message}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
