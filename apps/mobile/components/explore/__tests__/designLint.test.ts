/**
 * Design-system guard for the Explore area: the Explore tab, Search, the
 * school, listing, course and career screens and their components (redesign
 * M2, extended by the iOS-language redesign P4). DESIGN.md: never a raw colour
 * in a component, type comes from the iOS text roles, and icons are drawn
 * (Lineicons), never emoji or Unicode glyphs. Comments are stripped first so
 * prose like "a → b" in a comment is allowed.
 *
 * P4 adds:
 * - no legacy type API: no textStyle() (its role names, bodySm, titleSm,
 *   label, button…, are retired here), no typo / typography sizes, no
 *   hand-set fontSize at all;
 * - no fixed `height` on a text container: a numeric height only on a
 *   square or circle that also sets `width` (icon tiles, dots), or a hairline;
 * - rows press through PressableScale (no bare Pressable or Touchable*);
 * - sheets through the P3 Sheet (no raw RN Modal).
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

const FILES = [
  'app/(tabs)/explore.tsx',
  'app/(tabs)/search/index.tsx',
  'components/explore/NewsFeed.tsx',
  'components/explore/ListingCard.tsx',
  'components/explore/ExploreGrid.tsx',
  'components/explore/SearchField.tsx',
  'components/explore/DetailTopBar.tsx',
  'components/explore/Disclosure.tsx',
  'components/explore/LinkRow.tsx',
  'components/explore/DateTile.tsx',
  'components/explore/LogoTile.tsx',
  'components/explore/SectionRail.tsx',
  'components/explore/FeaturedCard.tsx',
  'components/explore/exploreModel.ts',
  'components/schools/SchoolsDirectory.tsx',
  'components/schools/SchoolFiltersSheet.tsx',
  'components/schools/schoolModel.ts',
  'components/schools/schoolSheet.ts',
  'components/scholarships/MatchPill.tsx',
  'components/career/AiImpactCard.tsx',
  'components/updates/NewsDetailModal.tsx',
  'components/RequirementsChecklist.tsx',
  'components/SuggestDateCorrectionModal.tsx',
  'components/SchoolPicker.tsx',
  'app/listings/[slug].tsx',
  'app/schools/index.tsx',
  'app/schools/[slug].tsx',
  'app/schools/course/index.tsx',
  'app/schools/course/[code].tsx',
  'app/career/[courseId].tsx',
  'app/career/country/[code].tsx',
  'app/requirements/index.tsx',
  'app/results-tracker.tsx',
]

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

// Emoji and the glyphs this codebase used as stand-in icons.
const GLYPH = /[\p{Extended_Pictographic}‹›←-⇿✓✕★•✎]/u

// The P1b aliases the iOS roles replaced (theme/tokens legacyTextRoleMap).
const LEGACY_ROLE = /\b(?:textStyle|iosTextStyle)\(\s*['"](?:display|title|titleSm|bodySm|label|button)['"]|\brole=["'](?:display|title|titleSm|bodySm|label|button)["']/

/** Object literals (innermost) that set a numeric `height`. */
function fixedHeights(src: string): string[] {
  return (src.match(/\{[^{}]*\}/g) ?? []).filter((obj) => {
    const m = /(?:^|[^A-Za-z])height:\s*(\d+(?:\.\d+)?)/.exec(obj)
    if (!m) return false
    if (Number(m[1]) <= 4) return false // hairlines, the sheet grabber
    return !/(?:^|[^A-Za-z])width:/.test(obj) // squares and circles are not text containers
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
    const hit = src.split('\n').find(line => GLYPH.test(line))
    expect(hit).toBeUndefined()
  })

  it('does not use the retired ListCard', () => {
    expect(src).not.toMatch(/ui\/ListCard/)
  })
})

describe('the guard itself', () => {
  it('flags a fixed-height text container but not a square tile or a hairline', () => {
    expect(fixedHeights('<View style={{ height: 48, paddingHorizontal: 8 }} />')).toHaveLength(1)
    expect(fixedHeights('<View style={{ width: 44, height: 44 }} />')).toEqual([])
    expect(fixedHeights('<View style={{ height: 1, backgroundColor: t.divider }} />')).toEqual([])
    expect(fixedHeights('<View style={{ minHeight: 48 }} />')).toEqual([])
  })

  it('flags the retired role names', () => {
    expect(LEGACY_ROLE.test("textStyle('bodySm', t.textPrimary)")).toBe(true)
    expect(LEGACY_ROLE.test('<Text role="label">')).toBe(true)
    expect(LEGACY_ROLE.test("iosTextStyle('footnote', t.textPrimary)")).toBe(false)
  })
})
