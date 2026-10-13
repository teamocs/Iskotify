/**
 * Calm motion (owner feedback, 2026-10-13: "do not over transition or
 * animate it"). Across app/, components/ and hooks/:
 *  - `motion.spring.bouncy` is used ONLY by the correct-answer check
 *    (components/practice/AnimatedCheck.tsx), once;
 *  - every spring goes through a motion token (no inline damping/stiffness,
 *    which is how a bouncy one sneaks back in);
 *  - no timed animation runs longer than 340ms (motion.curve.smooth), except
 *    the skeleton's loading pulse, which is a loop, not a transition;
 *  - the tab lens springs on snappy, tab content only crossfades (no shift),
 *    and paged flows cross-fade with at most an 8pt slide.
 */
import * as fs from 'fs'
import * as path from 'path'
import { motion } from '../theme/tokens'

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'components', 'hooks']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      out.push(...walk(p))
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const FILES = DIRS.flatMap(d => walk(path.join(ROOT, d)))
  .map(p => ({ rel: path.relative(ROOT, p).split(path.sep).join('/'), src: strip(fs.readFileSync(p, 'utf8')) }))
const read = (rel: string) => FILES.find(f => f.rel === rel)!.src

const BOUNCY_ALLOWED = ['components/practice/AnimatedCheck.tsx']
/** Loops, not transitions. */
const LONG_ALLOWED = ['components/ui/Skeleton.tsx']
const MAX_MS = 340

describe('calm motion', () => {
  it('scans the app', () => {
    expect(FILES.length).toBeGreaterThan(150)
  })

  it('spring.bouncy is reserved for the correct-answer check', () => {
    const users = FILES.filter(f => /\bspring\.bouncy\b/.test(f.src)).map(f => f.rel)
    expect(users).toEqual(BOUNCY_ALLOWED)
  })

  it('every spring uses a motion token, never an inline damping / stiffness', () => {
    const inline = FILES.filter(f => /\b(?:damping|stiffness)\s*:\s*\d/.test(f.src)).map(f => f.rel)
    expect(inline).toEqual([])
  })

  it(`no timed animation runs longer than ${MAX_MS}ms`, () => {
    const long: string[] = []
    for (const f of FILES) {
      if (LONG_ALLOWED.includes(f.rel)) continue
      for (const m of f.src.matchAll(/\bduration\s*:\s*(\d+)/g)) {
        if (Number(m[1]) > MAX_MS) long.push(`${f.rel}: ${m[0]}`)
      }
    }
    expect(long).toEqual([])
  })

  it('the tab lens springs on snappy (no sideways bounce); bar morphs are short timings', () => {
    const bar = read('components/navigation/FloatingTabBar.tsx')
    expect(bar).toMatch(/lensIndex\.value\s*=\s*withSpring\(focusedIndex,\s*motion\.spring\.snappy\)/)
    expect(bar).not.toMatch(/withSpring\([^)]*motion\.spring\.smooth/)
    expect(bar).toMatch(/motion\.duration\.bar/)
  })

  it('tab content only crossfades, no shift or scale', () => {
    const layout = read('app/(tabs)/_layout.tsx')
    expect(layout).not.toMatch(/'shift'/)
    expect(layout).toMatch(/animation:\s*isDesktopWeb\s*\?\s*'none'\s*:\s*'fade'/)
    expect(layout).toMatch(/duration:\s*motion\.duration\.fade/)
  })

  it('the collapsed large title only fades (no translateY)', () => {
    const header = read('components/navigation/LargeTitleHeader.tsx')
    expect(header).not.toMatch(/translateY/)
  })

  it('paged flows cross-fade with a short slide, never a spring', () => {
    const page = read('components/ui/PageTransition.tsx')
    expect(page).not.toMatch(/withSpring/)
    expect(page).toMatch(/motion\.duration\.page/)
  })
})

describe('motion token budget', () => {
  // Damping ratio ζ = c / (2√k) for unit mass: ≥ 0.75 shows no visible overshoot.
  const zeta = (s: { damping: number; stiffness: number }) => s.damping / (2 * Math.sqrt(s.stiffness))
  it('snappy and smooth are near critically damped and clamp any overshoot', () => {
    expect(zeta(motion.spring.snappy)).toBeGreaterThanOrEqual(0.75)
    expect(zeta(motion.spring.smooth)).toBeGreaterThanOrEqual(0.75)
    expect(motion.spring.snappy.overshootClamping).toBe(true)
    expect(motion.spring.smooth.overshootClamping).toBe(true)
  })
  it('every timed duration is within the budget', () => {
    for (const ms of Object.values(motion.duration)) expect(ms).toBeLessThanOrEqual(MAX_MS)
    expect(motion.curve.smooth.duration).toBeLessThanOrEqual(MAX_MS)
  })
})
