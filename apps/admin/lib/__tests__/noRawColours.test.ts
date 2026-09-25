import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/*
 * DESIGN.md's first rule: never write a raw colour in a component. This guard
 * scans the admin console (not the landing page or the email template, which
 * are out of scope) and fails on:
 *
 *   - arbitrary colour classes:            text-[#6e6e73], bg-[#f3f4f6]
 *   - raw hex values inside string literals (className strings, inline styles)
 *   - Tailwind's stock gray / slate / purple palettes, which bypass the ink ramp
 *
 * Tests (__tests__) are not shipped UI and are skipped. Anything that genuinely
 * needs a literal goes in ALLOWED with a reason; a stale entry fails too, so the
 * list cannot quietly outlive the code it excused.
 */

const ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = ['app/admin', 'components/admin', 'components/ui', 'components/flashcards']

interface Allowed { file: string; match: string; reason: string }
const ALLOWED: Allowed[] = []

const ARBITRARY = /-\[#[0-9a-fA-F]{3,8}\]/g
const PALETTE = /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|placeholder|shadow|decoration|accent|caret)-(?:gray|slate|purple)-\d{2,3}\b/g
const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  let out: string[] = []
  for (const name of readdirSync(abs)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const rel = path.posix.join(dir, name)
    if (statSync(path.join(ROOT, rel)).isDirectory()) out = out.concat(walk(rel))
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
  }
  return out
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (_m, p) => p)
}

export interface Violation { file: string; line: number; match: string }

export function scanSource(file: string, src: string): Violation[] {
  const found: Violation[] = []
  const lines = stripComments(src).split('\n')
  lines.forEach((text, i) => {
    const hit = (match: string) => found.push({ file, line: i + 1, match })
    for (const m of text.matchAll(ARBITRARY)) hit(m[0])
    for (const m of text.matchAll(PALETTE)) hit(m[0])
    for (const lit of text.matchAll(STRING_LITERAL)) {
      for (const m of (lit[2] ?? '').matchAll(HEX)) if (!lit[2]!.includes(`-[${m[0]}`)) hit(m[0])
    }
  })
  return found.filter(v => !ALLOWED.some(a => a.file === v.file && v.match.includes(a.match)))
}

const files = SCAN_DIRS.flatMap(walk)

describe('no raw colours in the admin console', () => {
  it('scans a meaningful set of files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('catches each banned form (self-test)', () => {
    const src = [
      `<p className="text-[#6e6e73]">`,
      `<div className="bg-gray-100 hover:text-slate-600 md:border-purple-500">`,
      `<i style={{ color: '#4ade80' }} />`,
      `// text-[#123456] in a comment is fine`,
      `<a href="#top" className="bg-surface text-ink">`,
    ].join('\n')
    expect(scanSource('x.tsx', src).map(v => v.match)).toEqual([
      '-[#6e6e73]', 'bg-gray-100', 'hover:text-slate-600', 'md:border-purple-500', '#4ade80',
    ])
  })

  it('finds no arbitrary hex classes, raw hex literals or gray/slate/purple classes', () => {
    const violations = files.flatMap(f => scanSource(f, readFileSync(path.join(ROOT, f), 'utf8')))
    expect(violations.map(v => `${v.file}:${v.line} ${v.match}`)).toEqual([])
  })

  it('every allowed exception is still needed', () => {
    for (const a of ALLOWED) {
      const src = readFileSync(path.join(ROOT, a.file), 'utf8')
      expect(src, `${a.file} no longer contains ${a.match}; remove it from ALLOWED`).toContain(a.match)
    }
  })
})
