/**
 * Design-system guard for the Explore area (redesign M2). DESIGN.md: never a
 * raw colour in a component, type sizes come from tokens, and icons are drawn
 * (Lineicons), never emoji or Unicode glyphs. Comments are stripped first so
 * prose like "a → b" in a comment is allowed.
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

const FILES = [
  'app/(tabs)/explore.tsx',
  'components/explore/NewsFeed.tsx',
  'components/explore/ListingCard.tsx',
  'components/explore/ExploreGrid.tsx',
  'components/explore/SearchField.tsx',
  'components/explore/DetailTopBar.tsx',
  'components/explore/Disclosure.tsx',
  'components/explore/LinkRow.tsx',
  'components/schools/SchoolsDirectory.tsx',
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

describe.each(FILES)('%s', (rel) => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

  it('has no raw hex or rgba colours', () => {
    expect(src.match(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/g)).toBeNull()
  })

  it('has no numeric fontSize (type comes from tokens)', () => {
    expect(src.match(/fontSize:\s*\d/g)).toBeNull()
  })

  it('uses no emoji or Unicode glyphs as icons', () => {
    const hit = src.split('\n').find(line => GLYPH.test(line))
    expect(hit).toBeUndefined()
  })

  it('does not use the retired ListCard', () => {
    expect(src).not.toMatch(/ui\/ListCard/)
  })
})
