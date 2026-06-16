'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const NAV: { section: string; items: { href: string; icon: string; label: string; disabled?: boolean }[] }[] = [
  {
    section: 'LISTINGS',
    items: [
      { href: '/admin/listings', icon: '📋', label: 'All Listings' },
      { href: '/admin/listings/courses', icon: '🎓', label: 'Course Tags' },
    ],
  },
  {
    section: 'UPDATES',
    items: [{ href: '/admin/updates', icon: '📣', label: 'Admissions Updates' }],
  },
  {
    section: 'SYNC',
    items: [{ href: '/admin/sync', icon: '📄', label: 'Sync Logs' }],
  },
  {
    section: 'KNOWLEDGEBASE',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Knowledgebase' },
      { href: '/admin/upcat/import', icon: '📥', label: 'Import CSV' },
      { href: '/admin/flashcards/drafts', icon: '📝', label: 'Drafts' },
      { href: '/admin/exam-blueprints', icon: '🧭', label: 'Exam Blueprints' },
    ],
  },
  {
    section: 'AI',
    items: [
      { href: '/admin/ai-config', icon: '🤖', label: 'AI Chat Config' },
    ],
  },
  {
    section: 'MODERATION',
    items: [
      { href: '/admin/reports', icon: '🚩', label: 'Reported Questions' },
      { href: '/admin/app-reports', icon: '🐞', label: 'Bug Reports' },
      { href: '/admin/feedback', icon: '💬', label: 'Feedback' },
    ],
  },
  {
    section: 'USERS',
    items: [
      { href: '/admin/early-access', icon: '✉️', label: 'Early Access' },
      { href: '/admin/users', icon: '👤', label: 'Users' },
    ],
  },
  {
    section: 'DATA MANAGER',
    items: [
      { href: '/admin/data/career_courses', icon: '📚', label: 'Career Courses' },
      { href: '/admin/data/career_facts', icon: '💡', label: 'Career Facts' },
      { href: '/admin/data/ai_career_impact', icon: '🤖', label: 'AI Career Impact' },
      { href: '/admin/data/career_destinations', icon: '✈️', label: 'Career Destinations' },
      { href: '/admin/data/career_countries', icon: '🌏', label: 'Career Countries' },
      { href: '/admin/data/career_programs', icon: '🎓', label: 'Career Programs' },
      { href: '/admin/data/tertiary_schools', icon: '🏫', label: 'Tertiary Schools' },
      { href: '/admin/data/university_profiles', icon: '🏛️', label: 'University Profiles' },
      { href: '/admin/data/course_school_rankings', icon: '🏆', label: 'Course Rankings' },
      { href: '/admin/data/course_school_quality', icon: '⭐', label: 'Course Quality' },
      { href: '/admin/data/bar_results', icon: '⚖️', label: 'Bar Results' },
      { href: '/admin/data/upcat_cutoffs', icon: '📊', label: 'UPCAT Cutoffs' },
      { href: '/admin/data/upcat_facts', icon: '❓', label: 'UPCAT Facts' },
    ],
  },
]

interface Props {
  userEmail: string
  onItemClick?: () => void
}

export function SidebarContent({ userEmail, onItemClick }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = userEmail.length >= 2 ? userEmail.slice(0, 2).toUpperCase() : (userEmail[0]?.toUpperCase() ?? '?')

  return (
    <>
      <div className="px-4 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full bg-[#800000] shadow-[0_0_8px_rgba(128,0,0,0.6)]" />
          <span className="font-heading font-extrabold text-white text-[1.05rem] tracking-tight">Iskotify</span>
        </div>
        <p className="text-[10px] text-white/30 font-medium tracking-widest uppercase pl-0.5">Admin Console</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ section, items }) => (
          <div key={section} className="px-2 py-2 border-b border-white/[0.05]">
            <p className="text-[9px] font-semibold tracking-[0.1em] uppercase text-white/25 px-2 mb-1">{section}</p>
            {items.map(({ href, icon, label, disabled }) => {
              const active = !disabled && (pathname === href || pathname.startsWith(href + '?'))
              return (
                <Link
                  key={href}
                  href={disabled ? '#' : href}
                  onClick={disabled ? undefined : onItemClick}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-colors text-sm ${
                    disabled
                      ? 'opacity-30 cursor-not-allowed text-white/70'
                      : active
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/70 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="text-base w-5 text-center">{icon}</span>
                  <span className="flex-1">{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#800000] flex items-center justify-center text-white text-[10px] font-bold font-heading flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/80 font-medium truncate">{userEmail}</p>
            <p className="text-[9px] text-white/35">Super Admin</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-white/30 hover:text-white/70 text-xs transition-colors"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </>
  )
}
