import fs from 'fs'
import path from 'path'

/**
 * Redesign M2 (Practice area) guard — mirrors apps/admin's noRawColours test
 * for the native screens this milestone owns: the Practice tab, the exam flow,
 * subjects, notes and the Estimated Admission Score tool.
 *
 * DESIGN.md: "Never write a raw colour value in a component" (a hard-coded
 * colour cannot re-theme and cannot be audited), sizes come from the type
 * roles (never a numeric fontSize), and icons are drawn from Lineicons, never
 * emoji standing in for an icon system.
 */
const ROOT = path.resolve(__dirname, '../../..')

const SCOPE = [
  'app/(tabs)/practice.tsx',
  'app/practice',
  'app/subjects',
  'app/notes',
  'app/estimator',
  'components/practice',
]

function walk(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [rel]
  return fs.readdirSync(abs).flatMap(name => {
    if (name === '__tests__') return []
    const child = path.join(rel, name)
    const st = fs.statSync(path.join(ROOT, child))
    if (st.isDirectory()) return walk(child)
    return /\.tsx?$/.test(name) ? [child] : []
  })
}

const FILES = SCOPE.flatMap(walk)

/** Strip line and block comments so documentation can still name a colour. */
function codeOnly(src: string): string {
  // Blank block comments but keep their newlines, so reported line numbers stay true.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type Hit = { file: string; line: number; text: string }

function scan(re: RegExp): Hit[] {
  const hits: Hit[] = []
  for (const file of FILES) {
    const lines = codeOnly(fs.readFileSync(path.join(ROOT, file), 'utf8')).split('\n')
    lines.forEach((text, i) => {
      re.lastIndex = 0
      if (re.test(text)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 100) })
    })
  }
  return hits
}

/** Fails with EVERY hit listed (a toBe('') string diff gets truncated by Jest). */
function expectNone(hits: Hit[]) {
  if (hits.length) throw new Error(`${hits.length} hit(s):\n` + hits.map(h => `${h.file}:${h.line}  ${h.text}`).join('\n'))
}

describe('Practice area design-token hygiene', () => {
  it('scans a non-trivial set of files', () => {
    expect(FILES.length).toBeGreaterThan(25)
  })

  it('has no raw hex colour literals', () => {
    expectNone(scan(/['"`]#[0-9a-fA-F]{3,8}['"`]/))
  })

  it('has no raw rgb()/rgba() colour literals', () => {
    expectNone(scan(/rgba?\(/))
  })

  it('has no numeric fontSize (use textStyle roles or the typography scale)', () => {
    expectNone(scan(/fontSize:\s*\d/))
  })

  it('uses no emoji as icons (Lineicons only)', () => {
    expectNone(scan(/\p{Extended_Pictographic}/u))
  })
})
