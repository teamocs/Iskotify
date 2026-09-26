// Redesign M3 guard: the last screens that had only token fixes (practice
// runners and choosers, notes, subjects, the Estimated Admission Score tool)
// plus the screens the 2026-09-26 route audit found with desktop issues.
//
// Same contract as the M2 guards (DESIGN.md "the rule that matters"): every
// colour through useTheme(), every text size through a textStyle role, no
// hard-coded font names, sentence-case labels, drawn icons (Lineicons) never
// emoji or a Unicode glyph standing in for one, and control state through
// aria-* props (react-native-web ignores accessibilityState).
//
// It adds one responsive rule: a screen must lay itself out through the
// design system (Screen / ScreenScroll / TwoColumn / useBreakpoint or a shared
// scaffold built on them), so no screen ships as a stretched phone layout on
// a desktop browser.
import fs from 'fs'
import path from 'path'

const SCREENS = [
  'app/practice/[topicId].tsx',
  'app/practice/deck/[deckId].tsx',
  'app/practice/due/index.tsx',
  'app/practice/start/[slug].tsx',
  'app/practice/listing/[slug].tsx',
  'app/practice/review/[slug].tsx',
  'app/practice/exam/index.tsx',
  'app/practice/upcat/[subtest].tsx',
  'app/practice/diagnostic/index.tsx',
  'app/notes/index.tsx',
  'app/notes/[id].tsx',
  'app/notes/archive.tsx',
  'app/notes/labels.tsx',
  'app/notes/trash.tsx',
  'app/subjects/[id].tsx',
  'app/estimator/index.tsx',
  'app/estimator/gwa.tsx',
  'app/estimator/grades.tsx',
  'app/requirements/index.tsx',
  'app/profile/scholarship-info.tsx',
  'app/results-tracker.tsx',
]

const COMPONENTS = [
  'components/ui/PageTitle.tsx',
  'components/practice/SessionChooser.tsx',
  'components/practice/SessionStates.tsx',
  'components/practice/FlashcardExam.tsx',
  'components/home/TodayHeader.tsx',
  'components/SubjectAccordion.tsx',
  'components/notes/NoteCard.tsx',
  'components/notes/NotesGrid.tsx',
  'components/notes/noteTone.ts',
  'components/practice/runner/PracticeFocusHeader.tsx',
  'components/practice/runner/RunnerActions.tsx',
  'components/practice/runner/RunnerFrame.tsx',
  'components/practice/runner/RunnerReview.tsx',
  'components/estimator/ScoreDisclaimerModal.tsx',
]

const HEX_COLOR = /(?<!&)#[0-9a-fA-F]{3,8}\b/g
const RGBA_LITERAL = /rgba?\(\s*\d/g
const FONT_SIZE = /fontSize\s*:/g
const FONT_NAME = /['"](Outfit|Lexend)_\d{3}\w*['"]/g
const UPPERCASE = /textTransform\s*:\s*['"]uppercase['"]|\.toUpperCase\(\)/g
const EMOJI = /\p{Extended_Pictographic}/gu
const ICON_GLYPHS = /[›‹▲▼✕✓✗＋↪⚠⠿↻★☆←→☁•]/g
const A11Y_STATE = /accessibilityState\s*=/g
const LAYOUT = /<(Screen|ScreenScroll|TwoColumn|InfoPage|SessionChooser|SessionLoading|SessionPreparing|SessionEmpty|FlashcardExam|Redirect)\b|useBreakpoint\(|useWebContentWidth\(/

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const read = (rel: string) => strip(fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8'))

describe('M3 screens use tokens, textStyle roles, aria state, real icons and responsive layout', () => {
  for (const rel of [...SCREENS, ...COMPONENTS]) {
    describe(rel, () => {
      it('exists', () => {
        expect(fs.existsSync(path.join(__dirname, '../..', rel))).toBe(true)
      })
      it('has no raw hex or rgba() colours', () => {
        expect(read(rel).match(HEX_COLOR) ?? []).toEqual([])
        expect(read(rel).match(RGBA_LITERAL) ?? []).toEqual([])
      })
      it('sets no fontSize by hand and names no font family literally', () => {
        expect(read(rel).match(FONT_SIZE) ?? []).toEqual([])
        expect(read(rel).match(FONT_NAME) ?? []).toEqual([])
      })
      it('has no uppercase labels', () => {
        expect(read(rel).match(UPPERCASE) ?? []).toEqual([])
      })
      it('uses no emoji or glyphs as icons', () => {
        expect(read(rel).match(EMOJI) ?? []).toEqual([])
        expect(read(rel).match(ICON_GLYPHS) ?? []).toEqual([])
      })
      it('exposes control state through aria-* props, not accessibilityState', () => {
        expect(read(rel).match(A11Y_STATE) ?? []).toEqual([])
      })
    })
  }

  for (const rel of SCREENS) {
    it(`${rel} lays out through the design system (not a stretched phone layout)`, () => {
      expect(read(rel)).toMatch(LAYOUT)
    })
  }
})

// Owner report (2026-09-26): on phones the tab headers were cluttered — a
// labelled "Refresh" pill and the avatar squeezed the page title and its
// subtitle into a narrow column. Every tab's web refresh control collapses to
// a 44pt icon on compact widths so the heading keeps the width.
describe('tab headers leave the heading the width on phones', () => {
  const TABS = ['app/(tabs)/index.tsx', 'app/(tabs)/practice.tsx', 'app/(tabs)/explore.tsx', 'app/(tabs)/profile.tsx']
  for (const rel of TABS) {
    it(`${rel}: the web refresh control is icon-only on compact`, () => {
      const uses = read(rel).match(/<WebRefreshButton\b[\s\S]*?\/>/g) ?? []
      expect(uses.length).toBeGreaterThan(0)
      for (const u of uses) expect(u).toMatch(/iconOnly=\{[^}]*compact[^}]*\}/)
    })
  }
})
