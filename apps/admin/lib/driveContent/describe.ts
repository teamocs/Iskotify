import type { ContentSyncSummary } from './syncContent'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The listings/announcements half of a "Sync now" result, for the status line and toast. */
export function describeContentSync(content: ContentSyncSummary | { error: string } | undefined): { text: string; problems: number } {
  if (!content) return { text: '', problems: 0 }
  if ('error' in content) return { text: `Listings/announcements sync failed: ${content.error}`, problems: 1 }
  const count = (type: string, status: string) => content.files.filter(f => f.contentType === type && f.status === status).length
  const listings = count('listings', 'previewed')
  const announcements = count('announcements', 'previewed')
  const attention = content.files.filter(f => f.status === 'held' || f.status === 'error').length
  const parts = [
    listings ? plural(listings, 'listings preview') : '',
    announcements ? plural(announcements, 'announcement preview') : '',
    attention ? `${attention} need attention` : '',
    content.sourceErrors.length ? `${plural(content.sourceErrors.length, 'folder')} unreadable` : '',
    content.remaining ? `${content.remaining} left for the next run` : '',
  ].filter(Boolean)
  return { text: parts.join(' · '), problems: attention + content.sourceErrors.length }
}
