import { NextResponse } from 'next/server'
import type { createServerClient } from '@iskotify/utils'
import { QUEUE_PAGE_SIZE, type QueueCondition, type QueueSpec } from './queueSpecs'

/*
 * The list endpoint behind each moderation queue:
 *   GET ?q=&status=&<filter>=&sort=<column id>&dir=asc|desc&page=<0-based>&limit=
 * → { rows, count } for one page. Sort columns and filter values are
 * allow-listed by the queue's spec; anything else is a 400. Callers run their
 * admin check first.
 */

const MAX_LIMIT = 200

interface ParsedQuery {
  page: number
  limit: number
  sortColumn: string
  ascending: boolean
  conditions: QueueCondition[]
  search: string
}

type Parsed = { ok: true; value: ParsedQuery } | { ok: false; error: string }

export function parseQueueQuery(params: URLSearchParams, spec: QueueSpec): Parsed {
  const page = Math.max(0, parseInt(params.get('page') ?? '0', 10) || 0)
  const rawLimit = parseInt(params.get('limit') ?? String(QUEUE_PAGE_SIZE), 10) || QUEUE_PAGE_SIZE
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit))

  const sortId = params.get('sort')?.trim() || spec.defaultSort.id
  const sortColumn = Object.hasOwn(spec.sorts, sortId) ? spec.sorts[sortId] : undefined
  if (!sortColumn) return { ok: false, error: 'Invalid sort' }
  const dir = params.get('dir')?.trim() || (params.get('sort') ? 'asc' : spec.defaultSort.dir)
  if (dir !== 'asc' && dir !== 'desc') return { ok: false, error: 'Invalid sort direction' }

  const conditions: QueueCondition[] = []
  for (const [id, allowed] of Object.entries(spec.filters)) {
    const value = params.get(id)?.trim() ?? ''
    if (!value) continue
    const condition = Object.hasOwn(allowed, value) ? allowed[value] : undefined
    if (!condition) return { ok: false, error: `Invalid ${id} filter` }
    conditions.push(condition)
  }

  // Strip the characters that are structural in PostgREST's .or() syntax.
  const search = (params.get('q') ?? '').trim().replace(/[(),.*:\\%]/g, ' ').trim()

  return { ok: true, value: { page, limit, sortColumn, ascending: dir === 'asc', conditions, search } }
}

type Client = ReturnType<typeof createServerClient>

export async function listStatusQueue(supabase: Client, spec: QueueSpec, params: URLSearchParams, logTag: string) {
  const parsed = parseQueueQuery(params, spec)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { page, limit, sortColumn, ascending, conditions, search } = parsed.value

  let query = supabase.from(spec.table).select('*', { count: 'exact', head: false })

  for (const c of conditions) {
    if (c.op === 'eq') query = query.eq(c.column, c.value)
    else if (c.op === 'ilike') query = query.ilike(c.column, c.pattern)
    else if (c.op === 'is') query = query.is(c.column, c.value)
    else query = query.or(c.filter)
  }

  if (search) query = query.or(spec.search.map(col => `${col}.ilike.%${search}%`).join(','))

  const from = page * limit
  const { data, error, count } = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    // Tiebreaker, so rows with equal sort values never repeat or vanish across pages.
    .order('id', { ascending })
    .range(from, from + limit - 1)

  if (error) {
    // PostgREST refuses a range that starts past the last row (e.g. a bulk
    // change just emptied the last page). Not a failure: the client falls back.
    if (error.code === 'PGRST103') return NextResponse.json({ rows: [], count: null, outOfRange: true })
    console.error(`${logTag} supabase error:`, error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [], count: count ?? 0 })
}
