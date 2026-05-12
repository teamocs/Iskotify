'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const NAV = [
  {
    section: 'LISTINGS',
    items: [
      { href: '/admin/listings', icon: '📋', label: 'All Listings' },
      { href: '/admin/listings?type=scholarship', icon: '🎓', label: 'Scholarships' },
      { href: '/admin/listings?type=exam', icon: '📝', label: 'Exams' }
    ]
  },
  {
    section: 'SYNC',
    items: [
      { href: '/admin/sync', icon: '📄', label: 'Sync Logs' }
    ]
  },
  {
    section: 'FLASHCARDS',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Subjects', disabled: true },
      { href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF', disabled: true }
    ]
  }
]

interface Props {
  userEmail: string
}

export function Sidebar({ userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#1d1d1f] flex flex-col h-full">
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
              const active = pathname === href || pathname.startsWith(href + '?')
              return (
                <Link
                  key={href}
                  href={disabled ? '#' : href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-colors text-sm ${
                    disabled
                      ? 'opacity-30 cursor-not-allowed'
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
          <button onClick={handleSignOut} className="text-white/30 hover:text-white/70 text-xs transition-colors" title="Sign out">
            ↩
          </button>
        </div>
      </div>
    </aside>
  )
}
