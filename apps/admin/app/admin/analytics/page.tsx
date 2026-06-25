import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PostHogDashboardForm } from '@/components/admin/PostHogDashboardForm'

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
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Product analytics</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">
            Live usage from the Iskotify app &amp; web mirror, powered by PostHog.
          </p>
        </div>

        {dashboardUrl ? (
          <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
            <iframe
              src={dashboardUrl}
              title="PostHog dashboard"
              className="w-full"
              style={{ height: '78vh', border: 'none' }}
              allow="fullscreen"
            />
          </div>
        ) : (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
            <p className="text-[13px] font-semibold text-amber-800">No dashboard linked yet</p>
            <ol className="list-decimal list-inside text-[13px] text-amber-800 space-y-1">
              <li>Create a free PostHog account and project, then set the app keys (see the app&apos;s .env).</li>
              <li>In PostHog, build a dashboard, open <span className="font-medium">Share</span>, enable sharing, and copy the embed/share URL.</li>
              <li>Paste it below — it appears here for the whole team, no redeploy needed.</li>
            </ol>
          </div>
        )}

        {/* Embed-link config (stored in app_config, no redeploy needed) */}
        <PostHogDashboardForm currentUrl={dashboardUrl} />

        <p className="text-[12px] text-[#aeaeb2]">
          Full insights, funnels, and retention live in your PostHog project. This page embeds one shared dashboard for quick team access.
        </p>
      </div>
    </>
  )
}
