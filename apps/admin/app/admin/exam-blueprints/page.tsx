import Link from 'next/link'
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { BlueprintsTable, type BlueprintRow } from '@/components/admin/BlueprintsTable'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

export const dynamic = 'force-dynamic'

async function getBlueprints(): Promise<{ rows: BlueprintRow[]; error: string | null }> {
  const db = createServerClient()
  const { data, error } = await db.from('exam_blueprints').select('*').order('display_order')
  return { rows: (data ?? []) as BlueprintRow[], error: error?.message ?? null }
}

export default async function ExamBlueprintsPage() {
  const { rows, error } = await getBlueprints()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar
        title="Exam Blueprints"
        actions={
          <Link href="/admin/exam-blueprints/new" className={buttonClass({ variant: 'primary', size: 'sm' })}>
            <Icon name="plus" />
            New blueprint
          </Link>
        }
      />
      <PageBody intro="Sections, timing, scoring mechanics and course notes for each mock exam." width="wide">
        {error ? (
          <ErrorBanner title="Couldn’t load exam blueprints" message={error} />
        ) : (
          <BlueprintsTable blueprints={rows} />
        )}
      </PageBody>
    </div>
  )
}
