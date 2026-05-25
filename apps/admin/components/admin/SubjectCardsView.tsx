'use client'

import React from 'react'
import { TopicCardSection } from './TopicCardSection'

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  topics: Topic[]
  defaultOpenTopicId?: string
}

export function SubjectCardsView({ subjectId, topics, defaultOpenTopicId }: Props) {
  if (topics.length === 0) {
    return (
      <div className="text-center py-16 text-[#6e6e73] text-sm">
        No topics yet. Use the &quot;+ Add Topic&quot; button to create one.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {topics.map(topic => (
        <TopicCardSection
          key={topic.id}
          subjectId={subjectId}
          topic={topic}
          defaultOpen={topic.id === defaultOpenTopicId}
        />
      ))}
    </div>
  )
}
