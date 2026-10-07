import { describe, it, expect } from 'vitest'
import { describeContentSync } from '../describe'
import type { ContentSyncSummary } from '../syncContent'

const summary = (p: Partial<ContentSyncSummary> = {}): ContentSyncSummary => ({ files: [], unchanged: 0, remaining: 0, aiCalls: 0, sourceErrors: [], ...p })
const file = (contentType: 'listings' | 'announcements', status: ContentSyncSummary['files'][number]['status']) =>
  ({ contentType, driveFileId: 'x', name: 'x', status })

describe('describeContentSync', () => {
  it('is empty when the sync had no listings/announcements folders', () => {
    expect(describeContentSync(undefined)).toEqual({ text: '', problems: 0 })
  })

  it('counts new previews per type, held files and unreadable folders', () => {
    const out = describeContentSync(summary({
      files: [file('listings', 'previewed'), file('announcements', 'previewed'), file('announcements', 'previewed'), file('announcements', 'held'), file('listings', 'error')],
      remaining: 2,
      sourceErrors: [{ sourceId: 's', contentType: 'listings', folderId: 'f', label: 'L', message: 'File not found' }],
    }))
    expect(out.text).toBe('1 listings preview · 2 announcement previews · 2 need attention · 1 folder unreadable · 2 left for the next run')
    expect(out.problems).toBe(3)
  })

  it('reports a failed content sync', () => {
    expect(describeContentSync({ error: 'drive_content_files read failed' })).toEqual({ text: 'Listings/announcements sync failed: drive_content_files read failed', problems: 1 })
  })
})
