import fs from 'fs'
import path from 'path'

// Iskotify ships one palette: the light "Refined Maroon" theme. There is no
// dark theme, no system-following scheme and no theme setting, so every
// screen is designed and checked against exactly one set of tokens. This
// guard keeps a second scheme from creeping back in.

const root = path.join(__dirname, '..')
const SOURCE_DIRS = ['app', 'components', 'hooks', 'theme', 'utils', 'services', 'db', 'contexts', 'lib']

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = SOURCE_DIRS.flatMap(d => sourceFiles(path.join(root, d)))
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo

describe('light-only theme', () => {
  it('asks the OS for light system UI and a light splash', () => {
    expect(app.userInterfaceStyle).toBe('light')
    expect(app.splash.backgroundColor.toLowerCase()).toBe('#fdf4f4')
  })

  it('tells the browser the page is light (color-scheme and theme-color)', () => {
    const html = fs.readFileSync(path.join(root, 'app', '+html.tsx'), 'utf8')
    expect(html).toMatch(/color-scheme:\s*light/)
    expect(html).toMatch(/<meta name="theme-color" content="#fdf4f4"/i)
  })

  it('has a single palette: no dark theme export', () => {
    const tokens = require('../theme/tokens')
    expect(tokens.darkTheme).toBeUndefined()
    expect(tokens.lightTheme).toBeDefined()
  })

  it.each([
    ['useColorScheme', /\buseColorScheme\b/],
    ['Appearance API', /\bAppearance\.(getColorScheme|addChangeListener|setColorScheme)\b/],
    ['darkTheme', /\bdarkTheme\b/],
    ['isDark', /\bisDark\b/],
    ['resolveColorScheme', /\bresolveColorScheme\b/],
    ['theme preference', /\b(themePref|setTheme)\b/],
  ])('no source file uses %s', (_label, pattern) => {
    const offenders = files
      .filter(f => pattern.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(root, f))
    expect(offenders).toEqual([])
  })

  // Glass and blur (iOS redesign P1a): a dark tint, a dark material, or an
  // adaptive one (the un-suffixed system materials and `colorScheme="auto"`
  // follow the phone's dark mode) would bring a second scheme back in.
  it.each([
    ['a dark blur tint', /\btint\s*[=:]\s*\{?\s*['"](dark|default|\w*Dark)['"]/],
    ['a dark system material', /['"]system\w*MaterialDark['"]/],
    ['an adaptive system material', /['"]system(UltraThin|Thin|Thick|Chrome)?Material['"]/],
    ['a dark or adaptive glass colour scheme', /\bcolorScheme\s*[=:]\s*\{?\s*['"](dark|auto)['"]/],
  ])('no source file uses %s', (_label, pattern) => {
    const offenders = files
      .filter(f => pattern.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(root, f))
    expect(offenders).toEqual([])
  })

  it('every GlassView pins the light colour scheme', () => {
    const users = files.filter(f => /<GlassView\b/.test(fs.readFileSync(f, 'utf8')))
    expect(users.length).toBeGreaterThan(0)
    for (const f of users) {
      const src = fs.readFileSync(f, 'utf8')
      const opened = src.match(/<GlassView\b/g)!.length
      const light = src.match(/<GlassView\b[^>]*colorScheme="light"/g)?.length ?? 0
      expect({ file: path.relative(root, f), light }).toEqual({ file: path.relative(root, f), light: opened })
    }
  })

  it('the glass tokens name light materials only', () => {
    const { glass } = require('../theme/tokens')
    expect(glass.iosMaterial).toMatch(/Light$/)
    expect(glass.androidTint).toBe('light')
  })
})
