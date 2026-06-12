import { Topbar } from '@/components/admin/Topbar'
import { ReportsManager } from '@/components/admin/ReportsManager'

export const dynamic = 'force-dynamic'

export default function ReportsPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Reported Questions" />
      <ReportsManager />
    </div>
  )
}
