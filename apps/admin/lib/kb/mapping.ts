// Column mappings for Drive question files whose layout no dialect recognises
// (or whose name no file rule covers). A mapping says which header holds each
// question field and which pool the file feeds; it comes from Gemini (validated
// by lib/ai/mapColumns) or from an admin, is stored in kb_file_mappings, and is
// applied by re-keying each record onto a known dialect so the same row
// validation, passage linking and id scheme as every other file apply.

import type { ColumnMap, ColumnMapSpec, MapField } from '../ai/mapColumns'
import { convertRecords, type KbRow, type RejectedRow } from './dialects'
import { ALL_SUBTESTS, SKILL_CATEGORIES, defaultSkillCategory, type FileRule } from './fileRules'
import type { Table } from './table'

export const KB_FIELDS = [
  { key: 'id', description: 'the question number or id within the file' },
  { key: 'question', description: 'the question text (the stem)', required: true },
  { key: 'option_a', description: 'answer choice A / 1', required: true },
  { key: 'option_b', description: 'answer choice B / 2', required: true },
  { key: 'option_c', description: 'answer choice C / 3 (blank for two-choice True/False items)' },
  { key: 'option_d', description: 'answer choice D / 4' },
  { key: 'answer', description: 'the correct answer (a letter, a number, or the answer text)', required: true },
  { key: 'explanation', description: 'solution or explanation of the answer' },
  { key: 'topic', description: 'topic or category' },
  { key: 'subtopic', description: 'subtopic or skill tested' },
  { key: 'difficulty', description: 'difficulty level' },
  { key: 'figure_file', description: 'file name/path of a figure image' },
  { key: 'figure_caption', description: 'caption or description of the figure' },
  { key: 'has_figure', description: 'yes/no flag: the question has a figure' },
  { key: 'stimulus_id', description: 'id grouping several questions under one reading passage' },
  { key: 'passage', description: 'reading passage text shared by a group of questions' },
  { key: 'stimulus_title', description: 'title of the reading passage' },
] as const satisfies readonly MapField[]

export type KbField = (typeof KB_FIELDS)[number]['key']
export const KB_FIELD_KEYS = KB_FIELDS.map(f => f.key) as KbField[]
export const REQUIRED_FIELDS = KB_FIELDS.filter(f => 'required' in f && f.required).map(f => f.key) as KbField[]

export interface KbMapping {
  subtest: string
  mainSubject: string
  /** '' → the pool's default (see defaultSkillCategory). */
  skillCategory: string
  columns: Partial<Record<KbField, string>>
  source: 'ai' | 'admin'
}

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const LETTERS = ['A', 'B', 'C', 'D']

/** Option text → its letter; a bare letter or 1–4 → the letter; else as written. */
function normaliseAnswer(raw: string, options: string[]): string {
  const s = raw.trim()
  const byText = options.findIndex(o => o && squash(o) === squash(s))
  if (byText >= 0 && s.length > 1) return LETTERS[byText]!
  if (/^[A-Da-d](?:$|[\s.)\-:])/.test(s)) return s
  if (/^[1-4]$/.test(s)) return LETTERS[Number(s) - 1]!
  return byText >= 0 ? LETTERS[byText]! : s
}

export function convertMapped(
  mapping: KbMapping,
  records: Record<string, string>[],
  fileName: string,
): { rows: KbRow[]; rejected: RejectedRow[] } {
  const col = mapping.columns
  const reading = !!col.stimulus_id && !!col.passage
  const fixed = mapping.skillCategory
  const rule: Extract<FileRule, { kind: 'import' }> = {
    kind: 'import',
    subtest: mapping.subtest,
    mainSubject: mapping.mainSubject,
    skillCategory: fixed ? () => fixed : defaultSkillCategory(mapping.subtest),
  }

  const rekeyed = records.map(rec => {
    const get = (f: KbField) => (col[f] ? (rec[col[f]!] ?? '').trim() : '')
    const options = [get('option_a'), get('option_b'), get('option_c'), get('option_d')]
    const subtopic = get('subtopic')
    return {
      ID: get('id'),
      Question: get('question'),
      A: options[0]!, B: options[1]!, C: options[2]!, D: options[3]!,
      'Option A': options[0]!, 'Option B': options[1]!, 'Option C': options[2]!, 'Option D': options[3]!,
      Answer: normaliseAnswer(get('answer'), options),
      Solution: get('explanation'),
      Topic: get('topic'),
      Subtopic: subtopic,
      SkillTested: subtopic,
      Difficulty: get('difficulty'),
      FigureFile: get('figure_file'),
      FigureCaption: get('figure_caption'),
      HasFigure: get('has_figure'),
      StimulusID: get('stimulus_id'),
      Passage: get('passage'),
      StimulusTitle: get('stimulus_title'),
    }
  })
  return convertRecords(rule, reading ? 'reading-stimulus' : 'option-letter', rekeyed, fileName)
}

/** What the model is asked for; the pool only when no file rule already fixes it. */
export function kbMappingSpec(fileName: string, table: Table, needPool: boolean): ColumnMapSpec {
  return {
    purpose: 'multiple-choice exam review questions (Philippine college entrance exams)',
    context: `File name: ${fileName}`,
    fields: [...KB_FIELDS],
    choices: needPool
      ? [
          { key: 'subtest', description: 'which question pool (exam section) these questions belong to', allowed: ALL_SUBTESTS, required: true },
          { key: 'skill_category', description: 'the exam blueprint skill these questions test (omit if unsure)', allowed: SKILL_CATEGORIES },
        ]
      : [],
    headers: table.headers,
    sample: table.records.slice(0, 3),
  }
}

export function mappingFromAi(ai: ColumnMap, pool: { subtest: string; mainSubject: string } | null): KbMapping {
  const subtest = pool?.subtest ?? ai.choices.subtest!
  return {
    subtest,
    mainSubject: pool?.mainSubject ?? subtest,
    skillCategory: pool ? '' : (ai.choices.skill_category ?? ''),
    columns: ai.columns as KbMapping['columns'],
    source: 'ai',
  }
}

const FIELD_LABEL: Record<string, string> = Object.fromEntries(KB_FIELDS.map(f => [f.key, f.key.replace(/_/g, ' ')]))

/** An admin's mapping from the console, checked against the file's real headers. Returns an error message when invalid. */
export function parseMappingInput(input: unknown, headers: string[]): KbMapping | string {
  if (!input || typeof input !== 'object') return 'Send a mapping.'
  const { subtest, skillCategory, columns } = input as { subtest?: unknown; skillCategory?: unknown; columns?: unknown }
  if (typeof subtest !== 'string' || !(ALL_SUBTESTS as readonly string[]).includes(subtest)) {
    return `Choose a question pool: ${ALL_SUBTESTS.join(', ')}.`
  }
  const skill = typeof skillCategory === 'string' ? skillCategory : ''
  if (skill && !(SKILL_CATEGORIES as readonly string[]).includes(skill)) return `Unknown skill category "${skill}".`
  if (!columns || typeof columns !== 'object') return 'Map the columns.'

  const out: KbMapping['columns'] = {}
  const used = new Map<string, string>()
  for (const [field, header] of Object.entries(columns as Record<string, unknown>)) {
    if (!(KB_FIELD_KEYS as string[]).includes(field) || typeof header !== 'string' || !header) continue
    if (!headers.includes(header)) return `"${header}" is not a column in this file.`
    if (used.has(header)) return `"${header}" is mapped to more than one field (${used.get(header)} and ${FIELD_LABEL[field]}).`
    used.set(header, FIELD_LABEL[field]!)
    out[field as KbField] = header
  }
  const missing = REQUIRED_FIELDS.filter(f => !out[f])
  if (missing.length) return `Map the required fields: ${missing.map(f => FIELD_LABEL[f]).join(', ')}.`
  return { subtest, mainSubject: subtest, skillCategory: skill, columns: out, source: 'admin' }
}
