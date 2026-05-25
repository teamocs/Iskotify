// apps/admin/components/admin/Sidebar.tsx
import { SidebarContent } from './SidebarContent'

interface Props {
  userEmail: string
}

export function Sidebar({ userEmail }: Props) {
  return (
    <aside className="hidden md:flex w-[220px] flex-shrink-0 bg-[#1d1d1f] flex-col h-full">
      <SidebarContent userEmail={userEmail} />
    </aside>
  )
}
