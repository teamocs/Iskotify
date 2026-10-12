import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/Button'
import { ShortcutList } from './ShortcutsDialog'
import { NeedsAttention } from './NeedsAttention'
import { QUEUES, describeSync, summarize, type InboxCounts, type QueueDef } from '@/lib/admin/inboxCounts'

/** One group's open work, from the same counts as the table (nothing derived beyond a sum). */
function groupSummary(counts: InboxCounts, group: QueueDef['group']) {
  let total = 0, busy = 0, loaded = 0
  const queues = QUEUES.filter(q => q.group === group)
  for (const q of queues) {
    const c = counts[q.id]
    if (!c.ok) continue
    loaded++
    total += c.count
    if (c.count > 0) busy++
  }
  return { total, busy, loaded, size: queues.length }
}

function GroupTile({ group, counts }: { group: QueueDef['group']; counts: InboxCounts }) {
  const { total, busy, loaded, size } = groupSummary(counts, group)
  const id = `tile-${group.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="rounded-group border border-subtle bg-surface px-4 py-3">
      <h2 id={id} className="text-footnote font-medium text-ink-muted">{group}</h2>
      <p className={`mt-1 text-large-title font-bold tabular-nums tracking-tight ${total > 0 ? 'text-ink' : 'text-ink-subtle'}`}>
        {loaded === 0 ? '—' : total}
      </p>
      <p className="text-footnote text-ink-muted">
        {loaded === 0
          ? 'Counts unavailable'
          : <>{total === 1 ? 'item' : 'items'} waiting · {busy} of {size} {size === 1 ? 'queue' : 'queues'} busy{loaded < size && ' (some counts missing)'}</>}
      </p>
    </section>
  )
}

/**
 * The admin Home: a work inbox. Stat tiles per queue group, then every queue
 * that can hold work with its count and a link to where that work is done.
 * Queue order never changes, so a daily user learns where to look; weight and
 * the badge carry "needs work".
 */
export function InboxView({ counts, now }: { counts: InboxCounts; now: number }) {
  const { total, busyQueues, unavailable } = summarize(counts)
  const sync = describeSync(counts.lastSync, now)
  const syncMessage = counts.lastSync.ok ? counts.lastSync.message : null
  const rows = QUEUES.map(queue => ({ queue, count: counts[queue.id] }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-ink-muted">
            {total > 0 ? (
              <>
                <strong className="font-semibold text-ink">{total} {total === 1 ? 'item' : 'items'} waiting in {busyQueues} {busyQueues === 1 ? 'queue' : 'queues'}.</strong>{' '}
                Start with the top of the list.
              </>
            ) : (
              <strong className="font-semibold text-ink">Nothing is waiting in any queue.</strong>
            )}
            {unavailable > 0 && <> {unavailable} {unavailable === 1 ? 'count' : 'counts'} couldn’t load; open the queue to check it.</>}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <GroupTile group="Content" counts={counts} />
            <GroupTile group="Inbox" counts={counts} />
            <Link
              href="/admin/listings/import"
              className="group flex flex-col rounded-group border border-subtle bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
            >
              <span className="text-footnote font-medium text-ink-muted">Listings import</span>
              <span className="mt-2"><Badge tone={sync.tone}>{sync.label}</Badge></span>
              <span className="mt-auto pt-2 text-footnote text-ink-muted">
                <span className="font-medium text-ink group-hover:underline underline-offset-2">Last Google Sheets import</span>{' '}
                {sync.when ?? 'No run recorded'}
                {syncMessage && <> · {syncMessage}</>}
              </span>
            </Link>
          </div>

          <Card title="Needs attention" flush>
            <NeedsAttention rows={rows} />
          </Card>
        </div>

        <aside aria-label="Shortcuts and actions" className="space-y-4">
          <Card title="Start something">
            <div className="flex flex-col gap-2">
              <Link href="/admin/upcat/import" className={buttonClass({ variant: 'primary', size: 'sm', className: 'justify-start' })}>
                <Icon name="upload" />Import questions
              </Link>
              <Link href="/admin/listings" className={buttonClass({ variant: 'secondary', size: 'sm', className: 'justify-start' })}>
                <Icon name="list" />Browse listings
              </Link>
            </div>
          </Card>
          <Card title="Keyboard">
            <ShortcutList />
          </Card>
        </aside>
      </div>
    </div>
  )
}
