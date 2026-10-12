import fs from 'fs'
import path from 'path'

// iOS redesign P1b: the app draws every word in the platform UI font (SF Pro
// on iOS, Roboto on Android, the system stack on web). Outfit and Lexend are
// retired, nothing is loaded at startup, and type comes from the text roles
// in theme/tokens.ts. This guard keeps a brand font from creeping back in.

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

describe('system font only (no brand fonts)', () => {
  it('scans the mobile source', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it.each([
    ['Outfit', /Outfit/],
    ['Lexend', /Lexend/],
    ['@expo-google-fonts', /@expo-google-fonts/],
    // The retired `fonts` export of theme/tokens: imported, or used as `fonts.x`.
    ['the retired fonts token', /import\s*\{[^}]*\bfonts\b[^}]*\}\s*from\s*['"][^'"]*theme\/tokens['"]|(?<![\w.$])fonts\.(heading|headingSemi|headingReg|body|bodyMedium|bodySemi)\b/],
    ['useFonts', /\buseFonts\b/],
  ])('no source file mentions %s', (_label, pattern) => {
    const offenders = files
      .filter(f => pattern.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(root, f))
    expect(offenders).toEqual([])
  })

  // Families come only from theme/tokens (systemFont / weight()); a literal
  // name anywhere else is a brand font sneaking back in.
  it('sets no literal fontFamily outside theme/tokens.ts', () => {
    const tokens = path.join(root, 'theme', 'tokens.ts')
    const offenders = files
      .filter(f => f !== tokens && /fontFamily\s*:\s*['"`]/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(root, f))
    expect(offenders).toEqual([])
  })

  it('does not depend on a Google font package', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter(d => d.startsWith('@expo-google-fonts/'))).toEqual([])
  })

  it('sets the web body to the system font stack', () => {
    const html = fs.readFileSync(path.join(root, 'app', '+html.tsx'), 'utf8')
    expect(html).toMatch(/font-family:\s*-apple-system, BlinkMacSystemFont/)
  })
})
