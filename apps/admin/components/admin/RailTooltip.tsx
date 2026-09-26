'use client'

import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'

/**
 * Tooltips for the collapsed icon rail, replacing native `title` (which is
 * mouse-only, delayed, unstyleable and never shown on keyboard focus).
 *
 * Triggers opt in with `data-rail-tip="Label"` (and optional `data-rail-hint`),
 * so the whole sidebar needs one delegated listener and one tooltip element
 * instead of a component per item. The tooltip is `position: fixed`, which
 * escapes the nav's overflow and fade-mask clipping.
 *
 * Accessibility (WCAG 1.4.13): shown on hover AND keyboard focus, dismissible
 * with Escape, hoverable (the pointer can move onto it), and persistent until
 * the pointer or focus leaves. It is aria-hidden because it only repeats what
 * the trigger already exposes: each rail item keeps its label as sr-only text,
 * counts as sr-only text, and the collapse button's shortcut as
 * aria-keyshortcuts. Pointing aria-describedby at it would read every label twice.
 */

interface Tip { label: string; hint: string | null; top: number; left: number }

const OPEN_DELAY_MS = 120
const CLOSE_DELAY_MS = 80
const GAP_PX = 10

function triggerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? (target.closest('[data-rail-tip]') as HTMLElement | null) : null
}

function tipFor(el: HTMLElement): Tip {
  const r = el.getBoundingClientRect()
  return { label: el.dataset.railTip ?? '', hint: el.dataset.railHint ?? null, top: r.top + r.height / 2, left: r.right + GAP_PX }
}

export function useRailTooltip(enabled: boolean) {
  const [tip, setTip] = useState<Tip | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Leaving rail mode drops any open tooltip; derived, so no effect is needed.
  const current = enabled ? tip : null
  const isOpen = current !== null

  const clearTimers = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current) }
  const hide = useCallback(() => { clearTimers(); setTip(null) }, [])

  useEffect(() => clearTimers, [])

  // Escape dismisses without moving focus or closing anything else.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, hide])

  const handlers = {
    onPointerOver(e: PointerEvent) {
      if (!enabled || e.pointerType === 'touch') return
      const el = triggerOf(e.target)
      if (!el) return
      clearTimers()
      // Moving along the rail with a tooltip already up switches instantly.
      if (isOpen) setTip(tipFor(el))
      else openTimer.current = setTimeout(() => setTip(tipFor(el)), OPEN_DELAY_MS)
    },
    onPointerOut(e: PointerEvent) {
      if (!enabled) return
      const from = triggerOf(e.target)
      if (!from || from.contains(e.relatedTarget as Node | null)) return
      clearTimeout(openTimer.current)
      closeTimer.current = setTimeout(() => setTip(null), CLOSE_DELAY_MS)
    },
    onFocus(e: FocusEvent) {
      if (!enabled) return
      const el = triggerOf(e.target)
      if (!el) return
      clearTimers()
      setTip(tipFor(el))
    },
    onBlur() {
      if (enabled) hide()
    },
  }

  const tooltip = current && (
    <div
      aria-hidden="true"
      onPointerEnter={() => clearTimeout(closeTimer.current)}
      onPointerLeave={hide}
      style={{ top: current.top, left: current.left }}
      className="fixed z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-sm bg-tooltip px-2.5 py-1.5 text-xs font-medium text-tooltip-ink shadow-sm animate-tooltipIn"
    >
      {current.label}
      {current.hint && <span className="font-normal text-tooltip-muted">{current.hint}</span>}
    </div>
  )

  return { handlers, tooltip, hide }
}
