/**
 * Batch C review (1b) — structural guard. pullUserData REPLACES user-curated
 * tables from the cloud copy, so any code that writes them must also schedule
 * the backup push, or its edit can be reverted by the next pull. This scans the
 * source for writers of the curated tables and fails when one forgets to.
 * (Behaviour of the hook/service writers is covered by their own tests.)
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'hooks', 'services', 'utils', 'lib']
const CURATED = [
  'notesTable', 'notes', 'noteLabelsTable', 'noteLabels', 'noteLabelAssignments', 'studyPlanItems',
  'savedDecksTable', 'savedDecks', 'userRequirements', 'focusListings', 'userSettings',
]
const WRITE = new RegExp(String.raw`\.(insert|update|delete)\(\s*(${CURATED.join('|')})\b`)
const PUSHES = /schedulePushUserData|pushUserData/

// Files that write a curated table but are deliberately NOT user edits to back up.
const ALLOWED: Record<string, string> = {
  'services/sync.ts': 'the sync engine itself (restore / catalog cursor)',
  'app/auth/callback.tsx': 'sign-in bookkeeping, followed by an explicit pull/push',
  'app/landing.tsx': 'sign-in bookkeeping, followed by an explicit pull/push',
  'components/walkthrough/tourState.ts': 'device-local tourSeenAt, never synced',
  'hooks/useFocusListings.ts': 'covered: add/remove/move all schedule (see curatedWritesSchedulePush.test.tsx)',
  'services/premiumCache.ts': 'device-local Full Access cache, never backed up nor restored (premiumSync.test.ts)',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

describe('writers of user-curated tables schedule the cloud push', () => {
  const files = SCAN_DIRS.flatMap(d => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))
  const writers = files
    .map(f => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), src: fs.readFileSync(f, 'utf8') }))
    .filter(f => WRITE.test(f.src))

  it('finds the known writers (the scan is not vacuous)', () => {
    const rels = writers.map(w => w.rel)
    expect(rels).toEqual(expect.arrayContaining(['hooks/useNotes.ts', 'services/settings.ts', 'app/notes/[id].tsx']))
  })

  it.each(writers.map(w => [w.rel, w.src] as const))('%s', (rel, src) => {
    if (rel in ALLOWED) return
    expect(PUSHES.test(src)).toBe(true)
  })
})

describe('queued backup edits are flushed when the app is hidden', () => {
  it('the root layout installs the pagehide / AppState flush listeners', () => {
    const layout = fs.readFileSync(path.join(ROOT, 'app/_layout.tsx'), 'utf8')
    expect(layout).toMatch(/installPushFlushListeners\(\)/)
  })
})
