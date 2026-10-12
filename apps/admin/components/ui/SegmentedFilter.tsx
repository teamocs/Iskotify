'use client'

import { useId, useRef, type KeyboardEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Above this many options a filter stays a native <select> chip (DataTable). */
export const MAX_SEGMENT_OPTIONS = 5

export interface SegmentOption {
  value: string
  label: string
  /** Shown beside the label in tabular figures (client tables' facet counts). */
  count?: number
}

interface Props {
  /** The group's visible label and accessible name, e.g. the filter's label ("Status"). */
  label: string
  options: SegmentOption[]
  /** Prepends a "no filter" segment (value "") with this label. */
  allLabel?: string
  /** Controlled value. With `onChange`, the caller owns the URL (DataTable). */
  value?: string
  onChange?: (value: string) => void
  /**
   * URL mode: read the value from this search param and write it back with
   * router.replace, keeping every other param except `resetParams`.
   */
  param?: string
  /** Params dropped when the choice changes (a new filter starts on page 1). */
  resetParams?: string[]
  className?: string
}

const NEXT: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * A macOS-style segmented control for a filter with few options. Semantically a
 * WAI-ARIA radio group: one tab stop (the checked segment), arrow keys move and
 * select, wrapping, Home and End jump to the ends.
 */
export function SegmentedFilter({ label, options, allLabel, value, onChange, param, resetParams = ['page'], className }: Props) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const labelId = `${useId()}-label`

  const segments: SegmentOption[] = allLabel !== undefined ? [{ value: '', label: allLabel }, ...options] : options
  const fromUrl = param ? (params?.get(param) ?? '') : ''
  const raw = value ?? fromUrl
  // An unknown value (a stale link) shows the first segment rather than nothing.
  const current = segments.some(s => s.value === raw) ? raw : (segments[0]?.value ?? '')

  function choose(next: string) {
    if (onChange) { onChange(next); return }
    if (!param) return
    const qs = new URLSearchParams(params?.toString() ?? '')
    for (const p of resetParams) qs.delete(p)
    if (next) qs.set(param, next)
    else qs.delete(param)
    const s = qs.toString()
    router.replace(s ? `${pathname}?${s}` : (pathname ?? ''), { scroll: false })
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = segments.findIndex(s => s.value === current)
    let to: number | null = null
    if (e.key in NEXT) to = (at + NEXT[e.key]! + segments.length) % segments.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = segments.length - 1
    if (to === null) return
    e.preventDefault()
    refs.current[to]?.focus()
    choose(segments[to]!.value)
  }

  return (
    <div className={['inline-flex items-center gap-2 text-ui', className].filter(Boolean).join(' ')}>
      <span id={labelId} className="whitespace-nowrap text-ink-muted">{label}</span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="inline-flex h-8 items-center gap-0.5 rounded-chip bg-neutral-soft p-0.5"
      >
        {segments.map((s, i) => {
          const on = s.value === current
          return (
            <button
              key={s.value || '__all'}
              ref={el => { refs.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(s.value)}
              className={[
                'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 transition-colors duration-200 ease-snappy',
                on ? 'bg-surface font-semibold text-ink shadow-sm' : 'font-medium text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {s.label}
              {s.count !== undefined && (
                // ink-muted, not ink-subtle: the track is neutral-soft, where subtle drops under 4.5:1.
                <span className="tabular-nums text-xs text-ink-muted">{s.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
