import React from 'react'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import * as schema from '../../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../../db/client'
import type { DrizzleClient } from '../../../db/client'
import TopicQuiz from '../[topicId]'
import DeckQuiz from '../deck/[deckId]'
import ListingQuiz from '../listing/[slug]'

// Logic audit A6: a quiz must never serve an unpublished (draft/archived) card
// — the Practice list already hid them, but the quiz screens queried every row.

const mockParams = { value: {} as Record<string, string | undefined> }
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: ({ questions }: any) => {
    const { Text } = require('react-native')
    return <Text testID="exam">{`exam:${questions.map((q: any) => q.id).sort().join(',')}`}</Text>
  },
}))

let mockDb: DrizzleClient
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDb }))

function seed() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  raw.prepare("INSERT INTO subjects (id, name) VALUES ('s1', 'Math')").run()
  raw.prepare("INSERT INTO topics (id, name, subject_id, status) VALUES ('t1', 'Algebra', 's1', 'published')").run()
  const card = raw.prepare(
    `INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs, options, correct_answer_index, status, ai_enhanced_at)
     VALUES (?, 't1', ?, 'a', 'e', ?, '["a","b","c","d"]', 0, ?, ?)`,
  )
  card.run('pub1', 'Question one', '["upcat"]', 'published', Date.now())
  card.run('pub2', 'Question two', '["upcat"]', 'published', Date.now())
  card.run('draft1', 'Question three', '["upcat"]', 'draft', Date.now())
  card.run('other', 'Question four', '["acet"]', 'published', Date.now())
  raw.prepare("INSERT INTO saved_decks (id, name, topic_ids, created_at) VALUES ('d1', 'Deck', '[\"t1\"]', 1)").run()
  return db
}

async function startQuick() {
  await act(async () => {})
  fireEvent.press(within(screen.getByTestId('chooser-recommended')).getByRole('button', { name: /Start quick set/ }))
}

describe('quiz screens serve published cards only', () => {
  beforeEach(() => { mockDb = seed() })

  it('topic quiz', async () => {
    mockParams.value = { topicId: 't1' }
    render(<TopicQuiz />)
    await startQuick()
    expect(screen.getByTestId('exam').props.children).not.toContain('draft1')
    expect(screen.getByTestId('exam').props.children).toContain('pub1')
  })

  it('saved-deck quiz', async () => {
    mockParams.value = { deckId: 'd1' }
    render(<DeckQuiz />)
    await startQuick()
    expect(screen.getByTestId('exam').props.children).not.toContain('draft1')
    expect(screen.getByTestId('exam').props.children).toContain('pub2')
  })

  it('listing review quiz (also scoped to the listing slug)', async () => {
    mockParams.value = { slug: 'upcat' }
    render(<ListingQuiz />)
    await startQuick()
    expect(screen.getByTestId('exam').props.children).toBe('exam:pub1,pub2')
  })
})
