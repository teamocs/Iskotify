// Redesign M2 guard for the remaining screens (first run, auth, settings,
// help/about/privacy/terms) and the shared primitives they lean on. Same contract as
// app/(tabs)/__tests__/m2DesignTokens.test.ts: every colour through useTheme(),
// every text size through a type role (P4: the iOS roles; the account screens'
// legacy names are banned by p4AccountDesignLint.test.ts), no hard-coded font names, and
// drawn icons (Lineicons), never emoji or a Unicode glyph standing in for one.
// State goes through aria-* props: react-native-web 0.21 ignores
// accessibilityState, so a screen that only sets it is silent on the web build.
import fs from 'fs'
import path from 'path'

const FILES = [
  'app/welcome.tsx',
  'app/tour.tsx',
  'components/walkthrough/TourCard.tsx',
  'components/walkthrough/TourVisuals.tsx',
  'components/walkthrough/TourControls.tsx',
  'components/auth/BrandPanel.tsx',
  'app/landing.tsx',
  'app/onboarding.tsx',
  'app/auth/sign-in.tsx',
  'app/auth/callback.tsx',
  'app/auth/reset-password.tsx',
  'app/settings.tsx',
  'app/settings/leave-feedback.tsx',
  'app/settings/report-bug.tsx',
  'app/help.tsx',
  'app/about.tsx',
  'app/privacy.tsx',
  'app/terms.tsx',
  'app/upgrade.tsx',
  'components/premium/UpgradeCard.tsx',
  'components/DeleteAccountSheet.tsx',
  'components/auth/AuthLayout.tsx',
  'components/onboarding/StepShell.tsx',
  'components/onboarding/ChoiceRow.tsx',
  'components/onboarding/PreAssessment.tsx',
  'components/info/InfoPage.tsx',
  'components/ui/TextField.tsx',
  'components/ui/InfoBanner.tsx',
  'components/ui/WebRefreshButton.tsx',
  'components/ui/ListRow.tsx',
  'components/ui/Sheet.tsx',
  'components/scholarships/MatchPill.tsx',
]

const HEX_COLOR = /(?<!&)#[0-9a-fA-F]{3,8}\b/g
const RGBA_LITERAL = /rgba?\(\s*\d/g
const FONT_SIZE = /fontSize\s*:/g
// Any literal family (the system font comes from theme/tokens; see __tests__/noBrandFonts.test.ts).
const FONT_NAME = /fontFamily\s*:\s*['"`]/g
const UPPERCASE = /textTransform\s*:\s*['"]uppercase['"]|\.toUpperCase\(\)/g
const EMOJI = /\p{Extended_Pictographic}/gu
const ICON_GLYPHS = /[›‹▲▼✕✓＋↪⚠⠿↻★☆←→☁]/g
const A11Y_STATE = /accessibilityState\s*=/g

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('M2 remaining screens use tokens, textStyle roles, aria state and real icons', () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const read = () => strip(fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8'))
      it('has no raw hex or rgba() colours', () => {
        expect(read().match(HEX_COLOR) ?? []).toEqual([])
        expect(read().match(RGBA_LITERAL) ?? []).toEqual([])
      })
      it('sets no fontSize by hand and names no font family literally', () => {
        expect(read().match(FONT_SIZE) ?? []).toEqual([])
        expect(read().match(FONT_NAME) ?? []).toEqual([])
      })
      it('has no uppercase labels', () => {
        expect(read().match(UPPERCASE) ?? []).toEqual([])
      })
      it('uses no emoji or glyphs as icons', () => {
        expect(read().match(EMOJI) ?? []).toEqual([])
        expect(read().match(ICON_GLYPHS) ?? []).toEqual([])
      })
      it('exposes control state through aria-* props, not accessibilityState', () => {
        expect(read().match(A11Y_STATE) ?? []).toEqual([])
      })
    })
  }
})

// iOS redesign P4 (the remaining screens): onboarding, auth, the guest
// diagnostic, consent, the tour, subject detail, the overlays and the shared
// primitives they were rebuilt on. On top of the M2 contract above:
// - no legacy type API: no textStyle(), no typo / typography sizes, no
//   retired role name (display, title, titleSm, bodySm, label, button);
// - the iOS shape scale only: no legacy radius keys (md, lg, xl, xxl, pill);
// - no raw RN Modal (the P3 Sheet is the one primitive that wraps it);
// - no fixed `height` on a text container: a numeric height only on a square
//   or circle that also sets `width`, or a hairline / thin bar (6 or less).
const P4_FILES = [
  'app/auth/sign-in.tsx',
  'app/auth/callback.tsx',
  'app/auth/reset-password.tsx',
  'app/consent.tsx',
  'app/onboarding.tsx',
  'app/try.tsx',
  'app/tour.tsx',
  'app/welcome.tsx',
  'app/subjects/[id].tsx',
  'components/auth/AuthLayout.tsx',
  'components/auth/BrandPanel.tsx',
  'components/consent/ConsentControls.tsx',
  'components/consent/LegalLinks.tsx',
  'components/consent/SensitiveConsentToggle.tsx',
  'components/consent/WithdrawSensitiveButton.tsx',
  'components/info/InfoPage.tsx',
  'components/onboarding/StepShell.tsx',
  'components/onboarding/ChoiceRow.tsx',
  'components/onboarding/PreAssessment.tsx',
  'components/walkthrough/TourCard.tsx',
  'components/walkthrough/TourControls.tsx',
  'components/walkthrough/TourVisuals.tsx',
  'components/web/SidebarNav.tsx',
  'components/SyncErrorBanner.tsx',
  'components/WebSetupOverlay.tsx',
  'components/TargetCoursesCard.tsx',
  'components/SubjectAccordion.tsx',
  'components/navigation/FloatingTabBar.tsx',
  'components/navigation/LargeTitleHeader.tsx',
  'components/ui/Avatar.tsx',
  'components/ui/Badge.tsx',
  'components/ui/Chip.tsx',
  'components/ui/ErrorState.tsx',
  'components/ui/InfoBanner.tsx',
  'components/ui/PageTitle.tsx',
  'components/ui/PageTransition.tsx',
  'components/ui/ProgressRing.tsx',
  'components/ui/SearchField.tsx',
  'components/ui/SectionHeader.tsx',
  'components/ui/Sheet.tsx',
  'components/ui/StatNumber.tsx',
  'components/ui/TextField.tsx',
  'components/ui/WebRefreshButton.tsx',
]

const LEGACY_TYPE = /\btextStyle\(|\btextStyles\b|\btypo\b|\btypography\.|\biosTextStyle\(\s*['"](?:display|title|titleSm|bodySm|label|button)['"]|<\w+\b[^>]*\brole=["'](?:display|title|titleSm|bodySm|label|button)["']/
const LEGACY_RADIUS = /\bradius\.(?:md|lg|xl|xxl|pill)\b/g
const RAW_MODAL = /import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*['"]react-native['"]/

/** Object literals (innermost) that set a numeric `height` on something that is not a square, circle or thin bar. */
function fixedHeights(src: string): string[] {
  return (src.match(/\{[^{}]*\}/g) ?? []).filter((obj) => {
    const m = /(?:^|[^A-Za-z])height:\s*(\d+(?:\.\d+)?)/.exec(obj)
    if (!m) return false
    if (Number(m[1]) <= 6) return false
    return !/(?:^|[^A-Za-z])width:/.test(obj)
  })
}

describe('iOS P4 remaining screens use the iOS roles, shapes and sheets', () => {
  it('the guard flags what it should', () => {
    expect(LEGACY_TYPE.test("textStyle('bodySm', c)")).toBe(true)
    expect(LEGACY_TYPE.test('<Line role="label">')).toBe(true)
    expect(LEGACY_TYPE.test("iosTextStyle('footnote', c)")).toBe(false)
    expect('radius.lg'.match(LEGACY_RADIUS)).toBeTruthy()
    expect('radius.group'.match(LEGACY_RADIUS)).toBeNull()
    expect(fixedHeights('<View style={{ height: 48, paddingHorizontal: 8 }} />')).toHaveLength(1)
    expect(fixedHeights('<View style={{ width: 44, height: 44 }} />')).toEqual([])
    expect(fixedHeights('<View style={{ height: 4, borderRadius: 2 }} />')).toEqual([])
  })

  for (const rel of P4_FILES) {
    describe(rel, () => {
      const read = () => strip(fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8'))
      it('uses no legacy type API or retired role names, and sets no fontSize', () => {
        expect(read()).not.toMatch(LEGACY_TYPE)
        expect(read().match(FONT_SIZE) ?? []).toEqual([])
      })
      it('uses the iOS shape scale (no legacy radius keys)', () => {
        expect(read().match(LEGACY_RADIUS) ?? []).toEqual([])
      })
      it('opens no raw Modal', () => {
        if (rel === 'components/ui/Sheet.tsx') return // the primitive that wraps it
        expect(read()).not.toMatch(RAW_MODAL)
      })
      it('never fixes the height of a text container (minHeight grows with Dynamic Type)', () => {
        expect(fixedHeights(read())).toEqual([])
      })
      it('has no raw colours, emoji or glyph icons', () => {
        expect(read().match(HEX_COLOR) ?? []).toEqual([])
        expect(read().match(RGBA_LITERAL) ?? []).toEqual([])
        expect(read().match(EMOJI) ?? []).toEqual([])
        expect(read().match(ICON_GLYPHS) ?? []).toEqual([])
      })
    })
  }
})
