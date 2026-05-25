// apps/admin/app/admin/flashcards/topics/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddCardButton } from '@/components/admin/AddCardButton'

export const dynamic = 'force-dynamic'

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: topic } = await db
    .from('flashcard_topics')
    .select('id, name, status, subject_id')
    .eq('id', id)
    .single()

  if (!topic) notFound()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', topic.subject_id ?? '')
    .single()

  if (!subject) notFound()

  const { data: cardsRaw } = await db
    .from('flashcards')
    .select('id, question, answer, explanation')
    .eq('topic_id', id)
    .order('created_at')

  const cards = (cardsRaw ?? []) as Array<{
    id: string
    question: string
    answer: string
    explanation: string
  }>

  const topicStatus = topic.status as 'published' | 'draft'

  return (
    <>
      <Topbar title={topic.name} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject!.name, href: `/admin/flashcards/subjects/${topic.subject_id}` },
            { label: topic.name },
          ]} />
          <AddCardButton topicId={id} topicStatus={topicStatus} />
        </div>

        <p className="text-sm text-[#6e6e73]">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>

        {cards.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No cards in this topic yet. Use the &quot;+ Add Card&quot; button to create one.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">Question</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">Answer</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(card => (
                    <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3 text-[#1d1d1f]">{card.question}</td>
                      <td className="px-5 py-3 text-[#374151]">{card.answer}</td>
                      <td className="px-5 py-3 text-[#6e6e73] text-[12px]">{card.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {cards.map(card => (
                <div key={card.id} className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-1">
                  <p className="font-medium text-[#1d1d1f] text-sm">{card.question}</p>
                  <p className="text-sm text-[#374151]">{card.answer}</p>
                  {card.explanation && (
                    <p className="text-xs text-[#6e6e73]">{card.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
