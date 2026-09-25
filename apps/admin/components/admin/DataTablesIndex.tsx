'use client'

import Link from 'next/link'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DATA_TABLE_GROUPS, DATA_TABLE_INDEX, type DataTableIndexEntry } from '@/lib/dataTablesIndex'

const GROUP_LABEL = Object.fromEntries(DATA_TABLE_GROUPS.map(g => [g.value, g.label]))

const COLUMNS: Column<DataTableIndexEntry>[] = [
  {
    id: 'label',
    header: 'Table',
    sortValue: e => e.label,
    searchValue: e => `${e.label} ${e.table} ${e.description}`,
    cell: e => (
      <Link href={e.href} className="font-medium text-ink underline-offset-2 hover:underline">
        {e.label}
      </Link>
    ),
  },
  { id: 'group', header: 'Group', sortValue: e => GROUP_LABEL[e.group], cell: e => <Badge>{GROUP_LABEL[e.group]}</Badge> },
  { id: 'description', header: 'What it feeds', cell: e => <span className="block max-w-2xl text-ink-muted">{e.description}</span> },
]

const FILTERS: FilterDef<DataTableIndexEntry>[] = [
  { id: 'group', label: 'Group', allLabel: 'All groups', options: DATA_TABLE_GROUPS, predicate: (e, v) => e.group === v },
]

export function DataTablesIndex() {
  return (
    <DataTable
      label="Data tables"
      rows={DATA_TABLE_INDEX}
      columns={COLUMNS}
      rowKey={e => e.table}
      filters={FILTERS}
      pageSize={50}
      defaultSort={{ id: 'label', dir: 'asc' }}
      searchPlaceholder="Search tables"
    />
  )
}
