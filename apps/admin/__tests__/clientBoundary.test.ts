import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// A server component that imports a non-component VALUE (e.g. a column list)
// from a 'use client' module receives a client reference, not the value — it
// built fine and crashed /admin/sync in production ("….split is not a function").
// Constants shared with the server must live in a module without 'use client'.
const root = path.resolve(__dirname, '..')
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name)
  if (d.isDirectory()) return d.name === 'node_modules' || d.name === '__tests__' || d.name.startsWith('.') ? [] : files(p)
  return /\.(ts|tsx)$/.test(d.name) ? [p] : []
})
const isClient = (src: string) => /^\s*['"]use client['"]/.test(src)

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
  if (!base) return null
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext
  return null
}

describe('server/client module boundary', () => {
  it('no server file imports an UPPER_CASE constant from a "use client" module', () => {
    const offences: string[] = []
    for (const file of files(path.join(root, 'app'))) {
      const src = fs.readFileSync(file, 'utf8')
      if (isClient(src)) continue
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const target = resolve(file, m[2]!)
        if (!target || !isClient(fs.readFileSync(target, 'utf8'))) continue
        const values = m[1]!.split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type '))
        for (const name of values.filter(n => /^[A-Z][A-Z0-9_]+$/.test(n))) {
          offences.push(`${path.relative(root, file)} imports ${name} from ${m[2]}`)
        }
      }
    }
    expect(offences).toEqual([])
  })
})
