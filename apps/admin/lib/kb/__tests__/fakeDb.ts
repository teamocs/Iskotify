// Minimal in-memory stand-in for the Supabase query builder calls used by the
// kb sync/publish code and importUpcatCore: select().in/eq/range/await,
// upsert (keyed per table), update().in/eq/await, rpc.

type Row = Record<string, any>
type Filter = (r: Row) => boolean

const KEYS: Record<string, string> = {
  upcat_questions: 'question_id',
  upcat_passages: 'set_id',
  kb_drive_files: 'drive_file_id',
}

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))]))
  const rpcCalls: string[] = []
  const t = (name: string) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }

  function filtered(name: string, filters: Filter[]) {
    return t(name).filter(r => filters.every(f => f(r)))
  }

  const db = {
    from(name: string) {
      return {
        select(_cols?: string) {
          const filters: Filter[] = []
          const b: any = {
            in(col: string, vals: unknown[]) { filters.push(r => vals.includes(r[col])); return b },
            eq(col: string, val: unknown) { filters.push(r => r[col] === val); return b },
            order() { return b },
            range(from: number, to: number) {
              return Promise.resolve({ data: filtered(name, filters).slice(from, to + 1), error: null })
            },
            then(res: any, rej: any) {
              return Promise.resolve({ data: filtered(name, filters), error: null }).then(res, rej)
            },
          }
          return b
        },
        upsert(values: Row | Row[]) {
          const arr = Array.isArray(values) ? values : [values]
          const key = KEYS[name]
          for (const v of arr) {
            const i = key ? t(name).findIndex(r => r[key] === v[key]) : -1
            if (i >= 0) t(name)[i] = { ...t(name)[i], ...v }
            else t(name).push({ ...v })
          }
          return Promise.resolve({ error: null })
        },
        update(patch: Row) {
          const filters: Filter[] = []
          const b: any = {
            in(col: string, vals: unknown[]) { filters.push(r => vals.includes(r[col])); return b },
            eq(col: string, val: unknown) { filters.push(r => r[col] === val); return b },
            then(res: any, rej: any) {
              for (const r of filtered(name, filters)) Object.assign(r, patch)
              return Promise.resolve({ error: null }).then(res, rej)
            },
          }
          return b
        },
      }
    },
    rpc(fn: string) {
      rpcCalls.push(fn)
      return Promise.resolve({ data: { cards: 0 }, error: null })
    },
  }
  return { db, tables, rpcCalls, rows: t }
}
