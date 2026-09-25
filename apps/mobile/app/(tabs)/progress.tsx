import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { Screen } from '../../components/ui/Screen'
import { TabHeader } from '../../components/TabHeader'

/**
 * Progress tab — owns readiness and analytics (redesign M1). The dashboard
 * scrolls itself (it has its own pull-to-refresh), so the Screen body doesn't.
 * The legacy /analytics route redirects here.
 */
export default function ProgressScreen() {
  return (
    <Screen
      scroll={false}
      width="wide"
      header={<TabHeader title="Progress" subtitle="How your practice is going, over time" />}
    >
      <AnalyticsDashboard />
    </Screen>
  )
}
