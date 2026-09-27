import { describe, it, expect } from 'vitest'
import { previewKbFile, holdReason } from '../previewKbFile'
import { fakeDb } from './fakeDb'

const q = (id: string, p: Record<string, unknown> = {}) => ({
  question_id: id, question_text: `Q ${id}?`, options: ['a', 'b', 'c', 'd'], correct_index: 1,
  status: 'draft', has_visual: false, image_url: null, topic: 'T', subtopic: '', difficulty: 'Easy',
  explanation: 'why', set_id: null, ...p,
})

function seed() {
  return fakeDb({
    kb_drive_files: [{ drive_file_id: 'f1', name: 'F.csv', question_ids: ['k:1', 'k:2', 'k:3', 'k:4', 'k:5'] }],
    upcat_questions: [
      q('k:1'),
      q('k:2', { has_visual: true, image_url: null }),
      q('k:3', { options: ['x', 'y', 'z'] }),
      q('k:4', { status: 'published' }),
      q('k:5', { set_id: 'f:S1' }),
    ],
    upcat_passages: [{ set_id: 'f:S1', passage_text: 'A passage.' }],
  })
}

describe('holdReason', () => {
  it('names why a draft would be held back at publish', () => {
    expect(holdReason({ has_visual: true, image_url: null, options: ['a', 'b', 'c', 'd'] })).toBe('missing_figure')
    expect(holdReason({ has_visual: false, image_url: null, options: ['a', 'b', 'c'] })).toBe('few_options')
    expect(holdReason({ has_visual: true, image_url: 'u', options: ['a', 'b', 'c', 'd'] })).toBeNull()
  })
})

describe('previewKbFile', () => {
  it('lists only the file’s drafts, with counts of what will publish and what will be held', async () => {
    const { db } = seed()
    const res = await previewKbFile(db as any, 'f1')
    expect(res.counts).toEqual({ drafts: 4, ready: 2, missingFigure: 1, fewOptions: 1 })
    expect(res.total).toBe(4)
    expect(res.items.map(i => [i.question_id, i.hold])).toEqual([
      ['k:1', null], ['k:2', 'missing_figure'], ['k:3', 'few_options'], ['k:5', null],
    ])
    expect(res.items[3]).toMatchObject({ passage_text: 'A passage.' })
  })

  it('filters to held or ready questions and pages', async () => {
    const { db } = seed()
    expect((await previewKbFile(db as any, 'f1', { filter: 'held' })).items.map(i => i.question_id)).toEqual(['k:2', 'k:3'])
    const page = await previewKbFile(db as any, 'f1', { filter: 'ready', offset: 1, limit: 1 })
    expect(page.total).toBe(2)
    expect(page.items.map(i => i.question_id)).toEqual(['k:5'])
  })

  it('throws for an unknown file', async () => {
    const { db } = fakeDb()
    await expect(previewKbFile(db as any, 'nope')).rejects.toThrow(/not found/i)
  })
})
