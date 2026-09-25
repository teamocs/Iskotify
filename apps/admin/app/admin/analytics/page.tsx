import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PostHogDashboardForm } from '@/components/admin/PostHogDashboardForm'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

async function getDashboardUrl(): Promise<string> {
  try {
    const db = createServerClient()
    const { data } = await db
      .from('app_config')
      .select('value')
      .eq('key', 'posthog_dashboard_url')
      .maybeSingle()
    return (data?.value ?? '') as string
  } catch {
    return ''
  }
}

export default async function AnalyticsPage() {
  const dashboardUrl = await getDashboardUrl()

  return (
    <>
      <Topbar title="Analytics" />
      <PageBody intro="Live usage from the Iskotify app and web mirror, powered by PostHog.">
        {dashboardUrl ? (
          <Card flush>
            <iframe
              src={dashboardUrl}
              title="PostHog dashboard"
              className="block w-full border-0"
              style={{ height: '78vh' }}
              allow="fullscreen"
            />
          </Card>
        ) : (
          <Card title="No dashboard linked yet">
            <ol className="list-decimal list-inside space-y-1 text-ui text-ink-muted">
              <li>Create a free PostHog account and project, then set the app keys (see the app&apos;s .env).</li>
              <li>In PostHog, build a dashboard, open <span className="font-medium text-ink">Share</span>, enable sharing, and copy the embed/share URL.</li>
              <li>Paste it below — it appears here for the whole team, no redeploy needed.</li>
            </ol>
          </Card>
        )}

        {/* Embed-link config (stored in app_config, no redeploy needed) */}
        <PostHogDashboardForm currentUrl={dashboardUrl} />

        <p className="text-xs text-ink-muted">
          Full insights, funnels, and retention live in your PostHog project. This page embeds one shared dashboard for quick team access.
        </p>
      </PageBody>
    </>
  )
}
