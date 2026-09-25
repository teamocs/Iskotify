import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

// `strong` text on its own `soft` tint — the DESIGN.md pairing that clears 4.5:1.
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-ink-muted',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
  info: 'bg-info-soft text-info-strong',
  brand: 'bg-maroon-dim text-maroon',
}

/**
 * A status label. The text IS the signal; tone only reinforces it, so a badge
 * never relies on colour alone. `children` is required for that reason.
 */
export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      data-tone={tone}
      className={['inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium leading-4 whitespace-nowrap', TONES[tone], className].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  )
}
