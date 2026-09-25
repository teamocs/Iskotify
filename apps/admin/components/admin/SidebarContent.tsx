'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { notifyError } from '@/lib/toast'
import { Icon } from '@/components/ui/Icon'
import { HOME_ITEM, NAV_GROUPS, allNavHrefs, findActiveHref, type NavItem } from '@/lib/nav/adminNav'

interface Props {
  userEmail: string
  onItemClick?: () => void
}

// Focus on the dark sidebar uses sidebar-ink: the global maroon ring is ~1.5:1 here.
const FOCUS = 'focus-visible:outline-sidebar-ink'

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-ui transition-colors ${FOCUS} ${
        active
          ? 'bg-sidebar-active font-medium text-sidebar-ink'
          : 'text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink'
      }`}
    >
      <Icon name={item.icon} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function SidebarContent({ userEmail, onItemClick }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const activeHref = findActiveHref(pathname ?? '', allNavHrefs())

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  )

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        notifyError(error.message || 'Sign out failed. Please try again.')
        return
      }
    } catch {
      notifyError('Sign out failed. Please try again.')
      return
    }
    router.push('/login')
  }

  const initials = userEmail.length >= 2 ? userEmail.slice(0, 2).toUpperCase() : (userEmail[0]?.toUpperCase() ?? '?')

  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-sidebar-line px-4">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-maroon-light" />
        <span className="font-heading text-base font-bold tracking-tight text-sidebar-ink">Iskotify</span>
        <span className="text-xs text-sidebar-ink-muted">Admin</span>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-3">
        <NavLink item={HOME_ITEM} active={activeHref === HOME_ITEM.href} onClick={onItemClick} />
        {NAV_GROUPS.map(group => (
          <section key={group.id} aria-labelledby={`nav-${group.id}`} className="mt-4">
            <h2 id={`nav-${group.id}`} className="px-2.5 pb-1 text-xs font-semibold text-sidebar-ink-muted">{group.label}</h2>
            <ul className="space-y-px">
              {group.items.map(item => (
                <li key={item.href}>
                  <NavLink item={item} active={activeHref === item.href} onClick={onItemClick} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-line px-3 py-3">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-maroon font-heading text-xs font-bold text-ink-inverse">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-ink" title={userEmail}>{userEmail}</p>
          <p className="text-xs text-sidebar-ink-muted">Admin</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className={`flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-sidebar-ink-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink ${FOCUS}`}
        >
          <Icon name="logout" size={14} />
          Sign out
        </button>
      </div>
    </>
  )
}
