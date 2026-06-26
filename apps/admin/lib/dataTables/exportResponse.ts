import { NextResponse } from 'next/server'
import type { DataTableConfig } from '../dataTables'
import { buildExportCsv } from './serialization'

interface SupabaseLike {
  from(table: string): any // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Stream ALL rows of `table` (paginated past the 1000-row cap) as a downloadable
// CSV or JSON file. `csvConfig` supplies the CSV column order + types (so array/
// jsonb columns serialize as JSON text). Used by the generic data route and the
// bespoke listings/flashcards/upcat-questions export routes.
export async function exportRowsResponse(
  supabase: SupabaseLike,
  table: string,
  idColumn: string,
  csvConfig: DataTableConfig,
  format: 'csv' | 'json',
): Promise<Response> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').order(idColumn).range(from, from + 999)
    if (error) {
      console.error(`[export ${table}] supabase error:`, error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < 1000) break
    from += 1000
  }

  const date = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}-${date}.json"`,
      },
    })
  }
  return new NextResponse(buildExportCsv(rows, csvConfig), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${table}-${date}.csv"`,
    },
  })
}
