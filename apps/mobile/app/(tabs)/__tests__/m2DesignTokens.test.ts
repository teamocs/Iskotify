// Redesign M2 guard for Today, Progress and Profile (DESIGN.md "the rule that
// matters" + the redesign brief's token-drift finding). Every colour resolves
// through useTheme(), every text size through a textStyle role, labels are
// sentence case, and icons are drawn (Lineicons) — never emoji or a Unicode
// glyph standing in for one.
import fs from 'fs'
import path from 'path'

const FILES = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/progress.tsx',
  'app/profile/index.tsx',
  'app/profile/scholarship-info.tsx',
  'components/home/TodayHeader.tsx',
  'components/home/NextStepCard.tsx',
  'components/home/TodaysPlanFold.tsx',
  'components/home/FocusExamsFold.tsx',
  'components/home/NewsAndDates.tsx',
  'components/home/RemindersSheet.tsx',
  'components/home/ExamCountdowns.tsx',
  'components/home/TodaySectionHeader.tsx',
  'components/home/ScholarshipProfilePrompt.tsx',
  'components/home/RecommendedScholarships.tsx',
  'components/analytics/AnalyticsDashboard.tsx',
  'components/analytics/ProgressSection.tsx',
  'components/analytics/SubjectReadinessList.tsx',
  'components/analytics/TrendLineChart.tsx',
  'components/analytics/WeeklyChart.tsx',
]

const HEX_COLOR = /(?<!&)#[0-9a-fA-F]{3,8}\b/g
const RGBA_LITERAL = /rgba?\(\s*\d/g
const FONT_SIZE = /fontSize\s*:/g
const UPPERCASE = /textTransform\s*:\s*['"]uppercase['"]|\.toUpperCase\(\)/g
const EMOJI = /\p{Extended_Pictographic}/gu
// Glyphs that were standing in for icons (chevrons, carets, close, check, plus…).
const ICON_GLYPHS = /[›‹▲▼✕✓＋↪⚠⠿]/g
// The one sanctioned uppercase: Today's date eyebrow (owner layout spec,
// 2026-10-13: "footnote, uppercase, textSecondary"). It is a transform, so
// the text and its accessible name stay sentence case.
const UPPERCASE_ALLOWED: Record<string, number> = { 'components/home/TodayHeader.tsx': 1 }

function strip(src: string): string {
  // Comments may mention the glyphs they replaced; only code counts.
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('Today / Progress / Profile use tokens, textStyle roles and real icons', () => {
  for (const rel of FILES) {
    describe(rel, () => {
      // Read inside each test so a missing file fails its own tests, not the suite.
      const read = () => strip(fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8'))
      it('has no raw hex or rgba() colours', () => {
        expect(read().match(HEX_COLOR) ?? []).toEqual([])
        expect(read().match(RGBA_LITERAL) ?? []).toEqual([])
      })
      it('sets no fontSize by hand (textStyle roles only)', () => {
        expect(read().match(FONT_SIZE) ?? []).toEqual([])
      })
      it('has no uppercase labels', () => {
        expect((read().match(UPPERCASE) ?? []).length).toBe(UPPERCASE_ALLOWED[rel] ?? 0)
      })
      it('uses no emoji or glyphs as icons', () => {
        expect(read().match(EMOJI) ?? []).toEqual([])
        expect(read().match(ICON_GLYPHS) ?? []).toEqual([])
      })
    })
  }
})

// iOS redesign P4 (Today): the whole area speaks the iOS type roles and lets
// text grow with Dynamic Type.
function areaFiles(dir: string): string[] {
  const abs = path.join(__dirname, '../../..', dir)
  return fs.readdirSync(abs).filter(f => /\.tsx?$/.test(f)).map(f => `${dir}/${f}`)
}

// The legacy API (textStyle / typo) and legacy-only role names. headline,
// body, caption and numeric are iOS names too, so they are allowed.
const LEGACY_API = /\btextStyle\(|\btypo\b/g
const LEGACY_ROLE = /\brole=["'](display|title|titleSm|bodySm|label|button)["']|iosTextStyle\(\s*["'](display|title|titleSm|bodySm|label|button)["']/g
// A fixed `height:` (minHeight, maxHeight and lineHeight are fine). Text
// containers must grow, and icon boxes square up with aspectRatio instead.
const FIXED_HEIGHT = /\bheight\s*:/g

describe('Today area (components/home) uses iOS roles and no fixed heights', () => {
  const files = areaFiles('components/home')
  it('finds the area', () => {
    expect(files).toEqual(expect.arrayContaining(['components/home/TodayHeader.tsx', 'components/home/NextStepCard.tsx']))
  })
  it('the patterns catch what they should', () => {
    expect("textStyle('bodySm', c)".match(LEGACY_API)).toBeTruthy()
    expect('<Text role="titleSm">'.match(LEGACY_ROLE)).toBeTruthy()
    expect('<Text role="title2">'.match(LEGACY_ROLE)).toBeNull()
    expect('{ height: 24 }'.match(FIXED_HEIGHT)).toBeTruthy()
    expect('{ minHeight: 24, lineHeight: 20 }'.match(FIXED_HEIGHT)).toBeNull()
  })
  for (const rel of files) {
    describe(rel, () => {
      const read = () => strip(fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8'))
      it('has no legacy role names or textStyle/typo calls', () => {
        expect(read().match(LEGACY_API) ?? []).toEqual([])
        expect(read().match(LEGACY_ROLE) ?? []).toEqual([])
      })
      it('sets no fixed height on text containers', () => {
        expect(read().match(FIXED_HEIGHT) ?? []).toEqual([])
      })
      it('sets no fontSize by hand', () => {
        expect(read().match(FONT_SIZE) ?? []).toEqual([])
      })
    })
  }
})

describe('calendar (components/calendar) type goes through iOS roles', () => {
  for (const rel of areaFiles('components/calendar')) {
    describe(rel, () => {
      const read = () => strip(fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8'))
      it('has no typo.* or hand-set fontSize', () => {
        expect(read().match(LEGACY_API) ?? []).toEqual([])
        expect(read().match(FONT_SIZE) ?? []).toEqual([])
      })
      it('has no uppercase labels, emoji or glyph icons', () => {
        expect(read().match(UPPERCASE) ?? []).toEqual([])
        expect(read().match(EMOJI) ?? []).toEqual([])
        expect(read().match(ICON_GLYPHS) ?? []).toEqual([])
      })
    })
  }
})
