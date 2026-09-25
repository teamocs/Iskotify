import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DATA_TABLE_MAP } from '@/lib/dataTables'
import { DataTableManager } from '@/components/admin/DataTableManager'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ table: string }>
}

export default async function DataTablePage({ params }: Props) {
  const { table } = await params
  const config = DATA_TABLE_MAP[table]
  if (!config) notFound()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title={config.label} />
      <PageBody
        intro={
          <>
            {config.helpText ?? `Rows in the ${config.table} reference table.`}{' '}
            <Link href={`/admin/guide#${config.table}`} className="font-medium text-maroon underline-offset-2 hover:underline">
              Read the guide
            </Link>
          </>
        }
      >
        <DataTableManager config={config} />
      </PageBody>
    </div>
  )
}
