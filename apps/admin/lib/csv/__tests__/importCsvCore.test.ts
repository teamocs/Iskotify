import { describe, it, expect, vi } from 'vitest'
import { importCsvCore } from '../importCsvCore'
import type { ValidatedRow } from '../parseCsvRow'

function rows(...partial: Partial<ValidatedRow>[]): ValidatedRow[] {
  return partial.map((p, i) => ({
    subject: p.subject ?? 'Math',
    topic: p.topic ?? 'Algebra',
    question: p.question ?? `Q${i}`,
    answer: p.answer ?? `A${i}`,
    explanation: p.explanation ?? '',
    distractors: p.distractors ?? [],
  }))
}

function makeMockClient() {
  const inserted = { subjects: [] as any[], topics: [] as any[], cards: [] as any[] }
  const client = {
    from(table: string) {
      return {
        upsert(values: any) {
          if (table === 'flashcard_subjects') {
            inserted.subjects.push(values)
            const id = `sub-${inserted.subjects.length}`
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }
          }
          throw new Error(`unexpected upsert on ${table}`)
        },
        insert(values: any) {
          if (table === 'flashcard_topics') {
            inserted.topics.push(values)
            const id = `top-${inserted.topics.length}`
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }
          }
          if (table === 'flashcards') {
            inserted.cards.push(...(Array.isArray(values) ? values : [values]))
            return Promise.resolve({ data: null, error: null })
          }
          throw new Error(`unexpected insert on ${table}`)
        },
      }
    },
  }
  return { client, inserted }
}

describe('importCsvCore', () => {
  it('upserts subjects, inserts topics, inserts cards, returns ids + counters', async () => {
    const { client, inserted } = makeMockClient()
    const result = await importCsvCore(client as any, rows(
      { subject: 'Math', topic: 'Algebra', question: 'Q1', answer: '4', distractors: ['3', '5', '6'] },
      { subject: 'Math', topic: 'Algebra', question: 'Q2', answer: '7', distractors: [] },
      { subject: 'Sci', topic: 'Bio', question: 'Q3', answer: 'Mito', distractors: [] },
    ))

    expect(inserted.subjects).toHaveLength(2)
    expect(inserted.topics).toHaveLength(2)
    expect(inserted.cards).toHaveLength(3)
    expect(result.topic_ids).toHaveLength(2)
    expect(result.total_cards).toBe(3)
    expect(result.cards_needing_enhancement).toBe(2)
  })

  it('populates options + correct_answer_index when distractors present', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows(
      { question: 'pi?', answer: '3.14', distractors: ['2.71', '1.41', '1.62'] },
    ))
    const card = inserted.cards[0]
    expect(card.options).toHaveLength(4)
    expect(card.options).toContain('3.14')
    expect(card.correct_answer_index).toBe(card.options.indexOf('3.14'))
  })

  it('leaves options empty and correct_answer_index null when distractors absent', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({ distractors: [] }))
    const card = inserted.cards[0]
    expect(card.options).toEqual([])
    expect(card.correct_answer_index).toBeNull()
  })

  it('all inserted cards have status=draft and empty listing_slugs', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({}, {}))
    expect(inserted.cards.every(c => c.status === 'draft')).toBe(true)
    expect(inserted.cards.every(c => Array.isArray(c.listing_slugs) && c.listing_slugs.length === 0)).toBe(true)
  })

  it('all inserted topics have status=draft and source_type=csv', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({}))
    expect(inserted.topics[0].status).toBe('draft')
    expect(inserted.topics[0].source_type).toBe('csv')
  })

  it('throws when a subject upsert returns error', async () => {
    const client = {
      from() {
        return {
          upsert() { return { select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) } },
        }
      },
    }
    await expect(importCsvCore(client as any, rows({}))).rejects.toThrow(/boom/)
  })
})
