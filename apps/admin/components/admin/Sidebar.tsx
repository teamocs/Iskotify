// apps/admin/components/admin/Sidebar.tsx
import { SidebarContent } from './SidebarContent'
import type { NavBadges } from '@/lib/admin/navBadges'

interface Props {
  userEmail: string
  collapsed: boolean
  onToggleCollapsed: () => void
  badges?: Promise<NavBadges>
  lastBadges?: NavBadges
}

/**
 * Desktop sidebar: 232px, or a 56px icon rail. A plain div, not <aside>: the
 * <nav aria-label="Admin"> inside is the landmark, and a complementary region
 * around it would only add a second, meaningless one. Width is the one thing
 * that animates, and not at all under reduced motion.
 */
export function Sidebar({ userEmail, collapsed, onToggleCollapsed, badges, lastBadges }: Props) {
  return (
    <div
      id="admin-sidebar"
      data-state={collapsed ? 'collapsed' : 'expanded'}
      className={`hidden md:flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-sidebar-line bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        collapsed ? 'w-14' : 'w-[232px]'
      }`}
    >
      <SidebarContent userEmail={userEmail} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} badges={badges} lastBadges={lastBadges} />
    </div>
  )
}
