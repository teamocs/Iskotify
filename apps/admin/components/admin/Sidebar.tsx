// apps/admin/components/admin/Sidebar.tsx
import { SidebarContent } from './SidebarContent'

interface Props {
  userEmail: string
}

export function Sidebar({ userEmail }: Props) {
  return (
    <aside className="hidden md:flex w-[220px] flex-shrink-0 bg-ink flex-col h-full">
      <SidebarContent userEmail={userEmail} />
    </aside>
  )
}
