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
  'app/(tabs)/profile.tsx',
  'app/profile/scholarship-info.tsx',
  'components/home/TodayHeader.tsx',
  'components/home/NextStepCard.tsx',
  'components/home/TodaysPlanFold.tsx',
  'components/home/FocusExamsFold.tsx',
  'components/home/NewsAndDates.tsx',
  'components/home/RemindersSheet.tsx',
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
        expect(read().match(UPPERCASE) ?? []).toEqual([])
      })
      it('uses no emoji or glyphs as icons', () => {
        expect(read().match(EMOJI) ?? []).toEqual([])
        expect(read().match(ICON_GLYPHS) ?? []).toEqual([])
      })
    })
  }
})
