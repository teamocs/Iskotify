// Maps the friendly "Question Bank" CSV headers (as authored in the tracker
// spreadsheet) to the snake_case column names the UPCAT importer expects.
// Legacy snake_case headers pass through unchanged, so both formats are accepted.
//
// Friendly CSV header row:
//   Q ID, Subtest, Main Subject, Topic, Subtopic, Format, Cognitive Level,
//   Difficulty, Curriculum, Has Visual, Visual Type, Visual Description,
//   Set ID, Set Position, Passage / Set Text, Question, Option A, Option B,
//   Option C, Option D, Answer, Explanation, Status, Date Created, Created By, Notes

const HEADER_ALIASES: Record<string, string> = {
  'q id': 'question_id',
  'question id': 'question_id',
  qid: 'question_id',
  subtest: 'subtest',
  'main subject': 'main_subject',
  topic: 'topic',
  subtopic: 'subtopic',
  format: 'question_format',
  'question format': 'question_format',
  'cognitive level': 'cognitive_level',
  difficulty: 'difficulty',
  curriculum: 'curriculum_alignment',
  'curriculum alignment': 'curriculum_alignment',
  'has visual': 'has_visual',
  'visual type': 'visual_type',
  'visual description': 'visual_description',
  'set id': 'set_id',
  'set position': 'set_position',
  'passage / set text': 'passage_text',
  'passage/set text': 'passage_text',
  'passage set text': 'passage_text',
  'passage text': 'passage_text',
  passage: 'passage_text',
  question: 'question_text',
  'question text': 'question_text',
  'option a': 'option_a',
  'option b': 'option_b',
  'option c': 'option_c',
  'option d': 'option_d',
  answer: 'correct_answer',
  'correct answer': 'correct_answer',
  explanation: 'explanation',
  status: 'status',
  // Tracker-only columns (kept recognizable, ignored by the importer):
  'date created': 'date_created',
  'created by': 'created_by',
  notes: 'notes',
}

/**
 * Normalize a raw CSV header cell to the importer's canonical column name.
 * Strips BOM, lowercases, collapses internal whitespace, then applies the alias
 * map. Unknown headers fall back to a snake_cased form of the cleaned label.
 */
export function normalizeQuestionBankHeader(raw: string): string {
  const key = (raw ?? '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, '_')
}
