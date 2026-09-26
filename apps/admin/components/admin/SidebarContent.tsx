'use client'

import Link from 'next/link'
import { Suspense, use, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { notifyError } from '@/lib/toast'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'
import { HOME_ITEM, NAV_GROUPS, allNavHrefs, findActiveHref, type NavItem } from '@/lib/nav/adminNav'
import { formatBadgeCount, toggleShortcutKeys } from '@/lib/nav/sidebarState'
import type { NavBadges } from '@/lib/admin/navBadges'
import { useRailTooltip } from './RailTooltip'

interface Props {
  userEmail: string
  /** Desktop icon rail. The mobile drawer is always expanded. */
  collapsed?: boolean
  /** Open-queue counts, streamed from the layout; the nav renders without them until they land. */
  badges?: Promise<NavBadges>
  /**
   * The last counts that resolved. Shown while a newer promise is pending
   * (router.refresh re-runs the layout), so badges never flash away.
   */
  lastBadges?: NavBadges
  onItemClick?: () => void
  /** Renders the collapse control (desktop only). */
  onToggleCollapsed?: () => void
  /** Renders a close button (mobile drawer only). */
  onClose?: () => void
}

const NO_BADGES: NavBadges = {}
const ITEM = 'relative flex h-8 items-center rounded-sm text-ui transition-colors duration-150'

// Server snapshot is "not Mac", so hydration matches; Mac users see ⌘ right after.
const subscribeNoop = () => () => {}
function useIsMac() {
  return useSyncExternalStore(subscribeNoop, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false)
}

function NavLink({ item, active, count, collapsed, onClick }: {
  item: NavItem; active: boolean; count: number | undefined; collapsed: boolean; onClick?: () => void
}) {
  const badge = formatBadgeCount(count)
  const waiting = badge ? `${count} waiting` : null
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-rail-tip={collapsed ? item.label : undefined}
      data-rail-hint={collapsed && waiting ? waiting : undefined}
      className={`${ITEM} ${collapsed ? 'mx-auto w-10 justify-center' : 'gap-2.5 px-2.5'} ${
        active
          ? 'bg-sidebar-active font-semibold text-sidebar-ink'
          : 'text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink'
      }`}
    >
      <Icon name={item.icon} className={active ? 'text-maroon' : undefined} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
      {badge && (collapsed ? (
        <span aria-hidden="true" className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-maroon ring-2 ring-sidebar" />
      ) : (
        <span aria-hidden="true" className="rounded-pill bg-neutral-soft px-1.5 text-xs font-medium tabular-nums leading-5 text-sidebar-ink-muted">
          {badge}
        </span>
      ))}
      {waiting && <span className="sr-only">, {waiting}</span>}
    </Link>
  )
}

function NavList({ badges, collapsed, onItemClick }: { badges: NavBadges; collapsed: boolean; onItemClick?: () => void }) {
  const pathname = usePathname()
  const activeHref = findActiveHref(pathname ?? '', allNavHrefs())
  const link = (item: NavItem) => (
    <li key={item.href}>
      <NavLink item={item} active={activeHref === item.href} count={badges[item.href]} collapsed={collapsed} onClick={onItemClick} />
    </li>
  )
  return (
    <>
      <ul className="space-y-px">{link(HOME_ITEM)}</ul>
      {NAV_GROUPS.map(group => (
        <section
          key={group.id}
          aria-labelledby={`nav-${group.id}`}
          className={collapsed ? 'mx-2 mt-2 border-t border-sidebar-line pt-2' : 'mt-5'}
        >
          <h2
            id={`nav-${group.id}`}
            className={collapsed ? 'sr-only' : 'px-2.5 pb-1.5 text-xs font-medium text-sidebar-ink-muted'}
          >
            {group.label}
          </h2>
          <ul className="space-y-px">{group.items.map(link)}</ul>
        </section>
      ))}
    </>
  )
}

function StreamedNavList({ badges, ...rest }: { badges: Promise<NavBadges>; collapsed: boolean; onItemClick?: () => void }) {
  return <NavList badges={use(badges)} {...rest} />
}

/** Marks the nav's scroll edges so CSS can fade them: "more above/below" without a scrollbar. */
function useOverflowEdges(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const above = el.scrollTop > 1
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      const v = above && below ? 'both' : above ? 'above' : below ? 'below' : null
      if (v) el.dataset.overflow = v
      else delete el.dataset.overflow
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', update); ro?.disconnect() }
  }, [ref])
}

export function SidebarContent({ userEmail, collapsed = false, badges, lastBadges = NO_BADGES, onItemClick, onToggleCollapsed, onClose }: Props) {
  const router = useRouter()
  const isMac = useIsMac()
  const shortcut = toggleShortcutKeys(isMac)
  const navRef = useRef<HTMLElement>(null)
  const rail = useRailTooltip(collapsed)
  useOverflowEdges(navRef)

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
  const listProps = { collapsed, onItemClick }

  return (
    <div className="flex h-full min-w-0 flex-col" {...rail.handlers}>
      <div className={`flex h-[52px] shrink-0 items-center border-b border-sidebar-line ${collapsed ? 'justify-center' : 'gap-2.5 px-3.5'}`}>
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-maroon font-heading text-sm font-bold text-ink-inverse">
          I
        </span>
        {collapsed ? (
          <span className="sr-only">Iskotify Admin</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">
              <span translate="no" className="font-heading text-base font-semibold tracking-tight text-sidebar-ink">Iskotify</span>{' '}
              <span className="text-xs text-sidebar-ink-muted">Admin</span>
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-sm text-sidebar-ink-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink"
              >
                <Icon name="x" />
              </button>
            )}
          </>
        )}
      </div>

      <nav
        ref={navRef}
        aria-label="Admin"
        onScroll={rail.hide}
        data-rail={collapsed ? '' : undefined}
        className={`sidebar-scroll flex-1 py-3 ${collapsed ? '' : 'pl-2'}`}
      >
        <div>
          {badges ? (
            <Suspense fallback={<NavList badges={lastBadges} {...listProps} />}>
              <StreamedNavList badges={badges} {...listProps} />
            </Suspense>
          ) : (
            <NavList badges={lastBadges} {...listProps} />
          )}
        </div>
      </nav>

      {onToggleCollapsed && (
        <div className={`shrink-0 border-t border-sidebar-line py-2 ${collapsed ? 'px-1' : 'px-2'}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            // A toggle, not a disclosure: the nav stays visible either way.
            // One stable name; pressed = the rail is on.
            aria-label="Collapse sidebar"
            aria-pressed={collapsed}
            aria-controls="admin-sidebar"
            aria-keyshortcuts="Control+B Meta+B"
            data-rail-tip={collapsed ? 'Collapse sidebar' : undefined}
            data-rail-hint={collapsed ? shortcut.join(' ') : undefined}
            className={`${ITEM} text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink ${
              collapsed ? 'mx-auto w-10 justify-center' : 'w-full gap-2.5 px-2.5'
            }`}
          >
            <Icon name="panel-left" />
            {!collapsed && (
              <>
                <span className="flex-1 whitespace-nowrap text-left">Collapse</span>
                <span aria-hidden="true" className="flex items-center gap-0.5">
                  <Kbd>{shortcut[0]}</Kbd>
                  <Kbd>{shortcut[1]}</Kbd>
                </span>
              </>
            )}
          </button>
        </div>
      )}

      <div className={`flex shrink-0 items-center border-t border-sidebar-line py-3 ${collapsed ? 'flex-col gap-2 px-1' : 'gap-2.5 px-3'}`}>
        <span
          data-rail-tip={collapsed ? userEmail : undefined}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-maroon font-heading text-xs font-bold text-ink-inverse"
        >
          <span aria-hidden="true">{initials}</span>
          {collapsed && <span className="sr-only">Signed in as {userEmail}</span>}
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-sidebar-ink">{userEmail}</p>
            <p className="text-xs text-sidebar-ink-muted">Admin</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          data-rail-tip={collapsed ? 'Sign out' : undefined}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-sm text-xs text-sidebar-ink-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink ${
            collapsed ? 'w-10 justify-center' : 'px-2'
          }`}
        >
          <Icon name="logout" size={14} />
          {collapsed ? <span className="sr-only">Sign out</span> : 'Sign out'}
        </button>
      </div>

      {rail.tooltip}
    </div>
  )
}
