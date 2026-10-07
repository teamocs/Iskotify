import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// A crafted RSC request can render a page without its layout, so the layout's
// role check is not enough: every server page that touches the service-role
// client must gate itself, before the first service-role use.

const ROOT = join(__dirname, '..')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : pages(p)
    return name === 'page.tsx' ? [p] : []
  })
}

const files = pages(ROOT).map((p) => [relative(ROOT, p).split(sep).join('/'), readFileSync(p, 'utf8')] as const)

describe('admin pages guard themselves before service-role reads', () => {
  it('finds the pages', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.filter(([, src]) => /createServerClient\s*\(/.test(src)))(
    '%s calls isAdminSession/requireAdmin before createServerClient',
    (_name, src) => {
      // The guard has to run inside the page itself (not in a helper declared
      // above it), before anything awaits or reaches for the client.
      const exported = src.search(/export default (?:async )?function/)
      const guard = src.search(/(?:await\s+)?(?:isAdminSession|requireAdmin)\s*\(/)
      expect(exported, 'no default export').toBeGreaterThanOrEqual(0)
      expect(guard, 'missing admin guard').toBeGreaterThan(exported)
      expect(src.slice(exported, guard)).not.toMatch(/createServerClient|await\s/)
      expect(src).toMatch(/notFound\s*\(\)/)
    },
  )
})
