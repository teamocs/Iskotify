'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { SegmentedFilter } from '@/components/ui/SegmentedFilter'
import { Table, TableRegion, THead, Td, Th, Tr } from '@/components/ui/Table'
import type { CountResult, QueueDef } from '@/lib/admin/inboxCounts'

export interface QueueRowData { queue: QueueDef; count: CountResult }

/** URL param for the group filter, so a filtered Home survives a refresh. */
export const QUEUE_GROUP_PARAM = 'queues'
const GROUPS: QueueDef['group'][] = ['Content', 'Inbox']

/**
 * Every queue as a table row: count, where the work is, and its state in
 * words. Order is the fixed QUEUES order; the segmented filter only narrows it.
 */
export function NeedsAttention({ rows }: { rows: QueueRowData[] }) {
  const params = useSearchParams()
  const raw = params?.get(QUEUE_GROUP_PARAM) ?? ''
  const group = GROUPS.find(g => g === raw)
  const shown = group ? rows.filter(r => r.queue.group === group) : rows

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2.5 sm:px-4">
        <SegmentedFilter
          label="Show"
          allLabel="All queues"
          options={GROUPS.map(g => ({ value: g, label: g }))}
          param={QUEUE_GROUP_PARAM}
        />
      </div>
      <TableRegion label="Queues">
        <Table caption="Queues that can hold work">
          <THead>
            <tr>
              <Th numeric className="w-20">Waiting</Th>
              <Th>Queue</Th>
              <Th hideOnMobile>Group</Th>
              <Th align="right">Status</Th>
            </tr>
          </THead>
          <tbody>
            {shown.map(({ queue, count }) => {
              const busy = count.ok && count.count > 0
              return (
                <Tr key={queue.id}>
                  <Td numeric className={`text-title-3 font-semibold ${busy ? 'text-ink' : 'text-ink-subtle'}`}>
                    {count.ok ? count.count : '—'}
                  </Td>
                  <Td>
                    <Link href={queue.href} className="font-medium text-ink underline-offset-2 hover:underline">{queue.label}</Link>
                    <span className="block text-xs text-ink-muted">{queue.description}</span>
                  </Td>
                  <Td hideOnMobile className="text-ink-muted">{queue.group}</Td>
                  <Td align="right">
                    {!count.ok ? <Badge tone="neutral">Unavailable</Badge> : busy ? <Badge tone="warning">To do</Badge> : <Badge tone="success">Clear</Badge>}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </TableRegion>
    </div>
  )
}
