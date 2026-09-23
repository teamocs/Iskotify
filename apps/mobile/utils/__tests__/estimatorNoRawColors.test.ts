// DESIGN.md: "Never write a raw colour value in a component." A hard-coded hex
// (or rgba literal) can't re-theme and can't be audited for contrast — every
// colour must resolve through useTheme(). This is a mechanical regression
// guard for the three estimator files that shipped with raw colours when the
// feature was first built (pre-redesign).
import fs from 'fs'
import path from 'path'

const FILES = [
  'app/estimator/index.tsx',
  'app/estimator/grades.tsx',
  'components/estimator/ScoreDisclaimerModal.tsx',
]

// Negative lookbehind excludes HTML numeric entities like `&#9888;` (the
// warning-triangle glyph), which are not colour literals.
const HEX_COLOR = /(?<!&)#[0-9a-fA-F]{3,8}\b/g
const RGBA_LITERAL = /rgba?\(\s*\d/g

describe('estimator screens use only theme tokens for colour', () => {
  for (const rel of FILES) {
    it(`${rel} has no raw hex or rgba(...) colour literals`, () => {
      const src = fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8')
      expect(src.match(HEX_COLOR) ?? []).toEqual([])
      expect(src.match(RGBA_LITERAL) ?? []).toEqual([])
    })
  }
})
