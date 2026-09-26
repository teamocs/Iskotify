// Redesign M2 guard for the remaining screens (first run, auth, settings,
// help/about/privacy) and the shared primitives they lean on. Same contract as
// app/(tabs)/__tests__/m2DesignTokens.test.ts: every colour through useTheme(),
// every text size through a textStyle role, no hard-coded font names, and
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
const FONT_NAME = /['"](Outfit|Lexend)_\d{3}\w*['"]/g
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
