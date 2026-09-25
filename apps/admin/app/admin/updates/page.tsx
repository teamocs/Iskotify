import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { UpdatesView } from '@/components/admin/UpdatesView'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export const dynamic = 'force-dynamic'

export interface AdmissionsUpdate {
  id: string
  report_date: string
  severity: string
  school_slug: string | null
  school_name: string | null
  title: string
  body: string
  action_required: string | null
  event_date: string | null
  event_type: string | null
  sources: string[]
  verified: boolean
  updated_at: string
}

async function getData(): Promise<{ updates: AdmissionsUpdate[]; error: string | null }> {
  const db = createServerClient()
  const { data, error } = await db
    .from('admissions_updates')
    .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
    .order('report_date', { ascending: false })
    .limit(100)
  if (error) return { updates: [], error: error.message }
  return { updates: (data ?? []) as AdmissionsUpdate[], error: null }
}

export default async function UpdatesPage() {
  const { updates, error } = await getData()

  return (
    <>
      <Topbar title="Admissions updates" />
      <PageBody intro="Dated admissions announcements by school: deadlines, exam dates and actions students need to take. The 100 most recent are shown.">
        {error ? (
          <ErrorBanner title="Couldn’t load admissions updates" message={error} />
        ) : (
          <UpdatesView updates={updates} />
        )}
      </PageBody>
    </>
  )
}
