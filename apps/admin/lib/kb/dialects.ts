// Column "dialects" seen in the knowledge-base Drive folder. Each converts a
// parsed CSV record into the RawUpcatRow shape importUpcatCore already accepts,
// so the Drive sync reuses the same validation, passage handling and
// content-fingerprint dedupe as the manual CSV import.

import type { RawUpcatRow } from '../upcat/importUpcatCore'
import { fileKeyOf, type FileRule } from './fileRules'

export type DialectId = 'reading-stimulus' | 'abcd-letter' | 'option-letter' | 'option-numeric'

export interface KbRow extends RawUpcatRow {
  figure_file: string
  figure_caption: string
}

export interface RejectedRow { localId: string; reason: string }

type Rec = Record<string, string>

const norm = (h: string) => h.replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Required (normalised) headers per dialect, checked most specific first.
const SIGNATURES: Array<[DialectId, string[]]> = [
  ['reading-stimulus', ['stimulusid', 'passage', 'question', 'a', 'b', 'c', 'd', 'answer']],
  ['abcd-letter', ['id', 'question', 'a', 'b', 'c', 'd', 'answer']],
  ['option-letter', ['question', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer']],
  ['option-numeric', ['question', 'option1', 'option2', 'option3', 'option4', 'correctoption']],
]

export function detectDialect(headers: string[]): DialectId | null {
  const have = new Set(headers.map(norm))
  for (const [id, required] of SIGNATURES) if (required.every(h => have.has(h))) return id
  return null
}

/** Case/punctuation-insensitive column lookup. */
function reader(rec: Rec) {
  const byNorm = new Map(Object.entries(rec).map(([k, v]) => [norm(k), (v ?? '').trim()]))
  return (...names: string[]) => {
    for (const n of names) {
      const v = byNorm.get(norm(n))
      if (v !== undefined) return v
    }
    return ''
  }
}

const LETTERS = ['A', 'B', 'C', 'D']

/** 'B', 'b', 'B - text', 'B. text', '2' (numeric dialect) → 'B'; otherwise ''. */
function answerLetter(raw: string, numeric: boolean): string {
  const s = raw.trim()
  if (numeric) {
    const n = Number.parseInt(s, 10)
    return n >= 1 && n <= 4 ? (LETTERS[n - 1] ?? '') : ''
  }
  const m = /^([A-Da-d])(?:$|[\s.)\-:])/.exec(s)
  return m?.[1] ? m[1].toUpperCase() : ''
}

const yes = (v: string) => /^y(es)?$/i.test(v.trim())

export function convertRecords(
  rule: Extract<FileRule, { kind: 'import' }>,
  dialect: DialectId,
  records: Rec[],
  fileName: string,
): { rows: KbRow[]; rejected: RejectedRow[] } {
  const fileKey = fileKeyOf(fileName)
  const rows: KbRow[] = []
  const rejected: RejectedRow[] = []
  const numeric = dialect === 'option-numeric'

  // Reading: a stimulus is linked as a passage only when it has passage text —
  // figure-only stimuli (infographics, charts) carry the figure on each question
  // instead, because upcat_questions.set_id is a FK to a passage row.
  const stimulusPassage = new Map<string, string>()
  const stimulusCount = new Map<string, number>()
  if (dialect === 'reading-stimulus') {
    for (const rec of records) {
      const get = reader(rec)
      const sid = get('StimulusID')
      const passage = get('Passage')
      if (sid && passage && !stimulusPassage.has(sid)) {
        const title = get('StimulusTitle')
        stimulusPassage.set(sid, title ? `${title}\n\n${passage}` : passage)
      }
    }
  }

  records.forEach((rec, i) => {
    const get = reader(rec)
    const localId = get('ID', 'No.', 'Question No.') || String(i + 1).padStart(4, '0')
    const localKey = /^\d+$/.test(localId) ? localId.padStart(4, '0') : localId

    const options = numeric
      ? [get('option_1'), get('option_2'), get('option_3'), get('option_4')]
      : dialect === 'option-letter'
        ? [get('Option A'), get('Option B'), get('Option C'), get('Option D')]
        : [get('A'), get('B'), get('C'), get('D')]
    const letter = answerLetter(get('Answer', 'Correct Answer', 'correct_option'), numeric)
    const question = get('Question')

    const reason =
      !question ? 'missing question text'
      : options.slice(0, 3).some(o => !o) ? 'fewer than 3 options'
      : !letter ? 'unreadable correct answer'
      : !options[LETTERS.indexOf(letter)] ? 'correct answer points at a blank option'
      : ''
    if (reason) { rejected.push({ localId, reason }); return }

    const rawTopic = get('Topic', 'Category')
    let topic = rawTopic
    let subtopic = get('Subtopic', 'SkillTested')
    let setId = ''
    let setPosition = ''
    let passage = ''
    let format = ''
    if (dialect === 'reading-stimulus') {
      // "Reading Comprehension - Prose passage" → "Prose passage"
      topic = rawTopic.includes(' - ') ? rawTopic.split(' - ').slice(1).join(' - ') : rawTopic
      subtopic = get('SkillTested')
      format = get('StimulusType')
      const sid = get('StimulusID')
      if (sid && stimulusPassage.has(sid)) {
        const n = (stimulusCount.get(sid) ?? 0) + 1
        stimulusCount.set(sid, n)
        setId = `${fileKey}:${sid}`
        setPosition = String(n)
        passage = n === 1 ? stimulusPassage.get(sid)! : ''
      }
    }

    const figureFile = get('FigureFile')
    const caption = get('FigureCaption')
    rows.push({
      question_id: `${fileKey}:${localKey}`,
      subtest: rule.subtest,
      main_subject: rule.mainSubject,
      topic,
      subtopic,
      question_format: format,
      cognitive_level: '',
      difficulty: get('Difficulty'),
      curriculum_alignment: '',
      has_visual: yes(get('HasFigure')) || !!figureFile ? 'yes' : 'no',
      visual_type: '',
      visual_description: caption,
      set_id: setId,
      set_position: setPosition,
      passage_text: passage,
      question_text: question,
      option_a: options[0] ?? '', option_b: options[1] ?? '', option_c: options[2] ?? '', option_d: options[3] ?? '',
      correct_answer: letter,
      explanation: get('Solution', 'Explanation'),
      status: '', // drafts: an admin publishes per file after review
      skill_category: rule.skillCategory(rawTopic),
      figure_file: figureFile,
      figure_caption: caption,
    })
  })

  return { rows, rejected }
}
