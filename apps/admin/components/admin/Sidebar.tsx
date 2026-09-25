// apps/admin/components/admin/Sidebar.tsx
import { SidebarContent } from './SidebarContent'

interface Props {
  userEmail: string
}

export function Sidebar({ userEmail }: Props) {
  return (
    <aside className="hidden md:flex w-[232px] flex-shrink-0 bg-sidebar flex-col h-full">
      <SidebarContent userEmail={userEmail} />
    </aside>
  )
}
