import type { ReactNode } from 'react'
import { Chart, Check, Compass, Flag, Pencil, Sun } from './Icons'

/*
 * Simplified, static previews of real Iskotify screens, drawn with the landing's
 * own tokens (no screenshots, no external images). The values are sample data:
 * each preview is one role="img" with a plain-language label, and the page
 * labels them "Sample screen" in visible text so no number reads as a claim.
 */

type PreviewProps = { label: string; children: ReactNode; className?: string }

/** A labelled illustration. Children are presentational to assistive tech. */
export function Preview({ label, children, className = '' }: PreviewProps) {
  return (
    <div role="img" aria-label={label} className={className}>
      {children}
    </div>
  )
}

export function SampleCaption({ children = 'Sample screen' }: { children?: ReactNode }) {
  return <p className="mt-3 text-center font-body text-xs text-ink-subtle">{children}</p>
}

/** Phone chrome: ink bezel, light screen (the app's default look). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-[300px] max-w-full rounded-[2.5rem] bg-ink p-2.5 shadow-overlay">
      <div className="flex h-[600px] flex-col overflow-hidden rounded-[2rem] bg-surface-3">
        {children}
      </div>
    </div>
  )
}

const TABS = [
  { label: 'Today', icon: Sun },
  { label: 'Practice', icon: Pencil },
  { label: 'Explore', icon: Compass },
  { label: 'Progress', icon: Chart },
]

function TabBar({ active }: { active: string }) {
  return (
    <div className="mt-auto grid grid-cols-4 border-t border-subtle bg-surface px-2 pb-4 pt-2">
      {TABS.map(({ label, icon: I }) => {
        const on = label === active
        return (
          <div key={label} className={`flex flex-col items-center gap-1 ${on ? 'text-maroon' : 'text-ink-subtle'}`}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-pill ${on ? 'bg-maroon-dim' : ''}`}>
              <I className="size-[18px]" />
            </span>
            <span className={`font-body text-xs ${on ? 'font-semibold' : ''}`}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Today: the one next step, the day's plan, and what's coming up. */
export function TodayScreen() {
  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-xs text-ink-subtle">Magandang gabi, Andrea</p>
            <p className="font-heading text-2xl font-bold tracking-[-0.02em] text-ink">Today</p>
          </div>
          <span className="whitespace-nowrap rounded-pill bg-surface px-3 py-1.5 font-body text-xs font-semibold text-ink shadow-sm">
            UPCAT · 41 days
          </span>
        </div>

        {/* The One Next Step: the screen's only primary action. */}
        <div className="animate-slideUp rounded-lg bg-maroon p-4 text-ink-inverse shadow-card">
          <p className="font-body text-xs font-medium text-ink-inverse/80">Your next step</p>
          <p className="mt-1 font-heading text-xl font-bold leading-tight">Algebra drill</p>
          <p className="mt-1 font-body text-xs text-ink-inverse/80">15 questions · about 12 min</p>
          <div className="mt-4 flex h-10 items-center justify-center rounded-sm bg-surface font-body text-sm font-semibold text-maroon">
            Start
          </div>
        </div>

        <div className="rounded-md border border-subtle bg-surface p-3.5">
          <p className="font-heading text-sm font-bold text-ink">Today&apos;s plan</p>
          <ul className="mt-2.5 space-y-2.5">
            {[
              { t: 'Flashcards due', m: '12 cards', done: true },
              { t: 'Algebra drill', m: 'Next', done: false, now: true },
              { t: 'Reading passage', m: '1 set', done: false },
            ].map(r => (
              <li key={r.t} className="flex items-center gap-2.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-pill border ${
                    r.done ? 'border-success bg-success text-ink-inverse' : r.now ? 'border-maroon' : 'border-control'
                  }`}
                >
                  {r.done && <Check className="size-3.5" />}
                </span>
                <span className={`flex-1 font-body text-xs ${r.done ? 'text-ink-subtle line-through' : 'text-ink'}`}>{r.t}</span>
                <span className={`font-body text-xs ${r.now ? 'font-semibold text-maroon' : 'text-ink-subtle'}`}>{r.m}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-subtle bg-surface p-3.5">
          <p className="font-heading text-sm font-bold text-ink">Coming up</p>
          <div className="mt-2 flex items-center justify-between font-body text-xs">
            <span className="text-ink">Scholarship application closes</span>
            <span className="shrink-0 whitespace-nowrap rounded-pill bg-warning-soft px-2 py-0.5 font-semibold text-warning-strong">18 days</span>
          </div>
        </div>
      </div>
      <TabBar active="Today" />
    </PhoneFrame>
  )
}

/** Mock exam runner: autosave, timer, a question with a figure. */
export function MockExamScreen() {
  const options = ['40°', '70°', '100°', '140°']
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-subtle bg-surface-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle bg-surface px-4 py-3">
        <span className="font-body text-xs font-semibold text-ink">Mock exam · Mathematics</span>
        <span className="flex items-center gap-3 font-body text-xs text-ink-muted">
          <span className="flex items-center gap-1.5 text-success-strong">
            <Check className="size-3.5" /> Saved
          </span>
          <span className="tabular-nums">38:12</span>
          <span className="tabular-nums">14 of 50</span>
        </span>
      </div>
      <div className="grid flex-1 gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="font-body text-sm leading-relaxed text-ink">
            The triangle is isosceles, with equal sides meeting at the 40° angle. What is the measure of angle <i>x</i>?
          </p>
          <ul className="mt-4 grid gap-2">
            {options.map((o, i) => {
              const on = i === 1
              return (
                <li
                  key={o}
                  className={`flex items-center gap-3 rounded-sm border px-3 py-2.5 font-body text-sm ${
                    on ? 'border-maroon bg-maroon-dim font-semibold text-ink' : 'border-subtle bg-surface text-ink'
                  }`}
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-pill font-heading text-xs font-bold ${
                      on ? 'bg-maroon text-ink-inverse' : 'bg-surface-2 text-ink-muted'
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  {o}
                </li>
              )
            })}
          </ul>
        </div>
        {/* Question figure: geometry, drawn exactly. */}
        <div className="mx-auto w-40 rounded-sm border border-subtle bg-surface p-3 text-ink sm:mx-0">
          <svg viewBox="0 0 120 100" className="h-auto w-full" aria-hidden="true">
            <path d="M60 10 L108 88 L12 88 Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
            <path d="M52 23 A14 14 0 0 0 68 23" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <text x="60" y="40" textAnchor="middle" fontSize="11" fill="currentColor">40°</text>
            <path d="M27 88 A15 15 0 0 0 20 76" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <text x="32" y="81" fontSize="11" fontStyle="italic" fill="currentColor">x</text>
          </svg>
          <p className="mt-1 text-center font-body text-xs text-ink-subtle">Tap to zoom</p>
        </div>
      </div>
      {/* Section progress + navigation, pinned to the bottom of the runner. */}
      <div className="mt-auto border-t border-subtle bg-surface px-4 py-3">
        <div className="h-1.5 rounded-pill bg-neutral-soft">
          <div className="h-1.5 w-[28%] rounded-pill bg-maroon" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 font-body text-xs font-semibold">
          <span className="flex h-9 items-center justify-center rounded-sm border border-subtle text-ink">Previous</span>
          <span className="flex h-9 items-center justify-center rounded-sm border border-subtle text-ink">Review</span>
          <span className="flex h-9 items-center justify-center rounded-sm bg-maroon text-ink-inverse">Next</span>
        </div>
      </div>
    </div>
  )
}

/** Review sheet before submitting: every question's state, unanswered called out. */
export function ReviewSheet() {
  const unanswered = new Set([7, 12, 18])
  const flagged = new Set([9])
  return (
    <div className="rounded-md border border-subtle bg-surface-3 p-4">
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
          <span
            key={n}
            className={`relative flex h-8 items-center justify-center rounded-[8px] font-body text-xs tabular-nums ${
              unanswered.has(n)
                ? 'border border-dashed border-control bg-surface text-ink-muted'
                : 'bg-maroon-dim font-semibold text-ink'
            }`}
          >
            {n}
            {flagged.has(n) && <Flag className="absolute -right-1 -top-1 size-3.5 text-warning" />}
          </span>
        ))}
      </div>
      <p className="mt-3 font-body text-xs text-ink-muted">
        <span className="font-semibold text-ink">3 unanswered</span> · 1 flagged
      </p>
      <div className="mt-3 flex h-10 items-center justify-center rounded-sm bg-maroon font-body text-sm font-semibold text-ink-inverse">
        Submit exam
      </div>
    </div>
  )
}

/** Results: raw score per subtest, one neutral tone for every bar. */
export function SubtestResults() {
  const rows = [
    { s: 'Mathematics', got: 32, of: 50 },
    { s: 'Science', got: 28, of: 40 },
    { s: 'Reading', got: 30, of: 40 },
    { s: 'Language', got: 35, of: 40 },
  ]
  return (
    <div className="rounded-md border border-subtle bg-surface-3 p-4">
      <ul className="space-y-3">
        {rows.map(r => (
          <li key={r.s}>
            <div className="flex items-baseline justify-between font-body text-xs">
              <span className="text-ink">{r.s}</span>
              <span className="tabular-nums text-ink-muted">{r.got} / {r.of}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-pill bg-neutral-soft">
              <div className="h-2 rounded-pill bg-ink-muted" style={{ width: `${Math.round((r.got / r.of) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Flashcards due today, reviewed on a spaced schedule. */
export function FlashcardStack() {
  return (
    <div className="relative pb-3 pr-3 pt-1">
      <div className="absolute inset-x-6 bottom-0 h-8 rounded-md border border-subtle bg-surface-2" />
      <div className="absolute inset-x-3 bottom-1.5 h-8 rounded-md border border-subtle bg-surface-3" />
      <div className="relative rounded-md border border-subtle bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between font-body text-xs">
          <span className="text-ink-muted">Biology</span>
          <span className="rounded-pill bg-maroon-dim px-2 py-0.5 font-semibold text-maroon">12 due today</span>
        </div>
        <p className="mt-3 font-heading text-base font-semibold leading-snug text-ink">
          Where in the cell does photosynthesis happen?
        </p>
        <div className="mt-4 grid grid-cols-3 gap-1.5 font-body text-xs font-semibold">
          <span className="flex h-9 items-center justify-center rounded-sm border border-subtle text-ink">Again</span>
          <span className="flex h-9 items-center justify-center rounded-sm border border-subtle text-ink">Good</span>
          <span className="flex h-9 items-center justify-center rounded-sm border border-subtle text-ink">Easy</span>
        </div>
      </div>
    </div>
  )
}

/** Diagnostic start card. */
export function DiagnosticCard() {
  return (
    <div className="rounded-md border border-subtle bg-surface-3 p-4">
      <p className="font-heading text-base font-semibold text-ink">Diagnostic</p>
      <p className="mt-1 font-body text-xs text-ink-muted">A short mixed set across your exam&apos;s subjects</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['Mathematics', 'Science', 'Reading', 'Language'].map(s => (
          <span key={s} className="rounded-pill border border-subtle bg-surface px-2.5 py-1 font-body text-xs text-ink">
            {s}
          </span>
        ))}
      </div>
      <div className="mt-4 flex h-10 items-center justify-center rounded-sm border border-maroon font-body text-sm font-semibold text-maroon">
        Start diagnostic
      </div>
    </div>
  )
}

/** Estimated Admission Score card: a range, its basis, and its limits. */
export function EstimateCard() {
  return (
    <div className="rounded-lg border border-subtle bg-surface p-6 shadow-card">
      <p className="font-body text-sm font-semibold text-ink">Estimated Admission Score</p>
      <p className="mt-1 font-body text-xs text-ink-muted">Based on historical cutoffs · computed on this device</p>
      <div className="mt-5 flex items-end gap-3">
        <span className="font-heading text-5xl font-bold tabular-nums tracking-[-0.02em] text-ink">2.35</span>
        <span className="pb-1.5 font-body text-sm text-ink-muted">likely range 2.15 to 2.55</span>
      </div>
      {/* The range, drawn on a neutral track: an interval, not a verdict. */}
      <div className="relative mt-5 h-2 rounded-pill bg-neutral-soft">
        <div className="absolute inset-y-0 left-[28%] w-[16%] rounded-pill bg-ink-muted" />
        <div className="absolute -top-1 left-[36%] h-4 w-1 -translate-x-1/2 rounded-pill bg-ink" />
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-subtle pt-4 font-body text-xs">
        {[
          ['Mathematics', '30 answers'],
          ['Reading', '25 answers'],
          ['Language', '22 answers'],
          ['Science', '20 answers'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 rounded-sm bg-surface-2 px-3 py-2.5 font-body text-xs leading-relaxed text-ink-muted">
        Only an estimate. It cannot tell you whether you will get in.
      </p>
    </div>
  )
}

/** Progress: readiness per subject and an accuracy trend. */
export function ProgressPanel() {
  const subjects = [
    { s: 'Mathematics', p: 48 },
    { s: 'Science', p: 61 },
    { s: 'Reading', p: 55 },
    { s: 'Language', p: 72 },
  ]
  const trend = [38, 42, 41, 47, 52, 50, 57, 61]
  const pts = trend.map((v, i) => `${(i / (trend.length - 1)) * 280 + 10},${70 - (v - 35) * 2}`).join(' ')
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-md border border-subtle bg-surface p-5">
        <p className="font-heading text-sm font-bold text-ink">Readiness by subject</p>
        <ul className="mt-4 space-y-3.5">
          {subjects.map(r => (
            <li key={r.s}>
              <div className="flex justify-between font-body text-xs">
                <span className="text-ink">{r.s}</span>
                <span className="font-semibold tabular-nums text-ink">{r.p}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-pill bg-neutral-soft">
                <div className="h-2 rounded-pill bg-maroon" style={{ width: `${r.p}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col rounded-md border border-subtle bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-heading text-sm font-bold text-ink">Accuracy trend</p>
          <p className="font-body text-xs text-ink-muted">last 8 weeks</p>
        </div>
        <svg viewBox="0 0 300 80" className="mt-4 h-auto w-full text-maroon" aria-hidden="true" preserveAspectRatio="none">
          <path d="M10 70 H290 M10 45 H290 M10 20 H290" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-subtle pt-4 font-body text-xs">
          {[
            ['412', 'answered'],
            ['48s', 'per question'],
            ['6 days', 'streak'],
          ].map(([v, k]) => (
            <div key={k}>
              <p className="font-heading text-base font-bold tabular-nums text-ink">{v}</p>
              <p className="text-ink-muted">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
