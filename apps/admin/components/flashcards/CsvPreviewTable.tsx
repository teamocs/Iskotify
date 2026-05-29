'use client'

interface RowError {
  rowIndex: number
  field: string
  message: string
}

interface Props {
  rows: Array<Record<string, string>>  // first 10 rows of CSV (parsed by papaparse)
  totalRows: number
  rowErrors: RowError[]
}

export function CsvPreviewTable({ rows, totalRows, rowErrors }: Props) {
  const errorsByRow = new Map<number, RowError[]>()
  for (const e of rowErrors) {
    if (!errorsByRow.has(e.rowIndex)) errorsByRow.set(e.rowIndex, [])
    errorsByRow.get(e.rowIndex)!.push(e)
  }

  const validRows = totalRows - new Set(rowErrors.map(e => e.rowIndex)).size

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-400">{validRows} rows valid</span>
        {rowErrors.length > 0 && (
          <span className="text-red-400">{new Set(rowErrors.map(e => e.rowIndex)).size} rows have errors</span>
        )}
        <span className="text-white/40">· showing first {rows.length} of {totalRows}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/[0.04] text-white/60">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">subject</th>
              <th className="px-3 py-2 text-left">topic</th>
              <th className="px-3 py-2 text-left">question</th>
              <th className="px-3 py-2 text-left">answer</th>
              <th className="px-3 py-2 text-left">explanation</th>
              <th className="px-3 py-2 text-left">distractors</th>
              <th className="px-3 py-2 text-left">errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const errs = errorsByRow.get(i) ?? []
              const hasErr = errs.length > 0
              return (
                <tr key={i} className={hasErr ? 'bg-red-500/10' : 'odd:bg-white/[0.02]'}>
                  <td className="px-3 py-2 text-white/40">{i + 1}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.subject ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.topic ?? ''}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate">{r.question ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.answer ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.explanation ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.distractors ?? ''}</td>
                  <td className="px-3 py-2 text-red-400 text-xs">
                    {errs.map((e, j) => <div key={j}>{e.field}: {e.message}</div>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
