import { Badge } from '@/components/ui/Badge'
import type { ContentFileRow } from './types'

/** Files the sync couldn't turn into a preview (held / error / skipped), with why. */
export function HeldFiles({ files, label }: { files: ContentFileRow[]; label: string }) {
  if (files.length === 0) return null
  const attention = files.filter(f => f.status !== 'skipped')
  const skipped = files.filter(f => f.status === 'skipped')
  const item = (f: ContentFileRow) => (
    <li key={`${f.content_type}:${f.drive_file_id}`} className="text-ui">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink break-all">{f.name}</span>
        {f.status === 'error' && <Badge tone="danger">Sync failed</Badge>}
        {f.status === 'held' && <Badge tone="warning">Held</Badge>}
      </span>
      {f.message && <span className="block text-xs text-ink-muted break-words">{f.message}</span>}
    </li>
  )
  return (
    <div className="border-t border-subtle px-4 py-3 space-y-2">
      {attention.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-ink">Needs attention ({attention.length})</h3>
          <p className="text-xs text-ink-muted">Fix these in Drive; they are tried again on every sync.</p>
          <ul aria-label={`${label} needing attention`} className="space-y-2">{attention.map(item)}</ul>
        </>
      )}
      {skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer text-ui font-medium text-ink">Not imported ({skipped.length})</summary>
          <ul className="mt-2 space-y-2">{skipped.map(item)}</ul>
        </details>
      )}
    </div>
  )
}
