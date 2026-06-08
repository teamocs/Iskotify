import { describe, it, expect } from 'vitest'
import { normalizeQuestionBankHeader } from '../questionBankHeaders'

describe('normalizeQuestionBankHeader', () => {
  it('maps the friendly tracker headers to importer columns', () => {
    const map: Record<string, string> = {
      'Q ID': 'question_id',
      'Subtest': 'subtest',
      'Main Subject': 'main_subject',
      'Topic': 'topic',
      'Subtopic': 'subtopic',
      'Format': 'question_format',
      'Cognitive Level': 'cognitive_level',
      'Difficulty': 'difficulty',
      'Curriculum': 'curriculum_alignment',
      'Has Visual': 'has_visual',
      'Visual Type': 'visual_type',
      'Visual Description': 'visual_description',
      'Set ID': 'set_id',
      'Set Position': 'set_position',
      'Passage / Set Text': 'passage_text',
      'Question': 'question_text',
      'Option A': 'option_a',
      'Option B': 'option_b',
      'Option C': 'option_c',
      'Option D': 'option_d',
      'Answer': 'correct_answer',
      'Explanation': 'explanation',
      'Status': 'status',
    }
    for (const [raw, expected] of Object.entries(map)) {
      expect(normalizeQuestionBankHeader(raw)).toBe(expected)
    }
  })

  it('passes through legacy snake_case headers unchanged', () => {
    for (const h of ['question_id', 'curriculum_alignment', 'passage_text', 'correct_answer', 'question_text']) {
      expect(normalizeQuestionBankHeader(h)).toBe(h)
    }
  })

  it('strips BOM, trims, and is case/whitespace insensitive', () => {
    expect(normalizeQuestionBankHeader('﻿Q ID')).toBe('question_id')
    expect(normalizeQuestionBankHeader('  PASSAGE / SET TEXT  ')).toBe('passage_text')
    expect(normalizeQuestionBankHeader('Cognitive   Level')).toBe('cognitive_level')
  })

  it('snake_cases unknown headers (e.g. tracker-only columns)', () => {
    expect(normalizeQuestionBankHeader('Date Created')).toBe('date_created')
    expect(normalizeQuestionBankHeader('Created By')).toBe('created_by')
    expect(normalizeQuestionBankHeader('Some New Field')).toBe('some_new_field')
  })
})
