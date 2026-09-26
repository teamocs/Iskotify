'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RowActions, type RowAction } from '@/components/ui/RowActions'
import type { FilterDef } from '@/components/ui/DataTable'
import { notifyError, notifySuccess } from '@/lib/toast'
import { parseTableState, type TableState } from '@/lib/table/tableState'
import { useDebounce } from '@/lib/useDebounce'
import { REVIEW_STATUSES, REVIEW_STATUS_LABEL, runBulkStatus, type ReviewStatus } from '@/lib/admin/bulkStatus'
import { queueTableOptions, type QueueSpec } from '@/lib/admin/queueSpecs'
import { createRequestGuard, loadQueuePage } from '@/lib/admin/queueClient'

/*
 * Pieces shared by the three triage queues (reported questions, bug reports,
 * feedback): the status badge and filter, the bulk status bar, and the hook
 * that loads a queue and applies per-row and bulk status changes.
 */

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = { new: 'brand', reviewed: 'warning', resolved: 'success' }

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{REVIEW_STATUS_LABEL[status] ?? status}</Badge>
}

export function statusFilter<T extends { status: ReviewStatus }>(): FilterDef<T> {
  return {
    id: 'status',
    label: 'Status',
    allLabel: 'Any status',
    options: REVIEW_STATUSES.map(s => ({ value: s, label: REVIEW_STATUS_LABEL[s] })),
  }
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** One button per target status, for the DataTable bulk bar. */
export function BulkStatusActions({ busy, onApply }: { busy: boolean; onApply: (status: ReviewStatus) => void }) {
  return (
    <>
      {REVIEW_STATUSES.map(s => (
        <Button key={s} size="sm" disabled={busy} onClick={() => onApply(s)}>
          Mark {s}
        </Button>
      ))}
    </>
  )
}

/**
 * A queue row's actions: the one frequent move (Resolve) stays visible, every
 * other status change, `extra` actions and Delete live in the row's menu.
 */
export function QueueRowActions({ name, status, onSetStatus, onDelete, deleteLabel, extra = [] }: {
  /** Short text naming the row, used in accessible names ("Mark reviewed: Wrong answer…"). */
  name: string
  status: ReviewStatus
  onSetStatus: (status: ReviewStatus) => void
  onDelete: () => void
  /** "Delete report", "Delete feedback"… */
  deleteLabel: string
  extra?: RowAction[]
}) {
  const items: RowAction[] = [
    ...REVIEW_STATUSES.filter(s => s !== status).map(s => ({
      label: `Mark ${s}`,
      name: `Mark ${s}: ${name}`,
      icon: s === 'resolved' ? ('check' as const) : undefined,
      onSelect: () => onSetStatus(s),
    })),
    ...extra,
    { label: deleteLabel, name: `${deleteLabel}: ${name}`, icon: 'trash', tone: 'danger', onSelect: onDelete },
  ]
  return (
    <span className="inline-flex items-center gap-1">
      {status !== 'resolved' && (
        <Button size="sm" variant="ghost" icon="check" className="-my-1.5" aria-label={`Resolve: ${name}`} onClick={() => onSetStatus('resolved')}>
          Resolve
        </Button>
      )}
      <RowActions label={`More actions for ${name}`} items={items} />
    </span>
  )
}

/** Long free text, clamped with a Show more toggle. */
export function ClampText({ text, max = 120 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false)
  if (text.length <= max) return <span className="block whitespace-pre-wrap break-words">{text}</span>
  return (
    <>
      <span className="block whitespace-pre-wrap break-words">{open ? text : `${text.slice(0, max)}…`}</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="mt-1 text-xs font-medium text-maroon hover:underline">
        {open ? 'Show less' : 'Show more'}
      </button>
    </>
  )
}

interface QueueOptions {
  /** List endpoint, e.g. /api/admin/reports */
  listUrl: string
  /** The queue's sorts and filters, shared with its route. */
  spec: QueueSpec
  noun: { one: string; many: string }
  /** Capitalised noun for single-row toasts ("Report marked resolved"). */
  singular: string
}

/**
 * Loads the page of a queue that the table's URL state asks for (search,
 * sort, filters, page), one page at a time from the server, and applies status
 * changes and deletes through the per-item route (`${listUrl}/${id}`). After a
 * change it refetches the current page and refreshes the server components
 * (sidebar/inbox counts).
 */
export function useStatusQueue<T extends { id: string }>({ listUrl, spec, noun, singular }: QueueOptions) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState('')
  const [guard] = useState(createRequestGuard)
  // Bumped to refetch the same view (after a change, or Try again).
  const [nonce, setNonce] = useState(0)

  // The table writes q/sort/filters/page to the URL; search waits for typing to pause.
  const state = parseTableState(params, queueTableOptions(spec))
  const q = useDebounce(state.q, 250)
  const viewKey = JSON.stringify({ ...state, q })
  const view = useMemo(() => JSON.parse(viewKey) as TableState, [viewKey])

  // The last answer and the request it answers; loading until it answers this one.
  const requestKey = `${viewKey}#${nonce}`
  const [loaded, setLoaded] = useState<{ key: string; rows: T[]; total: number; error: string } | null>(null)
  const loading = loaded?.key !== requestKey
  const rows = loaded?.rows ?? []
  const total = loaded?.total ?? 0
  const error = loaded && !loading ? loaded.error : ''

  useEffect(() => {
    const isCurrent = guard.begin()
    loadQueuePage<T>({ listUrl, view, isCurrent }).then(result => {
      if (result.status === 'stale') return
      setLoaded(prev => result.status === 'ok'
        ? { key: requestKey, rows: result.rows, total: result.total, error: '' }
        : { key: requestKey, rows: prev?.rows ?? [], total: prev?.total ?? 0, error: result.error })
    })
  }, [guard, listUrl, view, requestKey])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const afterChange = useCallback(() => {
    reload()
    router.refresh()
  }, [reload, router])

  const setStatus = useCallback(async (id: string, status: ReviewStatus) => {
    try {
      const res = await fetch(`${listUrl}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notifyError(body.error ?? 'Failed to update status')
        return
      }
      notifySuccess(`${singular} marked ${status}`)
      afterChange()
    } catch {
      notifyError('Network error')
    }
  }, [listUrl, singular, afterChange])

  /** Resolves true when the row was deleted. */
  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${listUrl}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notifyError(body.error ?? `Failed to delete ${singular.toLowerCase()}`)
        return false
      }
      notifySuccess(`${singular} deleted`)
      setSelected(prev => prev.filter(s => s !== id))
      afterChange()
      return true
    } catch {
      notifyError('Network error')
      return false
    }
  }, [listUrl, singular, afterChange])

  async function applyBulk(status: ReviewStatus) {
    if (selected.length === 0) return
    setBulkBusy(true)
    try {
      const { ok, message, failed } = await runBulkStatus({ listUrl, ids: selected, status, noun, refetch: afterChange })
      setBulkResult(message)
      if (ok) notifySuccess(message)
      else notifyError(message)
      // Keep only what failed selected, so a retry is one click.
      setSelected(failed)
    } finally {
      setBulkBusy(false)
    }
  }

  return { rows, total, loading, error, reload, selected, setSelected, bulkBusy, bulkResult, applyBulk, setStatus, remove, afterChange }
}
