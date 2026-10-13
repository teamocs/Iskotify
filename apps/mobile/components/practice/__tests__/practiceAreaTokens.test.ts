import fs from 'fs'
import path from 'path'
import ts from 'typescript'

/**
 * Redesign M2 (Practice area) guard — mirrors apps/admin's noRawColours test
 * for the native screens this milestone owns: the Practice tab, the exam flow,
 * subjects, notes and the Estimated Admission Score tool.
 *
 * DESIGN.md: "Never write a raw colour value in a component" (a hard-coded
 * colour cannot re-theme and cannot be audited), sizes come from the type
 * roles (never a numeric fontSize), and icons are drawn from Lineicons, never
 * emoji standing in for an icon system.
 *
 * iOS redesign P4 (Practice) extends it: the iOS text roles only (no legacy
 * textStyle() roles, no typo.* scale), no fixed height on anything that holds
 * text (minHeight grows with Dynamic Type), calm English copy, and no
 * pass/fail verdicts or percentiles.
 */
const ROOT = path.resolve(__dirname, '../../..')

const SCOPE = [
  'app/(tabs)/practice.tsx',
  'app/practice',
  'app/subjects',
  'app/notes',
  'app/estimator',
  'components/practice',
  'components/estimator',
]

function walk(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [rel]
  return fs.readdirSync(abs).flatMap(name => {
    if (name === '__tests__') return []
    const child = path.join(rel, name)
    const st = fs.statSync(path.join(ROOT, child))
    if (st.isDirectory()) return walk(child)
    return /\.tsx?$/.test(name) ? [child] : []
  })
}

const FILES = SCOPE.flatMap(walk)

/** Strip line and block comments so documentation can still name a colour. */
function codeOnly(src: string): string {
  // Blank block comments but keep their newlines, so reported line numbers stay true.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type Hit = { file: string; line: number; text: string }

function scan(re: RegExp): Hit[] {
  const hits: Hit[] = []
  for (const file of FILES) {
    const lines = codeOnly(fs.readFileSync(path.join(ROOT, file), 'utf8')).split('\n')
    lines.forEach((text, i) => {
      re.lastIndex = 0
      if (re.test(text)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 100) })
    })
  }
  return hits
}

/** Fails with EVERY hit listed (a toBe('') string diff gets truncated by Jest). */
function expectNone(hits: Hit[]) {
  if (hits.length) throw new Error(`${hits.length} hit(s):\n` + hits.map(h => `${h.file}:${h.line}  ${h.text}`).join('\n'))
}

// ── AST helpers ─────────────────────────────────────────────────────────────

function parse(file: string, source?: string): ts.SourceFile {
  const text = source ?? fs.readFileSync(path.join(ROOT, file), 'utf8')
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

function isHeightKey(p: ts.Node): boolean {
  if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text === 'height'
  if (ts.isShorthandPropertyAssignment(p)) return p.name.text === 'height'
  return false
}

/** A `height` style key (not minHeight / maxHeight) anywhere inside `node`. */
function hasFixedHeight(node: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node) => {
    if (found) return
    if (isHeightKey(n)) found = true
    else ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

function tagName(n: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): string {
  return n.tagName.getText(sf)
}

/**
 * The tags in this file that put text on screen:
 * - `Text`, and any `*.Text` (Animated.Text);
 * - an import aliased from a Text (`import { Text as RoleText }`);
 * - a component declared in this file whose body renders one of those
 *   (resolved to a fixed point, so a Label that renders a Caption counts).
 */
function textTags(sf: ts.SourceFile): Set<string> {
  const tags = new Set<string>(['Text'])
  ts.forEachChild(sf, n => {
    if (ts.isImportDeclaration(n) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === 'Text') tags.add(el.name.text)
      }
    }
  })
  const components: { name: string; body: ts.Node }[] = []
  const collect = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) components.push({ name: n.name.text, body: n.body })
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      components.push({ name: n.name.text, body: n.initializer.body })
    }
    ts.forEachChild(n, collect)
  }
  collect(sf)
  for (let grew = true; grew;) {
    grew = false
    for (const c of components) {
      if (!tags.has(c.name) && rendersText(c.body, tags, sf)) { tags.add(c.name); grew = true }
    }
  }
  return tags
}

/**
 * Renders text: a text tag (or any `*.Text`), a JSX text node, or a child
 * component handed a visible label (`label=` / `title=` / `value=` string
 * props draw words: Button, Badge, Chip, StatNumber, InsetRow...).
 */
function rendersText(node: ts.Node, tags: Set<string>, sf: ts.SourceFile): boolean {
  let found = false
  const visit = (n: ts.Node) => {
    if (found) return
    if (ts.isJsxText(n) && n.text.trim()) { found = true; return }
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = tagName(n, sf)
      if (tags.has(name) || /\.Text$/.test(name)) { found = true; return }
      const labelled = n.attributes.properties.some(a => ts.isJsxAttribute(a)
        && ['label', 'title', 'value'].includes(a.name.getText(sf)))
      if (labelled && /^[A-Z]/.test(name)) { found = true; return }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * JSX elements whose `style` sets a fixed `height` and that render text
 * inside (see rendersText): at large Dynamic Type sizes that text overflows.
 * The style may be inline, a property of a style object (`s.disc`, a
 * StyleSheet entry), or an identifier bound to an object with a height
 * (`const box = { height: 40 }` ... `style={box}` or `style={[box, x]}`).
 */
function fixedHeightTextContainers(file: string, source?: string): Hit[] {
  const sf = parse(file, source)
  const tags = textTags(sf)
  // Style-object keys (StyleSheet entries, nested objects) and plain consts that set a height.
  const sheetKeys = new Set<string>()
  const heightConsts = new Set<string>()
  const collect = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && ts.isObjectLiteralExpression(n.initializer)
      && n.initializer.properties.some(isHeightKey)) {
      sheetKeys.add(n.name.text)
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let init: ts.Expression = n.initializer
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
      if (ts.isObjectLiteralExpression(init) && init.properties.some(isHeightKey)) heightConsts.add(n.name.text)
    }
    ts.forEachChild(n, collect)
  }
  collect(sf)

  const hits: Hit[] = []
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const style = n.openingElement.attributes.properties.find(
        a => ts.isJsxAttribute(a) && a.name.getText(sf) === 'style',
      ) as ts.JsxAttribute | undefined
      const expr = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : undefined
      if (expr) {
        let fixed = hasFixedHeight(expr)
        if (!fixed) {
          const props: string[] = []
          const idents: string[] = []
          const findRefs = (r: ts.Node) => {
            if (ts.isPropertyAccessExpression(r)) props.push(r.name.text)
            else if (ts.isIdentifier(r)) idents.push(r.text)
            ts.forEachChild(r, findRefs)
          }
          findRefs(expr)
          fixed = props.some(k => sheetKeys.has(k)) || idents.some(k => heightConsts.has(k))
        }
        if (fixed && n.children.some(c => rendersText(c, tags, sf))) {
          hits.push({ file, line: lineOf(sf, n), text: n.openingElement.getText(sf).replace(/\s+/g, ' ').slice(0, 100) })
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

/** User-facing copy: JSX text and string literals (console.* calls and imports excluded). */
function copyHits(re: RegExp): Hit[] {
  const hits: Hit[] = []
  for (const file of FILES) {
    const sf = parse(file)
    const visit = (n: ts.Node) => {
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
      if (ts.isCallExpression(n) && /^console\./.test(n.expression.getText(sf))) return
      if (ts.isJsxText(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
        const text = n.getText(sf)
        if (re.test(text)) hits.push({ file, line: lineOf(sf, n), text: text.trim().replace(/\s+/g, ' ').slice(0, 100) })
        return
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return hits
}

describe('Practice area design-token hygiene', () => {
  it('scans a non-trivial set of files', () => {
    expect(FILES.length).toBeGreaterThan(25)
  })

  it('has no raw hex colour literals', () => {
    expectNone(scan(/['"`]#[0-9a-fA-F]{3,8}['"`]/))
  })

  it('has no raw rgb()/rgba() colour literals', () => {
    expectNone(scan(/rgba?\(/))
  })

  it('has no numeric fontSize (use the iOS text roles)', () => {
    expectNone(scan(/fontSize:\s*\d/))
  })

  it('uses no emoji as icons (Lineicons only)', () => {
    expectNone(scan(/\p{Extended_Pictographic}/u))
  })

  // ── iOS redesign P4 ────────────────────────────────────────────────────
  it('uses the iOS text roles, never the legacy textStyle() roles', () => {
    expectNone(scan(/\btextStyles?\b/))
  })

  it('never reads the retired typography scale (typo.* / typography)', () => {
    expectNone(scan(/\btypo\b|\btypography\b/))
  })

  it('never sets fontSize by hand at all', () => {
    expectNone(scan(/\bfontSize\s*:/))
  })

  it('never gives a text container a fixed height (minHeight grows with Dynamic Type)', () => {
    expectNone(FILES.flatMap(f => fixedHeightTextContainers(f)))
  })

  // The probe is an in-memory source (nothing is written into the tree).
  // Each `hit` line must be flagged and each `ok` line must not.
  it.each([
    ['inline height around a Text', 'const a = <View style={{ height: 40 }}><Text>A</Text></View>', true],
    ['a StyleSheet entry', 'const b = <View style={s.disc}><Text>B</Text></View>', true],
    ['Animated.Text (any *.Text)', 'const c = <View style={{ height: 30 }}><Animated.Text>C</Animated.Text></View>', true],
    ['an aliased Text import', 'const d = <View style={{ height: 30 }}><RoleText role="body">D</RoleText></View>', true],
    ['a local component that renders a label', 'const e = <View style={{ height: 30 }}><Label /></View>', true],
    ['a nested local component (Label renders Caption)', 'const f = <View style={{ height: 30 }}><Wrapper /></View>', true],
    ['a child handed a visible label prop', 'const g = <View style={{ height: 30 }}><Badge label="New" /></View>', true],
    ['an identifier style bound to a top-level const', 'const h = <View style={box}><Text>H</Text></View>', true],
    ['an identifier inside a style array', 'const i = <View style={[box, { padding: 4 }]}><Text>I</Text></View>', true],
    ['raw JSX text', 'const j = <View style={{ height: 20 }}>Words</View>', true],
    ['a bar with no text', 'const k = <View style={{ height: 4 }} />', false],
    ['a fixed box around an icon only', 'const l = <View style={{ height: 44, width: 44 }}><Lineicons icon={X} /></View>', false],
    ['minHeight around text', 'const m = <View style={{ minHeight: 44 }}><Text>M</Text></View>', false],
  ])('fixed-height probe: %s', (_name, line, flagged) => {
    const source = [
      "import { Text as RoleText } from '../ui/Text'",
      'const s = StyleSheet.create({ disc: { width: 22, height: 22 } })',
      'const box = { height: 40, width: 40 }',
      'function Caption() { return <Text>caption</Text> }',
      'function Label() { return <Text>label</Text> }',
      'const Wrapper = () => <View><Caption /></View>',
      line,
    ].join('\n')
    const hits = fixedHeightTextContainers('probe.tsx', source).filter(h => h.line === 7)
    expect(hits.length > 0).toBe(flagged)
  })

  it('keeps the copy calm: no "behind", no "only … left!", English only', () => {
    expectNone(copyHits(/\bbehind\b|\bonly\b.*\bleft!|tapos na|hakbang/i))
  })

  it('shows no pass/fail verdicts, bands or percentiles', () => {
    expectNone(copyHits(/\bpassed\b|\bfailed\b|\bpass\b|\bfail\b|below (the )?cut-?off|above (the )?cut-?off|percentile|top tier|on track for/i))
    // scoreBand() labels a score "Top tier" / "Foundational": a verdict by another name.
    expectNone(scan(/\bscoreBand\b/))
  })

  it('keeps status colours off scores: the results card and by-skill bars stay neutral', () => {
    const card = fs.readFileSync(path.join(ROOT, 'components/practice/ResultsScoreCard.tsx'), 'utf8')
    const skills = fs.readFileSync(path.join(ROOT, 'components/practice/ResultsBreakdown.tsx'), 'utf8')
    for (const src of [card, skills]) {
      expect(codeOnly(src)).not.toMatch(/\bt\.(success|danger|warning)\w*/)
      expect(codeOnly(src)).not.toMatch(/tone=/)
    }
  })
})
