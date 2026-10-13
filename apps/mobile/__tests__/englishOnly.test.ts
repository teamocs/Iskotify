// Brandbook voice guard (docs/brand/90_SYNTHESIS.md §6): English everywhere.
// The one exception is the tagline "Para sa mga Iskolar ng Bayan", and the
// owner-frozen landing page (app/landing.tsx) keeps its approved copy.
// This fails on the Taglish words the app used to ship ("Tara, simulan na
// natin", "Kaya mo 'to", "Tapos na!", "Salamat!") and a few more common ones,
// anywhere in the source of app/, components/, utils/, services/
// (notifications), hooks/, lib/ and theme/. Comment lines are skipped.
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'utils', 'services', 'hooks', 'lib', 'theme']
/** Frozen by the owner (2026-10-12); its copy is approved as is. */
const EXEMPT = ['app/landing.tsx']

export const TAGLISH = /\b(?:tara|natin|kaya mo|salamat|tapos na|sige|galing|ingat|pwede|naman|kayo|ikaw|po|mabuhay|maligayang)\b/i

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...sourceFiles(full))
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Drop comment lines only (a trimmed line starting with //, /* or *), so a
 * `//` inside a string ("https://…") never hides the rest of its line.
 */
export function codeLines(src: string): string[] {
  return src.split('\n').map(l => (/^\s*(?:\/\/|\/\*|\*)/.test(l) ? '' : l))
}

describe('English only (the tagline aside)', () => {
  it('no Taglish in user-facing strings outside the frozen landing page', () => {
    const hits: string[] = []
    for (const dir of DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/')
        if (EXEMPT.includes(rel)) continue
        codeLines(fs.readFileSync(file, 'utf8')).forEach((line, i) => {
          if (TAGLISH.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
        })
      }
    }
    expect(hits).toEqual([])
  })

  it('catches the retired phrases and spares the tagline and English', () => {
    for (const s of [
      'Tara, simulan na natin!', "Kaya mo 'to.", 'Tapos na! Practice complete.', 'Report sent. Salamat!',
      'Salamat po', 'Mabuhay!', 'Maligayang pagdating',
    ]) {
      expect(TAGLISH.test(s)).toBe(true)
    }
    for (const s of [
      'Para sa mga Iskolar ng Bayan', "Let's get started", 'Thanks. We got your feedback.', 'Practice complete.',
      'Export to PDF', 'point', 'Post a reply',
    ]) {
      expect(TAGLISH.test(s)).toBe(false)
    }
  })

  it('skips comment lines but keeps a string that contains //', () => {
    const lines = codeLines("// Salamat in a comment\n * Tara in a block\nconst u = 'https://x.ph' + ' Salamat!'")
    expect(lines.filter(l => TAGLISH.test(l))).toEqual(["const u = 'https://x.ph' + ' Salamat!'"])
  })
})
