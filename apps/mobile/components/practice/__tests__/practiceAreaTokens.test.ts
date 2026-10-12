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

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
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

function containsText(node: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node) => {
    if (found) return
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === 'Text') found = true
    else ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * JSX elements whose `style` sets a fixed `height` (inline, or through a
 * style-object key of the same file such as a StyleSheet entry) and that
 * render a <Text> inside: at large Dynamic Type sizes that text overflows.
 */
function fixedHeightTextContainers(file: string): Hit[] {
  const sf = parse(file)
  const sheetKeys = new Set<string>()
  const collect = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && ts.isObjectLiteralExpression(n.initializer)
      && n.initializer.properties.some(isHeightKey)) {
      sheetKeys.add(n.name.text)
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
          const refs: string[] = []
          const findRefs = (r: ts.Node) => {
            if (ts.isPropertyAccessExpression(r)) refs.push(r.name.text)
            ts.forEachChild(r, findRefs)
          }
          findRefs(expr)
          fixed = refs.some(k => sheetKeys.has(k))
        }
        if (fixed && n.children.some(containsText)) {
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
    expectNone(FILES.flatMap(fixedHeightTextContainers))
  })

  it('the fixed-height check catches inline and StyleSheet heights', () => {
    const tmp = 'components/practice/__guardProbe__.tsx'
    const abs = path.join(ROOT, tmp)
    fs.writeFileSync(abs, [
      'const s = StyleSheet.create({ disc: { width: 22, height: 22 } })',
      'const a = <View style={{ height: 40 }}><Text>A</Text></View>',
      'const b = <View style={s.disc}><Text>B</Text></View>',
      'const c = <View style={{ height: 4 }} />',
      'const d = <View style={{ minHeight: 44 }}><Text>D</Text></View>',
    ].join('\n'))
    try {
      expect(fixedHeightTextContainers(tmp).map(h => h.line)).toEqual([2, 3])
    } finally {
      fs.unlinkSync(abs)
    }
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
