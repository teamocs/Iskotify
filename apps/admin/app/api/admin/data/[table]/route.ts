import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { DATA_TABLE_MAP, ALLOWED_TABLES } from '@/lib/dataTables'
import { exportRowsResponse } from '@/lib/dataTables/exportResponse'

export const runtime = 'nodejs'

const PAGE_SIZE = 50

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

function resolveConfig(table: string) {
  if (!ALLOWED_TABLES.has(table)) return null
  return DATA_TABLE_MAP[table] ?? null
}

// Filter a body object to only include columns declared in the config.
// Returns a new object with only allowlisted column names.
function filterBody(body: Record<string, unknown>, columnNames: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (columnNames.has(key)) {
      out[key] = body[key]
    }
  }
  return out
}

// GET /api/admin/data/[table]?search=&page=
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ table: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context.params
  const config = resolveConfig(params.table)
  if (!config) {
    return NextResponse.json({ error: `Unknown table: ${params.table}` }, { status: 400 })
  }

  const url = new URL(_req.url)

  // Export branch: ?export=1&format=csv|json → download all rows.
  if (url.searchParams.get('export') === '1') {
    return exportRowsResponse(supabase, config.table, config.idColumn, config, url.searchParams.get('format') === 'json' ? 'json' : 'csv')
  }

  const search = url.searchParams.get('search')?.trim() ?? ''
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10) || 0)
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from(config.table)
    .select('*', { count: 'exact', head: false })

  // Sanitize search: strip structural chars used in Supabase .or() DSL
  const safe = search.replace(/[(),.*:\\%]/g, ' ').trim()

  // Apply ilike OR across searchColumns when a sanitized search term is provided
  if (safe && config.searchColumns.length > 0) {
    const orParts = config.searchColumns
      .map(col => `${col}.ilike.%${safe}%`)
      .join(',')
    query = query.or(orParts)
  }

  const { data, error, count } = await query
    .order(config.idColumn)
    .range(from, to)

  if (error) {
    console.error(`[admin/data/${config.table} GET] supabase error:`, error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [], count: count ?? 0 })
}

// POST /api/admin/data/[table]
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ table: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context.params
  const config = resolveConfig(params.table)
  if (!config) {
    return NextResponse.json({ error: `Unknown table: ${params.table}` }, { status: 400 })
  }

  const body = await req.json()
  const allowedCols = new Set(config.columns.map(c => c.name))
  const filtered = filterBody(body, allowedCols)

  // Handle id based on idType
  if (config.idType === 'uuid') {
    // Generate a UUID if not provided
    if (!filtered[config.idColumn]) {
      filtered[config.idColumn] = crypto.randomUUID()
    }
  } else if (config.idType === 'text') {
    // Text PK must be present
    if (!filtered[config.idColumn]) {
      return NextResponse.json(
        { error: `${config.idColumn} is required for ${config.table}` },
        { status: 400 },
      )
    }
  }
  // idType === 'int' → serial; omit so DB assigns it

  const { error } = await supabase.from(config.table).insert(filtered)
  if (error) {
    console.error(`[admin/data/${config.table} POST] supabase error:`, error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: filtered[config.idColumn] ?? null }, { status: 201 })
}

// PATCH /api/admin/data/[table]?id=
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ table: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context.params
  const config = resolveConfig(params.table)
  if (!config) {
    return NextResponse.json({ error: `Unknown table: ${params.table}` }, { status: 400 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const body = await req.json()
  const allowedCols = new Set(config.columns.map(c => c.name))
  // Strip the id column from the update payload to avoid PK conflicts
  allowedCols.delete(config.idColumn)
  const filtered = filterBody(body, allowedCols)

  // Always touch updated_at (all Data Manager tables have it)
  const update = { ...filtered, updated_at: new Date().toISOString() }

  const { error } = await supabase
    .from(config.table)
    .update(update)
    .eq(config.idColumn, id)

  if (error) {
    console.error(`[admin/data/${config.table} PATCH] supabase error:`, error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/data/[table]?id=
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ table: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context.params
  const config = resolveConfig(params.table)
  if (!config) {
    return NextResponse.json({ error: `Unknown table: ${params.table}` }, { status: 400 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from(config.table)
    .delete()
    .eq(config.idColumn, id)

  if (error) {
    console.error(`[admin/data/${config.table} DELETE] supabase error:`, error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
