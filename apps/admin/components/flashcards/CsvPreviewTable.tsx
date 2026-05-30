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
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
          {validRows} rows valid
        </span>
        {rowErrors.length > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            {new Set(rowErrors.map(e => e.rowIndex)).size} rows have errors
          </span>
        )}
        <span className="text-[#6e6e73] text-xs">showing first {rows.length} of {totalRows}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-[#f5f5f7] text-[#6e6e73]">
            <tr>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">#</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">subject</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">topic</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">question</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">answer</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">explanation</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">distractors</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]">errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {rows.map((r, i) => {
              const errs = errorsByRow.get(i) ?? []
              const hasErr = errs.length > 0
              return (
                <tr key={i} className={hasErr ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2 text-[#6e6e73] text-xs">{i + 1}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate text-[#1d1d1f]">{r.subject ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate text-[#1d1d1f]">{r.topic ?? ''}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate text-[#1d1d1f]">{r.question ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate text-[#1d1d1f]">{r.answer ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-[#6e6e73]">{r.explanation ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-[#6e6e73]">{r.distractors ?? ''}</td>
                  <td className="px-3 py-2 text-red-700 text-xs">
                    {errs.map((e, j) => <div key={j}><span className="font-medium">{e.field}</span>: {e.message}</div>)}
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
