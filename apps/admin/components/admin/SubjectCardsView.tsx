'use client'

import React from 'react'
import { TopicCardSection } from './TopicCardSection'
import { EmptyState } from '@/components/ui/EmptyState'

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  subjectName: string
  topics: Topic[]
  defaultOpenTopicId?: string
}

export function SubjectCardsView({ subjectId, subjectName, topics, defaultOpenTopicId }: Props) {
  if (topics.length === 0) {
    return (
      <div className="rounded-md border border-subtle bg-surface">
        <EmptyState
          icon="folder"
          title="No topics yet"
          description="Topics group this subject’s cards. Use Add topic above to create the first one."
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {topics.map(topic => (
        <TopicCardSection
          key={topic.id}
          subjectId={subjectId}
          topic={topic}
          defaultOpen={topic.id === defaultOpenTopicId}
          subjectName={subjectName}
        />
      ))}
    </div>
  )
}
