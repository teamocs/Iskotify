/**
 * Design-system guard for the Progress and account screens (iOS-language
 * redesign P4): Progress and its analytics components, Profile, Settings and
 * its sub-pages, Notes, the paywall, the info pages and the delete-account
 * sheet. Same contract as components/explore/__tests__/designLint.test.ts:
 *
 * - no legacy type API: no textStyle() (its role names display, title,
 *   titleSm, bodySm, label, button are retired here), no typo / typography
 *   sizes, no hand-set fontSize;
 * - no fixed `height` on a text container: a numeric height only on a square
 *   or circle that also sets `width`, or a hairline;
 * - rows press through PressableScale (no bare Pressable or Touchable*);
 * - sheets through the P3 Sheet (no raw RN Modal);
 * - no raw colours, no emoji or glyph icons.
 *
 * And for analytics: no verdict words (owner, 2026-10-13). Progress shows
 * neutral numbers: no pass/fail band, no pace status.
 *
 * Directories are walked, so a new file in one of them is covered too.
 * Comments are stripped first so prose may name what was removed.
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const DIRS = ['components/analytics', 'app/profile', 'app/settings', 'app/notes', 'components/notes', 'components/premium']
const SINGLE = [
  'app/(tabs)/progress.tsx',
  'app/settings.tsx',
  'app/upgrade.tsx',
  'app/about.tsx',
  'app/help.tsx',
  'app/privacy.tsx',
  'app/terms.tsx',
  'components/info/InfoPage.tsx',
  'components/DeleteAccountSheet.tsx',
]

function walk(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const child = `${rel}/${e.name}`
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(child)
    return /\.tsx?$/.test(e.name) ? [child] : []
  })
}

const FILES = [...DIRS.flatMap(walk), ...SINGLE]

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const GLYPH = /[\p{Extended_Pictographic}‹›←-⇿✓✕★•✎]/u
const LEGACY_ROLE = /\b(?:textStyle|iosTextStyle)\(\s*['"](?:display|title|titleSm|bodySm|label|button)['"]|\brole=["'](?:display|title|titleSm|bodySm|label|button)["']/
const VERDICT = /\b(?:Top tier|Competitive|Developing|Foundational|Below cut-?off|Above cut-?off|Excellent|Needs work|Poor|Getting there|Behind|On pace|On track|scoreBand)\b/i

/** Object literals (innermost) that set a numeric `height`. */
function fixedHeights(src: string): string[] {
  return (src.match(/\{[^{}]*\}/g) ?? []).filter((obj) => {
    const m = /(?:^|[^A-Za-z])height:\s*(\d+(?:\.\d+)?)/.exec(obj)
    if (!m) return false
    if (Number(m[1]) <= 4) return false
    return !/(?:^|[^A-Za-z])width:/.test(obj)
  })
}

describe.each(FILES)('%s', (rel) => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

  it('has no raw hex or rgba colours', () => {
    expect(src.match(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/g)).toBeNull()
  })

  it('sets no fontSize by hand (type comes from the iOS roles)', () => {
    expect(src.match(/fontSize\s*:/g)).toBeNull()
  })

  it('uses no legacy type API: no textStyle(), typo or typography sizes, no retired role names', () => {
    expect(src).not.toMatch(/\btextStyle\(/)
    expect(src).not.toMatch(/\btypo\b|\btypography\./)
    expect(src).not.toMatch(LEGACY_ROLE)
  })

  it('never fixes the height of a text container (minHeight grows with Dynamic Type)', () => {
    expect(fixedHeights(src)).toEqual([])
  })

  it('presses rows through PressableScale, never a bare Pressable or Touchable', () => {
    expect(src).not.toMatch(/import\s*\{[^}]*\b(?:Pressable|TouchableOpacity|TouchableHighlight)\b[^}]*\}\s*from\s*'react-native'/)
  })

  it('opens sheets through the P3 Sheet, never a raw Modal', () => {
    expect(src).not.toMatch(/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*'react-native'/)
  })

  it('uses no emoji or Unicode glyphs as icons', () => {
    expect(src.split('\n').find(line => GLYPH.test(line))).toBeUndefined()
  })
})

describe('analytics carries no verdicts', () => {
  const analytics = [...walk('components/analytics'), 'app/(tabs)/progress.tsx', 'services/analyticsAggregates.ts', 'hooks/useAnalytics.ts']
  it.each(analytics)('%s names no band, verdict or pace status', (rel) => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    expect(src).not.toMatch(VERDICT)
  })
})

describe('the guard itself', () => {
  it('covers every area the P4 brief names', () => {
    for (const dir of ['components/analytics', 'app/profile', 'app/settings', 'components/notes']) {
      expect(FILES.some(f => f.startsWith(`${dir}/`))).toBe(true)
    }
    expect(FILES).toContain('app/settings.tsx')
  })

  it('flags a fixed-height text container but not a square tile or a hairline', () => {
    expect(fixedHeights('<View style={{ height: 48, paddingHorizontal: 8 }} />')).toHaveLength(1)
    expect(fixedHeights('<View style={{ width: 44, height: 44 }} />')).toEqual([])
    expect(fixedHeights('<View style={{ height: 1, backgroundColor: t.divider }} />')).toEqual([])
  })

  it('flags the retired role names and the verdict words', () => {
    expect(LEGACY_ROLE.test("textStyle('bodySm', t.textPrimary)")).toBe(true)
    expect(LEGACY_ROLE.test('<Text role="label">')).toBe(true)
    expect(VERDICT.test('Below cut-off')).toBe(true)
    expect(VERDICT.test("{ fallback: 'Needs work' }")).toBe(true)
    expect(VERDICT.test('72% practice accuracy')).toBe(false)
  })
})
