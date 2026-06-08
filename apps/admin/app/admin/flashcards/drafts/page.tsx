import Link from 'next/link'
import { Topbar } from '@/components/admin/Topbar'
import { DraftsTable } from '@/components/flashcards/DraftsTable'

export default function DraftsPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Drafts" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">
                Unpublished topics
              </h2>
              <p className="text-[#6e6e73] text-sm mt-1">
                Every topic with <code className="mx-0.5 px-1.5 py-0.5 rounded bg-[#f5f5f7] text-[12px]">status=&apos;draft&apos;</code> across all sources.
                Tag exam/scholarship slugs and publish to ship the cards to mobile users.
              </p>
            </div>
            <Link
              href="/admin/upcat/import"
              className="inline-flex items-center rounded-[980px] bg-[#800000] hover:bg-[#9a0a1f] text-white px-4 py-2 text-sm font-semibold shadow-sm whitespace-nowrap"
            >
              + Import CSV
            </Link>
          </div>

          <DraftsTable />
        </div>
      </div>
    </div>
  )
}
