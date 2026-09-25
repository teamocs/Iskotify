/**
 * Guard: no non-test source under app/, components/ or hooks/ may use
 * `accessibilityState`.
 *
 * react-native-web 0.21's createDOMProps ignores the nested accessibilityState
 * prop, so selected / checked / expanded / disabled / busy set that way never
 * reach the DOM and screen readers on the web build stay silent. The aria-*
 * props (aria-selected, aria-checked, aria-expanded, aria-disabled, aria-busy)
 * work on both platforms: RNW maps them to DOM attributes and React Native
 * folds them into accessibilityState on the native view.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const SCOPE = ['app', 'components', 'hooks']

function walk(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs).flatMap(name => {
    if (name === '__tests__' || name === 'node_modules') return []
    const child = path.join(rel, name)
    if (fs.statSync(path.join(ROOT, child)).isDirectory()) return walk(child)
    if (/\.test\.tsx?$/.test(name)) return []
    return /\.tsx?$/.test(name) ? [child] : []
  })
}

/** Strip comments (keeping newlines) so docs may still explain the rule. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('no accessibilityState in mobile source', () => {
  const files = SCOPE.flatMap(walk)

  it('scans a meaningful number of source files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('uses aria-* props instead of accessibilityState everywhere', () => {
    const hits: string[] = []
    for (const file of files) {
      codeOnly(fs.readFileSync(path.join(ROOT, file), 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/\baccessibilityState\b/.test(line)) hits.push(`${file.replace(/\\/g, '/')}:${i + 1}  ${line.trim().slice(0, 100)}`)
        })
    }
    expect(hits).toEqual([])
  })
})
