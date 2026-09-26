'use client'

import { useState, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes, type HTMLAttributes } from 'react'
import type { Density } from '@/lib/table/density'

/*
 * The console's table primitives. `DataTable` is built from these, and the
 * few tables that cannot be a DataTable (the question-bank editor grid, the
 * static column references in the guide, a topic's cards) use them directly,
 * so every table shares one header, one row rhythm, one density and one
 * scroll container.
 *
 * Row tint (hover, keyboard focus inside the row, selected) is painted by the
 * cells over an opaque surface (`.dt-row` in globals.css), so a pinned column
 * hides whatever scrolls beneath it.
 */

/** The bordered frame a table sits in. No overflow clipping, so the bulk bar
 *  can stick to the bottom of the view and menus can open outside it. */
export const TABLE_FRAME = 'rounded-md border border-subtle bg-surface'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/**
 * The horizontal (and, with `maxHeight`, vertical) scroll container. A
 * scrollable region must take focus so keyboard users can scroll it
 * (WCAG 2.1.1; axe "scrollable-region-focusable"), so it is a named region.
 */
export function TableRegion({ label, labelledBy, busy, maxHeight = false, className, children }: {
  label?: string
  labelledBy?: string
  busy?: boolean
  /** Cap the height (70vh) so the sticky header stays in view on long tables. */
  maxHeight?: boolean
  className?: string
  children: ReactNode
}) {
  // The pinned column's edge only shows once something has scrolled under it.
  const [scrolled, setScrolled] = useState(false)
  return (
    <div
      data-scrolled={scrolled ? 'true' : undefined}
      onScroll={e => {
        const next = e.currentTarget.scrollLeft > 0
        if (next !== scrolled) setScrolled(next)
      }}
      role="region"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-scrollable (WCAG 2.1.1)
      tabIndex={0}
      className={cx('overflow-auto overscroll-x-contain focus-visible:outline-offset-[-2px]', maxHeight && 'max-h-[70vh]', className)}
    >
      {children}
    </div>
  )
}

export function Table({ caption, captionId, density = 'comfortable', className, children }: {
  /** Accessible name; visually hidden. */
  caption: ReactNode
  captionId?: string
  density?: Density
  className?: string
  children: ReactNode
}) {
  return (
    <table data-density={density} className={cx('group/table w-full border-separate border-spacing-0 text-ui', className)}>
      <caption id={captionId} className="sr-only">{caption}</caption>
      {children}
    </table>
  )
}

/** Pinned (sticky) columns: the selection checkbox, then the first data column. */
export type Pin = 'select' | 'first' | 'first-after-select'

const PIN: Record<Pin, string> = {
  select: 'sticky left-0',
  first: 'sticky left-0 dt-pin-edge max-md:max-w-[12rem]',
  'first-after-select': 'sticky left-10 dt-pin-edge max-md:max-w-[12rem]',
}

type Align = 'left' | 'right' | 'center'
const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' }

interface CellOpts {
  numeric?: boolean
  align?: Align
  pin?: Pin
  /** Hide below the md breakpoint (768px): a low-priority column on phones. */
  hideOnMobile?: boolean
}

export const TH_BASE =
  'border-b border-subtle bg-surface-3 px-3 py-2 text-xs font-semibold text-ink-muted whitespace-nowrap ' +
  'group-data-[density=compact]/table:py-1.5'

export const TD_BASE =
  'border-b border-subtle px-3 py-2.5 align-top text-ink [tr:last-child>&]:border-b-0 ' +
  'group-data-[density=compact]/table:py-1'

export function thClass({ numeric, align, pin, hideOnMobile }: CellOpts = {}, extra?: string) {
  return cx(TH_BASE, ALIGN[numeric ? 'right' : align ?? 'left'], pin && PIN[pin], pin && 'z-[2]', hideOnMobile && 'max-md:hidden', extra)
}

export function tdClass({ numeric, align, pin, hideOnMobile }: CellOpts = {}, extra?: string) {
  return cx(TD_BASE, numeric ? 'text-right tabular-nums' : align && ALIGN[align], pin && PIN[pin], pin && 'z-[1]', hideOnMobile && 'max-md:hidden', extra)
}

type ThProps = CellOpts & ThHTMLAttributes<HTMLTableCellElement>
export function Th({ numeric, align, pin, hideOnMobile, className, children, ...rest }: ThProps) {
  return <th scope="col" className={thClass({ numeric, align, pin, hideOnMobile }, className)} {...rest}>{children}</th>
}

type TdProps = CellOpts & TdHTMLAttributes<HTMLTableCellElement>
export function Td({ numeric, align, pin, hideOnMobile, className, children, ...rest }: TdProps) {
  return <td className={tdClass({ numeric, align, pin, hideOnMobile }, className)} {...rest}>{children}</td>
}

/** The sticky header row group. */
export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-3">{children}</thead>
}

type TrProps = HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; tone?: 'danger' }
/** A body row with hover, focus-within and selected tints. */
export function Tr({ selected, tone, className, children, ...rest }: TrProps) {
  return (
    <tr
      data-selected={selected ? 'true' : undefined}
      data-tone={tone}
      className={cx('dt-row', className)}
      {...rest}
    >
      {children}
    </tr>
  )
}
