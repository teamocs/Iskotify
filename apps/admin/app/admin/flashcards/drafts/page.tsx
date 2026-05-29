import { DraftsTable } from '@/components/flashcards/DraftsTable'
import Link from 'next/link'

export default function DraftsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Drafts</h1>
          <p className="text-white/50 text-sm mt-1">
            Every unpublished topic. Tag exam slugs and publish to ship to mobile.
          </p>
        </div>
        <Link
          href="/admin/flashcards/import"
          className="rounded-lg bg-[#800000] hover:bg-[#9a0a1f] text-white px-4 py-2 text-sm font-semibold"
        >
          + Import CSV
        </Link>
      </div>

      <DraftsTable />
    </div>
  )
}
