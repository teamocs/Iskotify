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

const baseInput =
  'w-full bg-transparent border rounded-md px-2 py-1 text-[13px] text-[#1d1d1f] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#800000]/30 focus:border-[#800000]/40'

function cellClass(hasError: boolean): string {
  return `${baseInput} ${hasError ? 'border-red-400 bg-red-50' : 'border-black/[0.12]'}`
}

export const QuestionBankEditorTable = memo(function QuestionBankEditorTable({
  displayed, errorsByRow, subtests, onEdit,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-[#f5f5f7] text-[#6e6e73] sticky top-0">
          <tr>
            {['#', 'Q ID', 'Subtest', 'Topic', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Status', 'Errors'].map(h => (
              <th key={h} className="px-2 py-2 text-left font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.06]">
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
  const has = (f: string) => errFields.has(f)
  const val = (f: string) => row[f] ?? ''
  const set = (f: string) => (e: { target: { value: string } }) => onEdit(index, f, e.target.value)

  const subtestVal = val('subtest')
  const subtestKnown = subtests.includes(subtestVal)
  const hasRowError = errors.length > 0

  return (
    <tr className={hasRowError ? 'bg-red-50/40' : ''}>
      <td className="px-2 py-2 text-[#6e6e73] text-xs align-top tabular-nums">{index + 1}</td>

      <td className="px-2 py-2 align-top">
        <input className={`${cellClass(has('question_id'))} w-24`} value={val('question_id')} onChange={set('question_id')} />
      </td>

      <td className="px-2 py-2 align-top">
        <select className={`${cellClass(has('subtest'))} w-40`} value={subtestKnown ? subtestVal : '__other__'} onChange={set('subtest')}>
          <option value="">— select —</option>
          {subtests.map(s => <option key={s} value={s}>{s}</option>)}
          {!subtestKnown && subtestVal && <option value="__other__" disabled>{`invalid: ${subtestVal}`}</option>}
        </select>
      </td>

      <td className="px-2 py-2 align-top">
        <input className={`${cellClass(has('topic'))} w-28`} value={val('topic')} onChange={set('topic')} />
      </td>

      <td className="px-2 py-2 align-top min-w-[240px]">
        <textarea className={`${cellClass(has('question_text'))} min-h-[34px] resize-y`} rows={1} value={val('question_text')} onChange={set('question_text')} />
      </td>

      {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map(f => (
        <td key={f} className="px-2 py-2 align-top min-w-[120px]">
          <input className={cellClass(has(f) || has('options'))} value={val(f)} onChange={set(f)} />
        </td>
      ))}

      <td className="px-2 py-2 align-top">
        <select className={`${cellClass(has('correct_answer'))} w-16`} value={val('correct_answer').trim().toUpperCase()} onChange={set('correct_answer')}>
          <option value="">—</option>
          {ANSWER_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </td>

      <td className="px-2 py-2 align-top">
        <input className={`${cellClass(false)} w-24`} value={val('status')} onChange={set('status')} placeholder="draft" />
      </td>

      <td className="px-2 py-2 align-top text-red-700 text-xs min-w-[160px]">
        {errors.map((e, j) => (
          <div key={j}><span className="font-medium">{e.field}</span>: {e.message}</div>
        ))}
      </td>
    </tr>
  )
})
