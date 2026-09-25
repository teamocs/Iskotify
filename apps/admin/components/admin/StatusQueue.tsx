'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { FilterDef } from '@/components/ui/DataTable'
import { notifyError, notifySuccess } from '@/lib/toast'
import {
  REVIEW_STATUSES, REVIEW_STATUS_LABEL, bulkMessage, fetchAllPages, patchStatuses, type ReviewStatus,
} from '@/lib/admin/bulkStatus'

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
    predicate: (row, v) => row.status === v,
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
  noun: { one: string; many: string }
  /** Capitalised noun for single-row toasts ("Report marked resolved"). */
  singular: string
}

/**
 * Loads a whole queue, then applies status changes and deletes through the
 * per-item route (`${listUrl}/${id}`). After a change it re-reads the queue and
 * refreshes the server components (sidebar/inbox counts).
 */
export function useStatusQueue<T extends { id: string }>({ listUrl, noun, singular }: QueueOptions) {
  const router = useRouter()
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const loadId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++loadId.current
    setLoading(true)
    setError('')
    const result = await fetchAllPages<T>(listUrl)
    if (id !== loadId.current) return
    if (result.ok) {
      setRows(result.rows)
      // Drop selections for rows that no longer exist.
      setSelected(prev => prev.filter(s => result.rows.some(r => r.id === s)))
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [listUrl])

  useEffect(() => { reload() }, [reload])

  const afterChange = useCallback(() => {
    reload()
    router.refresh()
  }, [reload, router])

  async function setStatus(id: string, status: ReviewStatus) {
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
  }

  /** Resolves true when the row was deleted. */
  async function remove(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${listUrl}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notifyError(body.error ?? `Failed to delete ${singular.toLowerCase()}`)
        return false
      }
      notifySuccess(`${singular} deleted`)
      afterChange()
      return true
    } catch {
      notifyError('Network error')
      return false
    }
  }

  async function applyBulk(status: ReviewStatus) {
    if (selected.length === 0) return
    setBulkBusy(true)
    const outcome = await patchStatuses(listUrl, selected, status)
    setBulkBusy(false)
    const { ok, message } = bulkMessage(outcome, noun)
    if (ok) notifySuccess(message)
    else notifyError(message)
    // Keep only what failed selected, so a retry is one click.
    setSelected(outcome.failed)
    if (outcome.ok.length > 0) afterChange()
  }

  return { rows, loading, error, reload, selected, setSelected, bulkBusy, applyBulk, setStatus, remove, afterChange }
}
