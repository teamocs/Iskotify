import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Same banned set as lib/__tests__/noRawColours.test.ts, scoped to the flashcards
// screens, plus the A2 extras (white/black literals, sub-12px text, ad-hoc radii).
const ARBITRARY = /-\[#[0-9a-fA-F]{3,8}\]/
const PALETTE = /(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|placeholder|shadow|accent)-(?:gray|slate|purple)-\d{2,3}\b/
const HEX_IN_STRING = /(['"`])[^'"`\n]*#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])[^'"`\n]*\1/
const EXTRAS = /\bbg-white\b|\btext-white\b|black\/\[|bg-black\/|text-\[1[01]px\]|rounded-2xl|rounded-\[980px\]/

const ROOT = path.resolve(__dirname, '../../..')
const FILES = [
  'app/admin/flashcards/new/page.tsx',
  'app/admin/flashcards/import/page.tsx',
  'app/admin/flashcards/drafts/page.tsx',
  'app/admin/flashcards/review/[topicId]/page.tsx',
  'components/flashcards/CsvDropzone.tsx',
  'components/flashcards/ExamTagSelector.tsx',
  'components/flashcards/QuestionBankEditorTable.tsx',
  'components/flashcards/DraftsTable.tsx',
  'components/flashcards/PublishModal.tsx',
]

describe('flashcards screens use design tokens only', () => {
  it.each(FILES)('%s has no raw colours, stock palettes, white/black literals or sub-12px text', f => {
    const src = readFileSync(path.join(ROOT, f), 'utf8')
    expect(src).not.toMatch(ARBITRARY)
    expect(src).not.toMatch(PALETTE)
    expect(src).not.toMatch(HEX_IN_STRING)
    expect(src).not.toMatch(EXTRAS)
  })
})
