import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/Button'
import { ShortcutList } from './ShortcutsDialog'
import { QUEUES, describeSync, summarize, type CountResult, type InboxCounts, type QueueDef } from '@/lib/admin/inboxCounts'

function QueueRow({ queue, count }: { queue: QueueDef; count: CountResult }) {
  const busy = count.ok && count.count > 0
  return (
    <li>
      <Link
        href={queue.href}
        className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
      >
        <span className={`font-heading text-xl font-semibold tabular-nums ${busy ? 'text-ink' : 'text-ink-subtle'}`}>
          {count.ok ? count.count : '—'}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink group-hover:underline underline-offset-2">{queue.label}</span>
          <span className="block text-xs text-ink-muted">{queue.description}</span>
        </span>
        <span className="flex items-center gap-2">
          {!count.ok ? <Badge tone="neutral">Unavailable</Badge> : busy ? <Badge tone="warning">To do</Badge> : <Badge tone="success">Clear</Badge>}
          <Icon name="chevron-right" className="text-ink-subtle" />
        </span>
      </Link>
    </li>
  )
}

function QueueGroup({ title, counts }: { title: QueueDef['group']; counts: InboxCounts }) {
  return (
    <Card title={title} flush>
      <ul className="divide-y divide-subtle">
        {QUEUES.filter(q => q.group === title).map(q => <QueueRow key={q.id} queue={q} count={counts[q.id]} />)}
      </ul>
    </Card>
  )
}

/**
 * The admin Home: a work inbox. Every queue that can hold work, its count,
 * and a link to where that work is done. Queue order never changes, so a
 * daily user learns where to look; weight and the badge carry "needs work".
 */
export function InboxView({ counts, now }: { counts: InboxCounts; now: number }) {
  const { total, busyQueues, unavailable } = summarize(counts)
  const sync = describeSync(counts.lastSync, now)
  const syncMessage = counts.lastSync.ok ? counts.lastSync.message : null

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

          <QueueGroup title="Content" counts={counts} />
          <QueueGroup title="Inbox" counts={counts} />

          <Card title="Listings sync" flush>
            <Link href="/admin/sync" className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink group-hover:underline underline-offset-2">Last Google Sheets sync</span>
                <span className="block text-xs text-ink-muted">
                  {sync.when ?? 'No run recorded'}
                  {syncMessage && <> · {syncMessage}</>}
                </span>
              </span>
              <Badge tone={sync.tone}>{sync.label}</Badge>
              <Icon name="chevron-right" className="text-ink-subtle" />
            </Link>
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
