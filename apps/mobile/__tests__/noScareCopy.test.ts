// Brandbook voice guard (docs/brand/90_SYNTHESIS.md §5, §6, §9.4): the app
// never scares the student. User-facing strings in app/ and components/ may
// not call her "behind", count down scarcity ("only 3 days left!") or use
// emoji. Comments are stripped first (they may quote the banned copy), and
// identifiers like `sessionsBehind` never match (no word boundary).
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...sourceFiles(full))
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

// "behind" as status text. Legitimate non-status phrases go here.
const BEHIND = /\bbehind\b/gi
const BEHIND_ALLOWED = [/behind the scenes/gi]
const ONLY_LEFT = /\bonly \d+ [^'"`\n]*\bleft\b/gi
// Emoji: characters drawn as emoji by default, or any pictograph forced to
// emoji with VS16. ©, ®, ™ and arrows (text presentation) are not emoji.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu

interface Hit { file: string; line: number; text: string }

function scan(re: RegExp, allow: RegExp[] = []): Hit[] {
  const hits: Hit[] = []
  for (const dir of DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const lines = strip(fs.readFileSync(file, 'utf8')).split('\n')
      lines.forEach((raw, i) => {
        const text = allow.reduce((l, a) => l.replace(a, ''), raw)
        if (text.match(re)) hits.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), line: i + 1, text: raw.trim() })
      })
    }
  }
  return hits
}

describe('no scare copy in user-facing strings', () => {
  it('scans a real tree', () => {
    expect(sourceFiles(path.join(ROOT, 'app')).length).toBeGreaterThan(20)
    expect(sourceFiles(path.join(ROOT, 'components')).length).toBeGreaterThan(20)
  })

  it('never says the student is "behind"', () => {
    expect(scan(BEHIND, BEHIND_ALLOWED)).toEqual([])
  })

  it('never counts down scarcity ("only N … left")', () => {
    expect(scan(ONLY_LEFT)).toEqual([])
  })

  it('uses no emoji', () => {
    expect(scan(EMOJI)).toEqual([])
  })

  it('the patterns catch what they should, and spare what they should', () => {
    expect('You are 3 sessions behind'.match(BEHIND)).toBeTruthy()
    expect('sessionsBehind'.match(BEHIND)).toBeNull()
    expect('behind the scenes'.replace(BEHIND_ALLOWED[0]!, '').match(BEHIND)).toBeNull()
    expect('Only 3 days left!'.match(ONLY_LEFT)).toBeTruthy()
    expect('Pin 📌 Exam'.match(EMOJI)).toBeTruthy()
    expect('© 2026 Iskotify ™ → next'.match(EMOJI)).toBeNull()
  })
})
