import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { Screen } from '../../components/ui/Screen'
import { TabHeader } from '../../components/TabHeader'

/**
 * Progress tab — owns readiness and analytics (redesign M1). The dashboard
 * scrolls itself (it has its own pull-to-refresh), so the Screen body doesn't;
 * the large title rides in the dashboard's scroll view and collapses into the
 * Screen's title band, like Today's. The legacy /analytics route redirects here.
 */
export default function ProgressScreen() {
  return (
    <Screen scroll={false} width="wide">
      <AnalyticsDashboard header={<TabHeader title="Progress" eyebrow="This week" />} />
    </Screen>
  )
}
