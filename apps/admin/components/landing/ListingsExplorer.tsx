'use client'

import { useMemo, useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { ListingCard } from './ListingCard'
import { WEB_APP_URL } from '../../lib/links'

type Course = { courseId: string; name: string; cluster: string }
type Destination = { code: string; name: string; region: string; courseCount: number }
type Tab = 'universities' | 'scholarships' | 'courses' | 'destinations'

type Props = {
  listings: Listing[]
  courses: Course[]
  destinations: Destination[]
}

const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'

// ── Icons (decorative — aria-hidden) ───────────────────────────────────────────

function MagnifierIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#86868b]">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#800000]">
      <path d="M12 4 2 9l10 5 8-4v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11.5V16c0 .9 2.7 2.5 6 2.5s6-1.6 6-2.5v-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#800000]">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
      <path d="M14 5h5v5M19 5l-8 8M11 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Small building blocks ──────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <p className="col-span-full text-center text-[#6e6e73] font-body text-sm py-16">{message}</p>
  )
}

function SectionIntro({
  text,
  href,
  cta,
  ariaLabel,
}: {
  text: string
  href: string
  cta: string
  ariaLabel: string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <p className="text-[#6e6e73] font-body text-sm">{text}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto rounded-full border border-[#800000] text-[#800000] px-4 py-2 text-xs font-semibold font-body hover:bg-[#800000] hover:text-white transition-colors"
      >
        {cta}
        <ExternalIcon />
      </a>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ListingsExplorer({ listings, courses, destinations }: Props) {
  const [tab, setTab] = useState<Tab>('universities')
  const [query, setQuery] = useState('')

  const exams = useMemo(() => listings.filter((l) => l.type === 'exam'), [listings])
  const scholarships = useMemo(() => listings.filter((l) => l.type === 'scholarship'), [listings])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'universities', label: 'Universities', count: exams.length },
    { key: 'scholarships', label: 'Scholarships', count: scholarships.length },
    { key: 'courses', label: 'Courses', count: courses.length },
    { key: 'destinations', label: 'Destinations', count: destinations.length },
  ]

  const q = query.trim().toLowerCase()

  const filteredExams = useMemo(
    () =>
      !q
        ? exams
        : exams.filter(
            (l) =>
              l.title.toLowerCase().includes(q) || (l.provider ?? '').toLowerCase().includes(q),
          ),
    [exams, q],
  )

  const filteredScholarships = useMemo(
    () =>
      !q
        ? scholarships
        : scholarships.filter(
            (l) =>
              l.title.toLowerCase().includes(q) || (l.provider ?? '').toLowerCase().includes(q),
          ),
    [scholarships, q],
  )

  const filteredCourses = useMemo(
    () =>
      !q
        ? courses
        : courses.filter(
            (c) => c.name.toLowerCase().includes(q) || c.cluster.toLowerCase().includes(q),
          ),
    [courses, q],
  )

  const filteredDestinations = useMemo(
    () =>
      !q
        ? destinations
        : destinations.filter(
            (d) => d.name.toLowerCase().includes(q) || d.region.toLowerCase().includes(q),
          ),
    [destinations, q],
  )

  function changeTab(next: Tab) {
    setTab(next)
    setQuery('')
  }

  const placeholder =
    tab === 'universities'
      ? 'Search universities & entrance exams'
      : tab === 'scholarships'
        ? 'Search scholarships'
        : tab === 'courses'
          ? 'Filter courses'
          : 'Filter destinations'

  return (
    <div className="max-w-6xl mx-auto px-6">
      {/* Tab pill bar */}
      <div
        role="tablist"
        aria-label="Explore Iskotify categories"
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      >
        {tabs.map((tt) => {
          const active = tab === tt.key
          return (
            <button
              key={tt.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeTab(tt.key)}
              className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold font-body transition-colors ${
                active
                  ? 'bg-[#800000] text-white'
                  : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
              }`}
            >
              {tt.label} ({tt.count})
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <div className="mt-4 mb-7 flex items-center gap-2.5 bg-white border border-black/[0.07] rounded-2xl px-4 py-3 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
        <MagnifierIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 bg-transparent text-sm text-[#1d1d1f] font-body outline-none placeholder:text-[#86868b]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="flex-shrink-0 text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* ── Tab panels ── */}

      {tab === 'universities' && (
        <div role="tabpanel" className={GRID}>
          {filteredExams.length === 0 ? (
            <EmptyState message="No matches — try different words." />
          ) : (
            filteredExams.map((l) => <ListingCard key={l.id} listing={l} />)
          )}
        </div>
      )}

      {tab === 'scholarships' && (
        <div role="tabpanel" className={GRID}>
          {filteredScholarships.length === 0 ? (
            <EmptyState message="No matches — try different words." />
          ) : (
            filteredScholarships.map((l) => <ListingCard key={l.id} listing={l} />)
          )}
        </div>
      )}

      {tab === 'courses' && (
        <div role="tabpanel">
          <SectionIntro
            text="Explore 100+ college courses by cluster — full details and rankings live in the app."
            href={WEB_APP_URL}
            cta="Open courses in the app"
            ariaLabel="Open courses in the Iskotify app (opens in a new tab)"
          />
          <div className={GRID}>
            {filteredCourses.length === 0 ? (
              <EmptyState message="No courses match — try different words." />
            ) : (
              filteredCourses.map((c) => (
                <div
                  key={c.courseId}
                  className="bg-white border border-black/[0.06] rounded-2xl p-5 flex flex-col gap-3 shadow-[0_2px_16px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-[#800000]/10 flex items-center justify-center">
                    <CapIcon />
                  </div>
                  <h3 className="font-heading font-bold text-[15px] text-[#1d1d1f] leading-snug line-clamp-2">
                    {c.name}
                  </h3>
                  <span className="self-start rounded-full bg-[#fef2f2] text-[#800000] px-2.5 py-1 text-[11px] font-semibold font-body">
                    {c.cluster}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'destinations' && (
        <div role="tabpanel">
          <SectionIntro
            text="See where Filipino graduates are in demand abroad — by country and course cluster."
            href={WEB_APP_URL}
            cta="See destinations in the app"
            ariaLabel="See career destinations in the Iskotify app (opens in a new tab)"
          />
          <div className={GRID}>
            {filteredDestinations.length === 0 ? (
              <EmptyState message="No destinations match — try different words." />
            ) : (
              filteredDestinations.map((d) => (
                <div
                  key={d.code}
                  className="bg-white border border-black/[0.06] rounded-2xl p-5 flex flex-col gap-3 shadow-[0_2px_16px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-[#800000]/10 flex items-center justify-center">
                    <GlobeIcon />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-[15px] text-[#1d1d1f] leading-snug">
                      {d.name}
                    </h3>
                    {d.region && (
                      <p className="text-[12px] text-[#6e6e73] font-body mt-0.5">{d.region}</p>
                    )}
                  </div>
                  {d.courseCount > 0 && (
                    <span className="self-start rounded-full bg-[#fef2f2] text-[#800000] px-2.5 py-1 text-[11px] font-semibold font-body">
                      {d.courseCount} course{d.courseCount === 1 ? '' : 's'} in demand
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
