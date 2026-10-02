import { describe, it, expect } from 'vitest'
import { stageOf, splitStages, poolOf, draftReadiness, type StageFile } from '../syncStages'

const f = (p: Partial<StageFile>): StageFile => ({
  drive_file_id: 'f', name: 'UPCAT-Math.csv', status: 'imported', rows_imported: 10,
  imported_at: '2026-09-20T00:00:00Z', published_at: null, ...p,
})

describe('stageOf', () => {
  it('puts imported files with unpublished drafts in Preview', () => {
    expect(stageOf(f({}))).toBe('preview')
    // Re-imported after the last publish: new drafts to review again.
    expect(stageOf(f({ published_at: '2026-09-19T00:00:00Z' }))).toBe('preview')
  })

  it('moves a file to History once published after its last import', () => {
    expect(stageOf(f({ published_at: '2026-09-20T00:00:00Z' }))).toBe('history')
    expect(stageOf(f({ published_at: '2026-09-21T00:00:00Z' }))).toBe('history')
  })

  it('sends mapping problems and failures to Needs attention, skipped files to Not imported', () => {
    expect(stageOf(f({ status: 'needs_mapping' }))).toBe('attention')
    expect(stageOf(f({ status: 'error' }))).toBe('attention')
    expect(stageOf(f({ status: 'skipped' }))).toBe('ignored')
  })

  it('treats an import that produced no questions as needing attention', () => {
    expect(stageOf(f({ rows_imported: 0 }))).toBe('attention')
  })
})

describe('splitStages', () => {
  it('groups files by stage, preserving order', () => {
    const s = splitStages([f({ drive_file_id: 'a' }), f({ drive_file_id: 'b', status: 'skipped' }), f({ drive_file_id: 'c' })])
    expect(s.preview.map(x => x.drive_file_id)).toEqual(['a', 'c'])
    expect(s.ignored.map(x => x.drive_file_id)).toEqual(['b'])
    expect(s.attention).toEqual([])
    expect(s.history).toEqual([])
  })
})

describe('poolOf', () => {
  it('names the pool from a saved mapping first, then the file-name rule', () => {
    expect(poolOf('UPCAT-Science-600.csv', undefined)).toBe('Science')
    expect(poolOf('UPCAT-Science-600.csv', 'Mental Ability')).toBe('Mental Ability')
    expect(poolOf('random.xlsx', undefined)).toBeNull()
  })
})

describe('draftReadiness', () => {
  it('splits a file’s drafts into ready to publish and held for a missing figure', () => {
    expect(draftReadiness({ rows_drafted: 600, rows_missing_media: 152 })).toEqual({ ready: 448, heldMissingFigure: 152 })
    expect(draftReadiness({ rows_drafted: 300, rows_missing_media: 0 })).toEqual({ ready: 300, heldMissingFigure: 0 })
  })

  it('never reports more held than drafted (a missing figure on an already-live question)', () => {
    expect(draftReadiness({ rows_drafted: 5, rows_missing_media: 9 })).toEqual({ ready: 0, heldMissingFigure: 5 })
  })
})
