import { describe, it, expect } from 'vitest'
import { importUpcatCore, type RawUpcatRow } from '../importUpcatCore'

function makeMockClient() {
  const inserted = { passages: [] as any[], questions: [] as any[] }
  const client = {
    from(table: string) {
      return {
        upsert(values: any) {
          const arr = Array.isArray(values) ? values : [values]
          if (table === 'upcat_passages') inserted.passages.push(...arr)
          else if (table === 'upcat_questions') inserted.questions.push(...arr)
          else throw new Error(`unexpected table ${table}`)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, inserted }
}

function row(p: Partial<RawUpcatRow>): RawUpcatRow {
  return {
    question_id: 'M001', subtest: 'Mathematics', main_subject: 'Algebra', topic: 'Basic Algebra',
    subtopic: 'Work', question_format: 'Word Problem', cognitive_level: 'Application', difficulty: 'Medium',
    curriculum_alignment: 'Grade 8', has_visual: 'No', visual_type: 'None', visual_description: '',
    set_id: '', set_position: '', passage_text: '', question_text: 'Q?',
    option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'C',
    explanation: 'because', status: 'Approved', ...p,
  }
}

describe('importUpcatCore', () => {
  it('packs options[], converts letter→index, maps Approved→published', async () => {
    const { client, inserted } = makeMockClient()
    const res = await importUpcatCore(client as any, [row({})])
    expect(res.questions).toBe(1)
    const q = inserted.questions[0]
    expect(q.options).toEqual(['a', 'b', 'c', 'd'])
    expect(q.correct_index).toBe(2)
    expect(q.status).toBe('published')
    expect(q.has_visual).toBe(false)
  })

  it('dedupes passages by set_id (passage stored once)', async () => {
    const { client, inserted } = makeMockClient()
    const rows = [
      row({ question_id: 'R001', subtest: 'Reading Comprehension', set_id: 'PASS-001', set_position: '1', passage_text: 'Long passage' }),
      row({ question_id: 'R002', subtest: 'Reading Comprehension', set_id: 'PASS-001', set_position: '2', passage_text: '' }),
    ]
    await importUpcatCore(client as any, rows)
    expect(inserted.passages).toHaveLength(1)
    expect(inserted.passages[0].set_id).toBe('PASS-001')
    expect(inserted.passages[0].passage_text).toBe('Long passage')
    expect(inserted.questions).toHaveLength(2)
    expect(inserted.questions.every((q: any) => q.set_id === 'PASS-001')).toBe(true)
  })

  it('strips BOM from the first cell of the first row', async () => {
    const { client, inserted } = makeMockClient()
    await importUpcatCore(client as any, [row({ question_id: '﻿M001' })])
    expect(inserted.questions[0].question_id).toBe('M001')
  })

  it('throws on invalid correct_answer letter', async () => {
    const { client } = makeMockClient()
    await expect(importUpcatCore(client as any, [row({ correct_answer: 'E' })])).rejects.toThrow()
  })

  it('counts distinct passages + questions in the result', async () => {
    const { client } = makeMockClient()
    const res = await importUpcatCore(client as any, [
      row({ question_id: 'R001', set_id: 'PASS-001', set_position: '1', passage_text: 'P1' }),
      row({ question_id: 'R002', set_id: 'PASS-001', set_position: '2' }),
      row({ question_id: 'M001', set_id: '', passage_text: '' }),
    ])
    expect(res).toEqual({ passages: 1, questions: 3 })
  })
})
