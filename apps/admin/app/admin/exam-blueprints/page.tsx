import Link from 'next/link'
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'

export const dynamic = 'force-dynamic'

interface Blueprint {
  slug: string
  name: string
  acronym: string
  total_items: number
  total_time_minutes: number
  status: string
  display_order: number
}

async function getBlueprints(): Promise<Blueprint[]> {
  const db = createServerClient()
  const { data } = await db.from('exam_blueprints').select('*').order('display_order')
  return (data ?? []) as Blueprint[]
}

export default async function ExamBlueprintsPage() {
  const blueprints = await getBlueprints()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Exam Blueprints" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Exam Blueprints</h2>
              <p className="text-[#6e6e73] text-sm mt-1">
                Manage exam blueprints, sections, scoring mechanics, and course notes.
              </p>
            </div>
            <Link
              href="/admin/exam-blueprints/new"
              className="inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold bg-[#800000] text-white hover:bg-[#9a0a1f] transition-colors shadow-sm"
            >
              + New blueprint
            </Link>
          </div>

          {blueprints.length === 0 ? (
            <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7] px-6 py-10 text-center">
              <p className="text-[#6e6e73] text-sm">No blueprints yet.</p>
              <Link
                href="/admin/exam-blueprints/new"
                className="mt-3 inline-flex items-center text-[#800000] text-sm font-medium hover:underline"
              >
                Create your first blueprint
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/[0.08] bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f5f7] border-b border-black/[0.08]">
                  <tr>
                    <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Exam</th>
                    <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Acronym</th>
                    <th className="text-right px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Items</th>
                    <th className="text-right px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Minutes</th>
                    <th className="text-center px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {blueprints.map((bp) => (
                    <tr key={bp.slug} className="hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1d1d1f]">{bp.name}</td>
                      <td className="px-4 py-3 text-[#6e6e73] font-mono text-xs">{bp.acronym}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3a3a3c]">{bp.total_items}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3a3a3c]">{bp.total_time_minutes}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          bp.status === 'published'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-[#f5f5f7] text-[#6e6e73]'
                        }`}>
                          {bp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/exam-blueprints/${bp.slug}`}
                          className="text-[#800000] text-xs font-medium hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
