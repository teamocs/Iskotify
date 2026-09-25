import { Suspense } from 'react'
import { Topbar } from '@/components/admin/Topbar'
import { DataTablesIndex } from '@/components/admin/DataTablesIndex'
import { Card } from '@/components/ui/Card'

// One index for the reference tables the mobile app syncs. Replaces the 19
// raw /admin/data/* links that used to fill the sidebar.
export default function DataTablesPage() {
  return (
    <>
      <Topbar title="Data tables" />
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <p className="max-w-3xl text-sm text-ink-muted">
          Reference data the mobile app syncs to every phone. Open a table to browse, edit, import or export its rows.
        </p>
        <Card flush>
          {/* The table keeps its search and filters in the URL (useSearchParams). */}
          <Suspense fallback={null}>
            <DataTablesIndex />
          </Suspense>
        </Card>
      </div>
    </>
  )
}
