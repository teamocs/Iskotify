'use client'

import { memo } from 'react'
import type { QbFieldError } from '@/lib/upcat/validateQuestionBank'

export interface DisplayRow {
  index: number // index into the full rows array (stable identity for edits)
  row: Record<string, string>
}

interface Props {
  displayed: DisplayRow[]
  errorsByRow: Map<number, QbFieldError[]>
  subtests: readonly string[]
  onEdit: (index: number, field: string, value: string) => void
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const

const HEADERS = ['Row', 'Question ID', 'Subtest', 'Topic', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct answer', 'Status', 'Problems'] as const

/** Human names for the CSV columns an error can point at. */
const FIELD_LABEL: Record<string, string> = {
  question_id: 'Question ID',
  subtest: 'Subtest',
  topic: 'Topic',
  question_text: 'Question',
  option_a: 'Option A',
  option_b: 'Option B',
  option_c: 'Option C',
  option_d: 'Option D',
  options: 'Options',
  correct_answer: 'Correct answer',
  status: 'Status',
}

const baseInput =
  'w-full rounded-sm border bg-surface px-2 py-1 text-ui text-ink placeholder:text-ink-subtle transition-colors ' +
  'hover:border-ink-muted aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft'

/**
 * The inline editor grid for a question-bank import. It stays a plain table
 * (not DataTable): every cell is an editable control, rows are addressed by
 * their position in the file, and paging is owned by the importer.
 */
export const QuestionBankEditorTable = memo(function QuestionBankEditorTable({
  displayed, errorsByRow, subtests, onEdit,
}: Props) {
  return (
    <div role="region" aria-label="Question bank rows" tabIndex={0} className="overflow-x-auto rounded-md border border-subtle bg-surface">
      <table className="min-w-full border-separate border-spacing-0 text-ui">
        <caption className="sr-only">Question bank rows. Edit a cell to fix it; problems are listed in the last column.</caption>
        <thead className="sticky top-0 z-10 bg-surface-3">
          <tr>
            {HEADERS.map(h => (
              <th key={h} scope="col" className="whitespace-nowrap border-b border-subtle px-2 py-2 text-left text-xs font-semibold text-ink-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map(({ index, row }) => (
            <QbEditorRow
              key={index}
              index={index}
              row={row}
              errors={errorsByRow.get(index) ?? []}
              subtests={subtests}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
})

interface RowProps {
  index: number
  row: Record<string, string>
  errors: QbFieldError[]
  subtests: readonly string[]
  onEdit: (index: number, field: string, value: string) => void
}

const QbEditorRow = memo(function QbEditorRow({ index, row, errors, subtests, onEdit }: RowProps) {
  const errFields = new Set(errors.map(e => e.field))
  const errorsId = `qb-row-${index}-problems`
  const val = (f: string) => row[f] ?? ''
  const set = (f: string) => (e: { target: { value: string } }) => onEdit(index, f, e.target.value)
  /** aria wiring for a control: invalid + described by this row's problem list. */
  const invalid = (bad: boolean) => (bad ? { 'aria-invalid': true as const, 'aria-describedby': errorsId } : {})
  const has = (f: string) => errFields.has(f)

  const subtestVal = val('subtest')
  const subtestKnown = subtests.includes(subtestVal)
  const n = index + 1
  const td = 'border-b border-subtle px-2 py-2 align-top'

  return (
    <tr className={errors.length > 0 ? 'bg-danger-soft/40' : undefined}>
      <td className={`${td} text-xs tabular-nums text-ink-muted`}>{n}</td>

      <td className={td}>
        <input aria-label={`Row ${n} question ID`} {...invalid(has('question_id'))} className={`${baseInput} w-24 border-control`} value={val('question_id')} onChange={set('question_id')} />
      </td>

      <td className={td}>
        <select aria-label={`Row ${n} subtest`} {...invalid(has('subtest'))} className={`${baseInput} w-40 border-control`} value={subtestKnown ? subtestVal : '__other__'} onChange={set('subtest')}>
          <option value="">Select…</option>
          {subtests.map(s => <option key={s} value={s}>{s}</option>)}
          {!subtestKnown && subtestVal && <option value="__other__" disabled>{`Not a subtest: ${subtestVal}`}</option>}
        </select>
      </td>

      <td className={td}>
        <input aria-label={`Row ${n} topic`} {...invalid(has('topic'))} className={`${baseInput} w-28 border-control`} value={val('topic')} onChange={set('topic')} />
      </td>

      <td className={`${td} min-w-[240px]`}>
        <textarea aria-label={`Row ${n} question text`} {...invalid(has('question_text'))} className={`${baseInput} min-h-[34px] resize-y border-control`} rows={1} value={val('question_text')} onChange={set('question_text')} />
      </td>

      {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map(f => (
        <td key={f} className={`${td} min-w-[120px]`}>
          <input aria-label={`Row ${n} option ${f.slice(-1).toUpperCase()}`} {...invalid(has(f) || has('options'))} className={`${baseInput} border-control`} value={val(f)} onChange={set(f)} />
        </td>
      ))}

      <td className={td}>
        <select aria-label={`Row ${n} correct answer`} {...invalid(has('correct_answer'))} className={`${baseInput} w-16 border-control`} value={val('correct_answer').trim().toUpperCase()} onChange={set('correct_answer')}>
          <option value="">—</option>
          {ANSWER_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </td>

      <td className={td}>
        <input aria-label={`Row ${n} status`} className={`${baseInput} w-24 border-control`} value={val('status')} onChange={set('status')} placeholder="draft" />
      </td>

      <td id={errorsId} className={`${td} min-w-[160px] text-xs text-danger-strong`}>
        {errors.map((e, j) => (
          <div key={j}><span className="font-medium">{FIELD_LABEL[e.field] ?? e.field}</span>: {e.message}</div>
        ))}
      </td>
    </tr>
  )
})
