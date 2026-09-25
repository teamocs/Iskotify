import type { ReactNode } from 'react'

/** A key cap. Monospace here is for what it is: a literal key to press. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-strong bg-surface-3 px-1.5 font-mono text-xs font-medium leading-5 text-ink">
      {children}
    </kbd>
  )
}
