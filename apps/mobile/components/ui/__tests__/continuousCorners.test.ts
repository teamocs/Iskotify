// iOS redesign P1c: every rounded corner in the design-system primitives is a
// continuous (squircle) curve on native. A token radius other than the
// pill/capsule must sit in a style object that also sets
// `borderCurve: 'continuous'` (a conditional value that resolves to
// 'continuous' counts; pills and capsules are true semicircles and skip it).
import fs from 'fs'
import path from 'path'

const UI = path.join(__dirname, '..')
const ROUND_KEYS = new Set(['pill', 'capsule'])

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** The innermost `{ … }` around `index`. */
function enclosingObject(src: string, index: number): string {
  let depth = 0
  let start = -1
  for (let i = index; i >= 0; i--) {
    const c = src[i]
    if (c === '}') depth++
    else if (c === '{') {
      if (depth === 0) { start = i; break }
      depth--
    }
  }
  if (start < 0) return ''
  depth = 0
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return src.slice(start)
}

function cornerViolations(src: string): string[] {
  const code = strip(src)
  const out: string[] = []
  const decl = /border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*([^,\n}]+)/g
  for (const m of code.matchAll(decl)) {
    const keys = [...m[1]!.matchAll(/radius\.(\w+)/g)].map(k => k[1]!)
    if (keys.length === 0 || keys.every(k => ROUND_KEYS.has(k))) continue
    const obj = enclosingObject(code, m.index!)
    if (!/borderCurve\s*:[^,\n}]*'continuous'/.test(obj)) out.push(m[0].trim())
  }
  return out
}

describe('cornerViolations (the checker itself)', () => {
  it('flags a token radius without a continuous curve', () => {
    expect(cornerViolations("const s = { borderRadius: radius.field, padding: 4 }")).toEqual(['borderRadius: radius.field'])
  })
  it('accepts a continuous curve, a conditional one, and pills', () => {
    expect(cornerViolations("{ borderRadius: radius.card, borderCurve: 'continuous' }")).toEqual([])
    expect(cornerViolations("{ borderRadius: pill ? radius.capsule : radius.button, borderCurve: pill ? undefined : 'continuous' }")).toEqual([])
    expect(cornerViolations('{ borderRadius: radius.pill }')).toEqual([])
    expect(cornerViolations('{ borderRadius: radius.capsule, overflow: "hidden" }')).toEqual([])
  })
})

describe('components/ui radii use continuous corners on native', () => {
  const files = fs.readdirSync(UI).filter(f => /\.(tsx?|ts)$/.test(f))
  it('scans the primitives', () => {
    expect(files.length).toBeGreaterThan(20)
  })
  for (const f of files) {
    it(f, () => {
      expect(cornerViolations(fs.readFileSync(path.join(UI, f), 'utf8'))).toEqual([])
    })
  }
})
