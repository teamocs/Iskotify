import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { UpdatesView } from '@/components/admin/UpdatesView'

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

async function getData(): Promise<AdmissionsUpdate[]> {
  const db = createServerClient()
  const { data } = await db
    .from('admissions_updates')
    .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
    .order('report_date', { ascending: false })
    .limit(100)
  return (data ?? []) as AdmissionsUpdate[]
}

export default async function UpdatesPage() {
  const updates = await getData()

  return (
    <>
      <Topbar title="Admissions Updates" />
      <UpdatesView updates={updates} />
    </>
  )
}
