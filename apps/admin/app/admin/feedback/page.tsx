import { Topbar } from '@/components/admin/Topbar'
import { FeedbackManager } from '@/components/admin/FeedbackManager'

export const dynamic = 'force-dynamic'

export default function FeedbackPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Feedback" />
      <FeedbackManager />
    </div>
  )
}
