// Shared class strings for the landing page. Tokens only (packages/ui preset +
// apps/admin tailwind config); every interactive target is at least 44px tall.

/** Page gutter + max width used by every section. */
export const WRAP = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

/** Vertical rhythm between sections; scroll-mt clears the 64px sticky nav for #anchors. */
export const SECTION_Y = 'scroll-mt-16 py-20 md:py-28'

/** Section heading (h2). */
export const H2 =
  'font-heading font-bold text-ink text-[2rem] leading-[1.1] tracking-[-0.02em] md:text-5xl text-balance'

/** Lead paragraph under a section heading. */
export const LEAD = 'mt-5 max-w-2xl font-body text-base leading-relaxed text-ink-muted md:text-lg text-pretty'

/** Primary action: maroon fill, white label (10.95:1). */
export const BTN_PRIMARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-maroon px-6 font-body text-base font-semibold text-ink-inverse shadow-sm transition-colors hover:bg-maroon-hover'

/** Secondary action: outlined, maroon label. */
export const BTN_SECONDARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-strong bg-surface px-6 font-body text-base font-semibold text-ink transition-colors hover:border-maroon hover:text-maroon'

/** Card surface for UI previews and bento cells: one elevation (border), 16px radius. */
export const CARD = 'rounded-md border border-subtle bg-surface'
