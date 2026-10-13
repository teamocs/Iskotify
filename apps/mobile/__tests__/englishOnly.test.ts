// Brandbook voice guard (docs/brand/90_SYNTHESIS.md §6): English everywhere.
// The one exception is the tagline "Para sa mga Iskolar ng Bayan", and the
// owner-frozen landing page (app/landing.tsx) keeps its approved copy.
// This fails on the Taglish words the app used to ship ("Tara, simulan na
// natin", "Kaya mo 'to", "Tapos na!", "Salamat!") anywhere in the source of
// app/, components/, utils/, services/ (notifications) and hooks/. Comments
// are stripped first.
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'utils', 'services', 'hooks']
/** Frozen by the owner (2026-10-12); its copy is approved as is. */
const EXEMPT = ['app/landing.tsx']

export const TAGLISH = /\b(?:tara|natin|kaya mo|salamat|tapos na|sige|galing|ingat|pwede|naman|kayo|ikaw)\b/i

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

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

describe('English only (the tagline aside)', () => {
  it('no Taglish in user-facing strings outside the frozen landing page', () => {
    const hits: string[] = []
    for (const dir of DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/')
        if (EXEMPT.includes(rel)) continue
        strip(fs.readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
          if (TAGLISH.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
        })
      }
    }
    expect(hits).toEqual([])
  })

  it('catches the retired phrases and spares the tagline and English', () => {
    for (const s of ['Tara, simulan na natin!', "Kaya mo 'to.", 'Tapos na! Practice complete.', 'Report sent. Salamat!']) {
      expect(TAGLISH.test(s)).toBe(true)
    }
    for (const s of ['Para sa mga Iskolar ng Bayan', "Let's get started", 'Thanks. We got your feedback.', 'Practice complete.']) {
      expect(TAGLISH.test(s)).toBe(false)
    }
  })
})
