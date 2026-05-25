// apps/admin/app/admin/flashcards/subjects/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddTopicButton } from '@/components/admin/AddTopicButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function statusBadge(status: string) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!subject) notFound()

  const { data: topicsRaw } = await db
    .from('flashcard_topics')
    .select('id, name, status, flashcards (id)')
    .eq('subject_id', id)
    .order('name')

  const topics = (topicsRaw ?? []) as Array<{
    id: string
    name: string
    status: string
    flashcards: { id: string }[]
  }>

  return (
    <>
      <Topbar title={subject.name} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject.name },
          ]} />
          <AddTopicButton subjectId={id} />
        </div>

        <p className="text-sm text-[#6e6e73]">{topics.length} topic{topics.length !== 1 ? 's' : ''}</p>

        {topics.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No topics yet. Use the &quot;+ Add Topic&quot; button to create one.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topic</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map(topic => (
                    <tr key={topic.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/flashcards/topics/${topic.id}`}
                          className="font-medium text-[#1d1d1f] hover:text-[#800000] transition-colors"
                        >
                          {topic.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[#374151]">{topic.flashcards?.length ?? 0}</td>
                      <td className="px-5 py-3">{statusBadge(topic.status)}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/flashcards/subjects/${id}/cards?topic=${topic.id}`}
                          className="text-xs text-[#800000] hover:text-[#a00000] font-medium transition-colors"
                        >
                          View Cards →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {topics.map(topic => (
                <div
                  key={topic.id}
                  className="bg-white border border-[#e5e7eb] rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#1d1d1f]">{topic.name}</p>
                      <p className="text-xs text-[#6e6e73] mt-0.5">{topic.flashcards?.length ?? 0} cards</p>
                      <div className="mt-1">{statusBadge(topic.status)}</div>
                      <Link
                        href={`/admin/flashcards/subjects/${id}/cards?topic=${topic.id}`}
                        className="inline-block mt-2 text-xs font-medium text-[#800000] hover:text-[#a00000]"
                      >
                        View Cards →
                      </Link>
                    </div>
                    <Link
                      href={`/admin/flashcards/topics/${topic.id}`}
                      className="text-[#aeaeb2] text-lg flex-shrink-0 hover:text-[#1d1d1f] transition-colors"
                      aria-label={`Open ${topic.name} topic`}
                    >
                      ›
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
