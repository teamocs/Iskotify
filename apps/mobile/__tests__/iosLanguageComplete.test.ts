/**
 * The iOS-language redesign is complete (P4, the last screen PR): across
 * app/, components/ and hooks/ no source file uses the legacy type API or a
 * hand-set size, and no screen opens a raw React Native Modal.
 *
 * Fails on:
 *  - a legacy text role: any textStyle() call (the P1b alias API), or a
 *    retired role name (display, title, titleSm, bodySm, label, button) given
 *    to iosTextStyle() or <Text role>;
 *  - typo.* / typography.* (the old size scale);
 *  - any `fontSize:` literal (type comes from the iOS roles);
 *  - `Modal` imported from react-native (sheets go through the P3 Sheet, or a
 *    routed formSheet);
 *  - a readiness / accuracy / score badge whose tone follows its value
 *    (a traffic light on a practice number is a verdict; brandbook §5), or a
 *    screen importing utils/readinessTone to colour one.
 *
 * ALLOWLIST: files that may still break a rule, each with its reason. It only
 * shrinks: when the open Practice and Progress/Profile PRs merge, their files
 * leave it (the test prints what is left, and fails on an entry that no longer
 * needs to be here). Test files are never scanned.
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'components', 'hooks']

type Rule = 'legacy-type' | 'typo' | 'fontSize' | 'modal' | 'score-tone'
const ALL: Rule[] = ['legacy-type', 'typo', 'fontSize', 'modal', 'score-tone']

/** path (or directory prefix ending in /) → the rules it may still break, and why. */
const ALLOWLIST: Record<string, { rules: Rule[]; why: string }> = {
  // Owned by the open Practice PR (#98): not editable here yet.
  'app/(tabs)/practice.tsx': { rules: ALL, why: 'Practice PR (#98)' },
  'app/practice/': { rules: ALL, why: 'Practice PR (#98)' },
  'app/estimator/': { rules: ALL, why: 'Practice PR (#98), estimator' },
  'components/practice/': { rules: ALL, why: 'Practice PR (#98)' },
  'components/upcat/': { rules: ALL, why: 'Practice PR (#98), UPCAT runner' },
  'components/estimator/': { rules: ALL, why: 'Practice PR (#98), estimator' },
  'components/ui/EmptyState.tsx': { rules: ALL, why: 'edited by the open Practice PR (#98)' },
  // Owned by the open Progress / Profile / Settings PR.
  'app/(tabs)/progress.tsx': { rules: ALL, why: 'Progress/Profile PR' },
  'app/analytics.tsx': { rules: ALL, why: 'Progress/Profile PR' },
  'components/analytics/': { rules: ALL, why: 'Progress/Profile PR' },
  'app/profile/': { rules: ALL, why: 'Progress/Profile PR' },
  'app/settings.tsx': { rules: ALL, why: 'Progress/Profile PR' },
  'app/settings/': { rules: ALL, why: 'Progress/Profile PR' },
  'app/notes/': { rules: ALL, why: 'Progress/Profile PR, notes' },
  'components/notes/': { rules: ALL, why: 'Progress/Profile PR, notes' },
  'app/upgrade.tsx': { rules: ALL, why: 'Progress/Profile PR, upgrade' },
  'components/premium/': { rules: ALL, why: 'Progress/Profile PR, premium' },
  'app/about.tsx': { rules: ALL, why: 'Progress/Profile PR, about' },
  'app/help.tsx': { rules: ALL, why: 'Progress/Profile PR, help' },
  'app/privacy.tsx': { rules: ALL, why: 'Progress/Profile PR, privacy' },
  'app/terms.tsx': { rules: ALL, why: 'Progress/Profile PR, terms' },
  'components/DeleteAccountSheet.tsx': { rules: ALL, why: 'Progress/Profile PR, account' },
  // The landing page's content is frozen by the owner (2026-10-12).
  'app/landing.tsx': { rules: ALL, why: 'landing content frozen by the owner' },
  // Full-screen surfaces that legitimately use a Modal (beyond the open PRs).
  'components/ui/Sheet.tsx': { rules: ['modal'], why: 'the P3 Sheet primitive itself' },
  'components/practice/ExamPassage.tsx': { rules: ['modal'], why: 'full-screen passage reader' },
  'components/upcat/PassagePanel.tsx': { rules: ['modal'], why: 'full-screen passage reader' },
  'components/practice/QuestionFigure.tsx': { rules: ['modal'], why: 'full-screen figure zoom' },
  'components/estimator/ScoreDisclaimerModal.tsx': { rules: ['modal'], why: 'the estimator disclaimer' },
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      out.push(...walk(p))
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p)
    }
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const RETIRED = '(?:display|title|titleSm|bodySm|label|button)'
export const RULES: Record<Rule, RegExp> = {
  'legacy-type': new RegExp(`\\btextStyle\\(|\\btextStyles\\b|\\biosTextStyle\\(\\s*['"]${RETIRED}['"]|<Text\\b[^>]*\\brole=["']${RETIRED}["']`),
  'typo': /\btypo\b|\btypography\./,
  'fontSize': /\bfontSize\s*:/,
  'modal': /import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*['"]react-native['"]/,
  // A badge for a readiness / accuracy / score / mock percentage whose tone
  // is computed (not the one neutral or accent literal), or the tone helper.
  'score-tone': /utils\/readinessTone|label:\s*`[^`]*(?:[Rr]eadiness|[Aa]ccuracy|[Ss]core|[Mm]ock)[^`]*%`\s*,\s*tone:(?!\s*['"](?:neutral|accent)['"])/,
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')
const FILES = DIRS.flatMap(d => walk(path.join(ROOT, d))).map(p => ({ rel: rel(p), src: stripComments(fs.readFileSync(p, 'utf8')) }))

/** Every rule the allowlist lets this file break (entries can overlap). */
function allowedRules(file: string): Rule[] {
  return Object.entries(ALLOWLIST)
    .filter(([key]) => (key.endsWith('/') ? file.startsWith(key) : file === key))
    .flatMap(([, v]) => v.rules)
}

function violations(): { file: string; rule: Rule }[] {
  const out: { file: string; rule: Rule }[] = []
  for (const f of FILES) {
    for (const rule of ALL) {
      if (!RULES[rule].test(f.src)) continue
      if (allowedRules(f.rel).includes(rule)) continue
      out.push({ file: f.rel, rule })
    }
  }
  return out
}

describe('iOS-language migration is complete outside the allowlist', () => {
  afterAll(() => {
    // Printed so the list visibly shrinks as the open PRs merge.
    const used = Object.entries(ALLOWLIST).map(([k, v]) => `  ${k}  (${v.rules.join(', ')}): ${v.why}`)
    console.log(`iosLanguageComplete allowlist (${used.length}):\n${used.join('\n')}`)
  })

  it('scans app/, components/ and hooks/', () => {
    expect(FILES.length).toBeGreaterThan(150)
    expect(FILES.some(f => f.rel === 'app/auth/sign-in.tsx')).toBe(true)
    expect(FILES.some(f => f.rel.includes('__tests__'))).toBe(false)
  })

  it.each(ALL)('no %s outside the allowlist', (rule) => {
    expect(violations().filter(v => v.rule === rule).map(v => v.file)).toEqual([])
  })

  it('every allowlist entry still covers a file that exists', () => {
    const stale = Object.keys(ALLOWLIST).filter(k => !FILES.some(f => (k.endsWith('/') ? f.rel.startsWith(k) : f.rel === k)))
    expect(stale).toEqual([])
  })
})

describe('the guard itself', () => {
  it('flags the legacy type API and retired role names, not the iOS roles', () => {
    expect(RULES['legacy-type'].test("textStyle('body', t.textPrimary)")).toBe(true)
    expect(RULES['legacy-type'].test("iosTextStyle('bodySm', c)")).toBe(true)
    expect(RULES['legacy-type'].test('<Text role="label">x</Text>')).toBe(true)
    expect(RULES['legacy-type'].test("iosTextStyle('footnote', c)")).toBe(false)
    expect(RULES['legacy-type'].test('<Text role="title2">x</Text>')).toBe(false)
    expect(RULES['legacy-type'].test('accessibilityRole="button"')).toBe(false)
  })

  it('flags typo / typography sizes and any fontSize literal', () => {
    expect(RULES.typo.test('fontSize: typo.md')).toBe(true)
    expect(RULES.typo.test('typography.lg')).toBe(true)
    expect(RULES.fontSize.test('{ fontSize: 12 }')).toBe(true)
    expect(RULES.fontSize.test("iosTextStyle('caption')")).toBe(false)
  })

  it('flags a raw Modal import, single- or multi-line', () => {
    expect(RULES.modal.test("import { View, Modal } from 'react-native'")).toBe(true)
    expect(RULES.modal.test("import {\n  View,\n  Modal,\n} from 'react-native'")).toBe(true)
    expect(RULES.modal.test("import { Sheet } from './ui/Sheet'")).toBe(false)
  })

  it('flags a score badge coloured by its value, not a neutral one', () => {
    expect(RULES['score-tone'].test("{ label: `Readiness ${r}%`, tone: TONE[readinessTone(r)] }")).toBe(true)
    expect(RULES['score-tone'].test("{ label: `Practice accuracy ${a}%`, tone: a > 50 ? 'success' : 'danger' }")).toBe(true)
    expect(RULES['score-tone'].test("import { readinessTone } from '../../utils/readinessTone'")).toBe(true)
    expect(RULES['score-tone'].test("{ label: `Best mock ${m}%`, tone: 'neutral' }")).toBe(false)
    expect(RULES['score-tone'].test("{ label: `Focus #${p}`, tone: 'accent' }")).toBe(false)
  })
})
