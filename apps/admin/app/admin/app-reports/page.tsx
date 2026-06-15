import { Topbar } from '@/components/admin/Topbar'
import { AppReportsManager } from '@/components/admin/AppReportsManager'

export const dynamic = 'force-dynamic'

export default function AppReportsPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Bug Reports" />
      <AppReportsManager />
    </div>
  )
}
