import { notFound } from 'next/navigation'
import { DATA_TABLE_MAP } from '@/lib/dataTables'
import { DataTableManager } from '@/components/admin/DataTableManager'
import { Topbar } from '@/components/admin/Topbar'

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
      <DataTableManager config={config} />
    </div>
  )
}
