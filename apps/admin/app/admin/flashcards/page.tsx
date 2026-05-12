import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const { data: subjects } = await db
    .from('flashcard_subjects')
    .select(`
      id,
      name,
      flashcard_topics (
        id,
        name,
        status,
        flashcards (id, status)
      )
    `)
    .order('name')
  return subjects ?? []
}

type Subject = Awaited<ReturnType<typeof getData>>[number]

function statusBadge(status: string) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

export default async function FlashcardsPage() {
  const subjects = await getData()

  return (
    <>
      <Topbar title="Knowledge Base" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#6e6e73]">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
          <div className="flex gap-2">
            <Link
              href="/admin/flashcards/new"
              className="px-3 py-1.5 text-xs font-semibold border border-[#d1d5db] rounded-lg text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
            >
              + Add manually
            </Link>
            <Link
              href="/admin/flashcards/upload"
              className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
            >
              Upload PDF
            </Link>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No subjects yet. Upload a PDF or add cards manually.
          </div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Subject</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topics</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject) => {
                  const topics = (subject.flashcard_topics ?? []) as Array<{ id: string; name: string; status: string; flashcards: Array<{ id: string; status: string }> }>
                  const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
                  const hasPublished = topics.some(t => t.status === 'published')
                  const overallStatus = hasPublished ? 'published' : 'draft'
                  return (
                    <tr key={subject.id} className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-5 py-3 font-medium text-[#1d1d1f]">{subject.name}</td>
                      <td className="px-5 py-3 text-[#374151]">{topics.length}</td>
                      <td className="px-5 py-3 text-[#374151]">{totalCards}</td>
                      <td className="px-5 py-3">{statusBadge(overallStatus)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
