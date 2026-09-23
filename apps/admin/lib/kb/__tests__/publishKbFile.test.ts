import { describe, it, expect } from 'vitest'
import { publishKbFile } from '../publishKbFile'
import { fakeDb } from './fakeDb'

const q = (id: string, p: Record<string, unknown> = {}) => ({
  question_id: id, question_text: `Q ${id}?`, options: ['a', 'b', 'c', 'd'], correct_index: 0,
  status: 'draft', has_visual: false, image_url: null, ...p,
})

describe('publishKbFile', () => {
  it('publishes eligible drafts and skips missing-figure, 3-option and duplicate questions', async () => {
    const { db, rows, rpcCalls } = fakeDb({
      kb_drive_files: [{ drive_file_id: 'f1', status: 'imported', question_ids: ['k:1', 'k:2', 'k:3', 'k:4', 'k:5', 'k:6'] }],
      upcat_questions: [
        q('k:1'),
        q('k:2', { has_visual: true, image_url: null }),
        q('k:3', { has_visual: true, image_url: 'https://cdn/x.png' }),
        q('k:4', { options: ['True', 'False', 'Uncertain'] }),
        q('k:5', { question_text: 'Same as live', options: ['w', 'x', 'y', 'z'] }),
        q('k:6', { status: 'published' }),
        q('OLD-1', { question_text: 'same as LIVE', options: ['W', 'x', 'y', 'z'], status: 'published' }),
      ],
    })

    const res = await publishKbFile(db as any, 'f1')

    expect(res).toEqual({ published: 2, alreadyPublished: 1, skippedMissingMedia: 1, skippedFewOptions: 1, skippedDuplicate: 1 })
    const status = Object.fromEntries(rows('upcat_questions').map(r => [r.question_id, r.status]))
    expect(status).toMatchObject({ 'k:1': 'published', 'k:2': 'draft', 'k:3': 'published', 'k:4': 'draft', 'k:5': 'draft', 'k:6': 'published' })
    expect(rpcCalls).toEqual(['project_question_bank_to_flashcards'])
    expect(rows('kb_drive_files')[0]!.published_at).toEqual(expect.any(String))
  })

  it('throws for an unknown file', async () => {
    const { db } = fakeDb()
    await expect(publishKbFile(db as any, 'nope')).rejects.toThrow(/not found/i)
  })
})
