'use client'

import { Fragment, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Icon, type IconName } from './Icon'

export interface RowAction {
  label: string
  /** Accessible name when the row needs naming ("Delete Scholar A"); must contain `label`. */
  name?: string
  onSelect: () => void
  icon?: IconName
  /** Destructive actions read in the danger colour and sit last. */
  tone?: 'danger'
  disabled?: boolean
}

const ITEM_HEIGHT = 36

/**
 * A row's overflow ("kebab") menu, following the WAI-ARIA menu button
 * pattern: Enter, Space or ArrowDown opens it on the first item, ArrowUp on
 * the last; arrows, Home and End move; Escape closes and returns focus to the
 * button; Tab closes. The menu is fixed-positioned, so the table's scroll
 * container never clips it, and stays in the DOM (`hidden`) while closed.
 */
export function RowActions({ label, items, className }: { label: string; items: RowAction[]; className?: string }) {
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})

  const itemEls = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  function openMenu(focus: 'first' | 'last') {
    const r = buttonRef.current?.getBoundingClientRect()
    if (r) {
      const height = items.length * ITEM_HEIGHT + 8
      const right = Math.max(8, window.innerWidth - r.right)
      // Open upward when there is no room below (the last rows of a long table).
      setPos(r.bottom + height + 8 > window.innerHeight && r.top > height
        ? { right, bottom: window.innerHeight - r.top + 4 }
        : { right, top: r.bottom + 4 })
    }
    setOpen(true)
    requestAnimationFrame(() => {
      const els = itemEls()
      ;(focus === 'first' ? els[0] : els[els.length - 1])?.focus()
    })
  }

  // Outside press, scroll and resize close it (it is positioned to the button).
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false)
    }
    const onMove = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) close(false) }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); openMenu('first') }
    if (e.key === 'ArrowUp') { e.preventDefault(); openMenu('last') }
  }

  function onMenuKey(e: KeyboardEvent) {
    const els = itemEls()
    const i = els.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number) => { e.preventDefault(); els[(n + els.length) % els.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(els.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false)
  }

  // Destructive items last, whatever order they were given in.
  const ordered = [...items.filter(i => i.tone !== 'danger'), ...items.filter(i => i.tone === 'danger')]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : openMenu('first'))}
        onKeyDown={onButtonKey}
        className={[
          '-my-1 inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150',
          'hover:bg-surface-hover hover:text-ink aria-expanded:bg-surface-hover aria-expanded:text-ink',
          className,
        ].filter(Boolean).join(' ')}
      >
        <Icon name="more" />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={onMenuKey}
        style={pos}
        className="fixed z-50 min-w-[11rem] rounded-sm border border-subtle bg-surface p-1 text-left shadow-overlay"
      >
        {ordered.map((item, i) => {
          const danger = item.tone === 'danger'
          return (
            <Fragment key={item.label}>
              {danger && i > 0 && <div role="separator" className="my-1 border-t border-subtle" />}
              <button
                type="button"
                role="menuitem"
                aria-label={item.name}
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => { close(true); item.onSelect() }}
                className={[
                  'flex h-9 w-full items-center gap-2 rounded px-2.5 text-ui whitespace-nowrap transition-colors focus-visible:outline-offset-[-2px]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  danger
                    ? 'text-danger hover:bg-danger-soft hover:text-danger-strong focus-visible:bg-danger-soft focus-visible:text-danger-strong'
                    : 'text-ink hover:bg-surface-hover focus-visible:bg-surface-hover',
                ].join(' ')}
              >
                {item.icon ? <Icon name={item.icon} /> : <span aria-hidden="true" className="w-4" />}
                {item.label}
              </button>
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
