# Landing Page UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fake trust badges and testimonials, fix elongated pill buttons, and update pricing copy across the four landing-page components in `apps/admin/`.

**Architecture:** Four surgical edits to existing TSX components — no new files, no new dependencies. Tests use `react-dom/server`'s `renderToStaticMarkup` (already a dependency) to verify rendered HTML in Vitest's existing Node environment. All tests live in one new file: `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx`.

**Tech Stack:** Next.js 15.5, React 19, Tailwind CSS, Vitest (node environment), `react-dom/server`

---

## File Map

| File | What changes |
|------|-------------|
| `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` | **Create** — all component tests |
| `apps/admin/components/landing/Hero.tsx` | `rounded-[980px]` → `rounded-xl`; fake stats → pricing strip |
| `apps/admin/components/landing/Testimonials.tsx` | Remove fake reviews; add empty-state + store CTA constants |
| `apps/admin/components/landing/FAQ.tsx` | Update two answer strings |
| `apps/admin/components/landing/FooterCTA.tsx` | `rounded-[980px]` → `rounded-xl`; update tagline |

---

## Task 1: Test scaffold + Hero

**Files:**
- Create: `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx`
- Modify: `apps/admin/components/landing/Hero.tsx`

- [ ] **Step 1: Write the failing Hero tests**

Create `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` with this content.
Note: all four component imports are declared at the top now so that Tasks 2–4 can simply append `describe` blocks without needing new `import` statements.

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Next.js server components aren't available in Vitest's Node env — stub them
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement('img', { alt, src }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { Hero } from '../Hero'
import { Testimonials } from '../Testimonials'
import { FAQ } from '../FAQ'
import { FooterCTA } from '../FooterCTA'

// ─── Hero ───────────────────────────────────────────────────────────────────
describe('Hero', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Hero)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses properly-sized rounded-xl on download buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows one-time price', () => {
    expect(html).toContain('₱129')
  })

  it('shows no-subscription messaging', () => {
    expect(html).toContain('No subscription')
  })

  it('shows early-adopter call-to-action', () => {
    expect(html).toContain('Be among the first')
  })

  it('does not show fake rating stat', () => {
    expect(html).not.toContain('4.8')
  })

  it('does not show fake student count', () => {
    expect(html).not.toContain('10K+')
  })

  it('does not show "Free to Use"', () => {
    expect(html).not.toContain('Free to Use')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: Hero suite — several tests fail (`rounded-[980px]` exists, `4.8` exists, etc.)

- [ ] **Step 3: Update Hero.tsx**

Replace the entire contents of `apps/admin/components/landing/Hero.tsx` with:

```tsx
export function Hero() {
  return (
    <section className="relative bg-[#f5f5f7] overflow-hidden py-16 md:py-24 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-16">

        {/* Left column */}
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs tracking-[0.14em] text-[#800000] font-semibold uppercase mb-4 font-body">
            Para sa mga Iskolar ng Bayan
          </p>
          <h1 className="font-heading font-extrabold text-[#1d1d1f] text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.08] tracking-tight mb-5">
            Your Scholarship &amp; Exam Journey —{' '}
            <span className="text-[#800000]">Made Effortlessly Simple</span>
          </h1>
          <p className="text-[#6e6e73] text-base md:text-lg mb-8 max-w-lg font-body leading-relaxed">
            Join thousands of Filipino students who never miss a scholarship deadline or exam date again.
          </p>

          {/* Download buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start mb-8">
            <a
              href="#download"
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Download on App Store
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z"/>
              </svg>
              Get it on Google Play
            </a>
          </div>

          {/* Social proof strip */}
          <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[#800000]">✓</span>
              <span className="font-medium text-[#1d1d1f] text-sm font-body">One-time ₱129</span>
            </div>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">No subscription</span>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">Be among the first 🎉</span>
          </div>
        </div>

        {/* Right column — 3D phone mockup */}
        <div className="flex-shrink-0 flex justify-center" style={{ perspective: '1000px' }}>
          <div style={{ transform: 'rotateY(-18deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}>
            {/* Phone body */}
            <div className="bg-[#0f0f1a] rounded-[40px] w-[220px] h-[460px] border-[6px] border-[#2a2a3a] shadow-2xl relative overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0f0f1a] rounded-b-[14px] z-10" />

              {/* App screen */}
              <div className="absolute inset-0 bg-[#1a1a2e] flex flex-col pt-7 px-3 pb-2 overflow-hidden">

                {/* Status bar */}
                <div className="flex justify-between items-center px-1 mb-4">
                  <span className="text-white text-[9px] font-semibold font-body">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-white/60" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/60" />
                    <div className="w-3 h-1.5 rounded-[2px] border border-white/60 relative">
                      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/60 rounded-r-sm" />
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <div className="mb-3 px-1">
                  <p className="text-white font-heading font-bold text-sm leading-tight">Good morning! 🌤️</p>
                  <p className="text-white/50 text-[9px] font-body mt-0.5">1 listing in focus</p>
                </div>

                {/* Stat chips */}
                <div className="flex gap-2 mb-3 px-1">
                  <div className="bg-[#800000]/30 border border-[#800000]/50 rounded-[8px] px-2 py-1 flex items-center gap-1">
                    <span className="text-[9px]">🔥</span>
                    <span className="text-white text-[9px] font-body font-medium">5-day streak</span>
                  </div>
                  <div className="bg-white/[0.07] rounded-[8px] px-2 py-1">
                    <span className="text-white/70 text-[9px] font-body">12 sessions</span>
                  </div>
                </div>

                {/* Focus card */}
                <div className="bg-gradient-to-br from-[#800000] to-[#5a0000] rounded-[14px] p-3 mb-3 mx-1">
                  <p className="text-red-200 text-[8px] font-body uppercase tracking-wide mb-1">Your Focus</p>
                  <p className="text-white font-heading font-bold text-xs leading-tight">UPCAT 2026</p>
                  <p className="text-white/60 text-[8px] font-body mt-1">Exam date: Aug 2026</p>
                  <div className="mt-2 h-1 bg-white/10 rounded-full">
                    <div className="h-1 bg-white/50 rounded-full w-[42%]" />
                  </div>
                </div>

                {/* Recommended topics */}
                <div className="px-1 flex-1">
                  <p className="text-white/40 text-[8px] font-body uppercase tracking-wide mb-2">Recommended Topics</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between bg-white/[0.06] rounded-[10px] px-2.5 py-2">
                      <span className="text-white text-[9px] font-body">General Math</span>
                      <div className="w-4 h-4 rounded-full bg-[#800000]/40 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[4px] border-l-white/80 border-y-[3px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/[0.06] rounded-[10px] px-2.5 py-2">
                      <span className="text-white text-[9px] font-body">Science</span>
                      <div className="w-4 h-4 rounded-full bg-[#800000]/40 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[4px] border-l-white/80 border-y-[3px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom nav */}
                <div className="flex justify-around items-center pt-2 pb-1 border-t border-white/[0.08] mt-2">
                  <div className="w-5 h-5 flex flex-col items-center justify-center gap-[2px]">
                    <div className="w-3 h-[2px] bg-[#800000] rounded-full" />
                    <div className="w-3 h-[2px] bg-[#800000] rounded-full" />
                    <div className="w-2 h-[2px] bg-[#800000] rounded-full" />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                </div>
              </div>
            </div>

            {/* Subtle bottom reflection */}
            <div
              className="mx-6 h-8 rounded-b-[30px] opacity-20"
              style={{
                background: 'linear-gradient(to bottom, rgba(128,0,0,0.4), transparent)',
                filter: 'blur(8px)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#800000]/[0.05] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 w-[320px] h-[320px] rounded-full bg-[#800000]/[0.04] blur-2xl" />
    </section>
  )
}
```

- [ ] **Step 4: Run Hero tests to verify they pass**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: Hero suite — all 8 tests pass. Testimonials/FAQ/FooterCTA suites will not exist yet — that is fine.

- [ ] **Step 5: Commit**

```bash
cd apps/admin && git add components/landing/__tests__/landing-overhaul.test.tsx components/landing/Hero.tsx
git commit -m "feat(landing): fix Hero pill buttons and replace fake trust badges with pricing strip"
```

---

## Task 2: Testimonials empty state

**Files:**
- Modify: `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` (append Testimonials suite)
- Modify: `apps/admin/components/landing/Testimonials.tsx`

- [ ] **Step 1: Append Testimonials tests to the test file**

Open `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` and add these lines at the end of the file (all imports are already at the top from Task 1):

```tsx
// ─── Testimonials ───────────────────────────────────────────────────────────
describe('Testimonials', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Testimonials)) })

  it('shows empty-state heading', () => {
    expect(html).toContain('Be the first to review Iskotify')
  })

  it('does not show fake student names', () => {
    expect(html).not.toContain('Maria Santos')
    expect(html).not.toContain('Juan dela Cruz')
    expect(html).not.toContain('Ana Reyes')
  })

  it('has App Store review CTA', () => {
    expect(html).toContain('Leave a review on App Store')
  })

  it('has Google Play review CTA', () => {
    expect(html).toContain('Rate on Google Play')
  })
})
```

- [ ] **Step 2: Run to verify these tests fail**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: Testimonials suite — 4 failures (fake names present, CTAs missing)

- [ ] **Step 3: Replace Testimonials.tsx**

Replace the entire contents of `apps/admin/components/landing/Testimonials.tsx` with:

```tsx
// Replace with live App Store / Google Play review URLs when the app is published
const APP_STORE_REVIEW_URL = '#'
const PLAY_STORE_REVIEW_URL = '#'

export function Testimonials() {
  return (
    <section id="testimonials" className="bg-white py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">
            Student Reviews
          </p>
          <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
            What Students Are Saying
          </h2>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center text-center max-w-md mx-auto py-6">
          <span className="text-5xl mb-5" aria-hidden="true">💬</span>
          <h3 className="font-heading font-bold text-[#1d1d1f] text-xl mb-3">
            Be the first to review Iskotify
          </h3>
          <p className="text-[#6e6e73] font-body text-sm leading-relaxed mb-8">
            Downloaded the app? Share your experience and help other Filipino students discover their scholarship path.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={APP_STORE_REVIEW_URL}
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-black transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Leave a review on App Store
            </a>
            <a
              href={PLAY_STORE_REVIEW_URL}
              className="inline-flex items-center gap-2.5 bg-[#01875f] text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-[#016e4e] transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
              </svg>
              Rate on Google Play
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run Testimonials tests to verify they pass**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: Hero suite (8 pass) + Testimonials suite (4 pass) — 12 tests total pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/landing/__tests__/landing-overhaul.test.tsx apps/admin/components/landing/Testimonials.tsx
git commit -m "feat(landing): replace fake testimonials with empty state and store review CTAs"
```

---

## Task 3: FAQ pricing update

**Files:**
- Modify: `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` (append FAQ suite)
- Modify: `apps/admin/components/landing/FAQ.tsx`

- [ ] **Step 1: Append FAQ tests to the test file**

Add these lines at the end of `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx`:

```tsx
// ─── FAQ ────────────────────────────────────────────────────────────────────
describe('FAQ', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FAQ)) })

  it('shows one-time payment amount', () => {
    expect(html).toContain('₱129')
  })

  it('mentions one-time payment in pricing answer', () => {
    expect(html).toContain('one-time payment')
  })

  it('does not say the app is completely free', () => {
    expect(html).not.toContain('completely free')
  })

  it('does not say "for free" in download answer', () => {
    expect(html).not.toContain('for free')
  })
})
```

- [ ] **Step 2: Run to verify these tests fail**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: FAQ suite — 4 failures ("completely free" present, ₱129 missing, etc.)

- [ ] **Step 3: Update the two FAQ answers in FAQ.tsx**

In `apps/admin/components/landing/FAQ.tsx`, replace the `faqs` array with:

```ts
const faqs: FAQItem[] = [
  {
    question: 'Is Iskotify free to use?',
    answer:
      'Iskotify is available for a one-time payment of ₱129 — no subscription, no hidden fees. Pay once and get lifetime access to all scholarships, exam content, and AI coach features.',
  },
  {
    question: 'Which scholarships are listed?',
    answer:
      'We list CHED, DOST, GSIS, and hundreds of private scholarships. Updated weekly from official sources so you always have the latest information.',
  },
  {
    question: 'Which exams does it cover?',
    answer:
      'UPCAT, ACET, DCAT, USTET, AdMU ACET, and more. New exams are added regularly based on student demand.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. We use industry-standard encryption for all data in transit and at rest. We never sell your personal data to third parties.',
  },
  {
    question: 'Is it available on iOS and Android?',
    answer:
      'Yes! Iskotify is fully optimized for iOS 15+ and Android 10+. Available on the App Store and Google Play.',
  },
]
```

- [ ] **Step 4: Run FAQ tests to verify they pass**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: Hero (8) + Testimonials (4) + FAQ (4) — 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/landing/__tests__/landing-overhaul.test.tsx apps/admin/components/landing/FAQ.tsx
git commit -m "feat(landing): update FAQ pricing to one-time ₱129 payment"
```

---

## Task 4: FooterCTA button fix + tagline

**Files:**
- Modify: `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx` (append FooterCTA suite)
- Modify: `apps/admin/components/landing/FooterCTA.tsx`

- [ ] **Step 1: Append FooterCTA tests to the test file**

Add these lines at the end of `apps/admin/components/landing/__tests__/landing-overhaul.test.tsx`:

```tsx
// ─── FooterCTA ──────────────────────────────────────────────────────────────
describe('FooterCTA', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FooterCTA)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses rounded-xl on download buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows ₱129 in tagline', () => {
    expect(html).toContain('₱129')
  })

  it('shows lifetime access in tagline', () => {
    expect(html).toContain('Lifetime access')
  })

  it('does not say "Free forever"', () => {
    expect(html).not.toContain('Free forever')
  })
})
```

- [ ] **Step 2: Run to verify these tests fail**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: FooterCTA suite — 5 failures (`rounded-[980px]` present, "Free forever" present, ₱129 missing)

- [ ] **Step 3: Update FooterCTA.tsx**

Replace the entire contents of `apps/admin/components/landing/FooterCTA.tsx` with:

```tsx
import Image from 'next/image'
import Link from 'next/link'

export function FooterCTA() {
  return (
    <>
      {/* Download CTA section */}
      <section
        id="download"
        className="relative bg-gradient-to-br from-[#800000] via-[#9a0000] to-[#5a0000] py-20 px-6 overflow-hidden"
      >
        {/* Decorative background circles */}
        <div className="pointer-events-none absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-1/3 w-80 h-80 rounded-full bg-white/[0.03] blur-3xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            {/* Text + buttons */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="font-heading font-extrabold text-white text-3xl md:text-4xl lg:text-5xl leading-tight mb-4">
                Start Your Scholarship Journey Today
              </h2>
              <p className="text-red-200 font-body text-base mb-8">
                One-time ₱129 · Lifetime access · No subscription ever.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <a
                  href="#"
                  className="inline-flex items-center gap-2.5 bg-white text-[#1d1d1f] rounded-xl px-6 py-3 text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  Download on App Store
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2.5 bg-white text-[#1d1d1f] rounded-xl px-6 py-3 text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
                  </svg>
                  Get it on Google Play
                </a>
              </div>
            </div>

            {/* Kuya Baw mascot */}
            <div className="flex-shrink-0">
              <Image
                src="/kuya-baw-mascot.svg"
                alt="Kuya Baw"
                width={120}
                height={120}
                className="drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#5a0000] border-t border-white/10 px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Iskotify" width={20} height={20} />
            <span className="text-white/60 font-body text-sm">© 2026 Iskotify. All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Terms of Service
            </Link>
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd apps/admin && npx vitest run components/landing/__tests__/landing-overhaul.test.tsx --reporter=verbose
```

Expected: All 21 tests pass (Hero 8, Testimonials 4, FAQ 4, FooterCTA 5).

- [ ] **Step 5: Run the full admin test suite to check for regressions**

```bash
cd apps/admin && npx vitest run --reporter=verbose
```

Expected: All existing tests pass, plus the 21 new landing tests.

- [ ] **Step 6: TypeScript check**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/landing/__tests__/landing-overhaul.test.tsx apps/admin/components/landing/FooterCTA.tsx
git commit -m "feat(landing): fix FooterCTA pill buttons and update tagline to one-time pricing"
```
