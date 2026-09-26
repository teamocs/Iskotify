'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdmissionsUpdate } from '@/app/admin/updates/page'
import { saveUpdate, deleteUpdate } from '@/lib/admin/updatesApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { isDirty } from '@/lib/admin/formDirty'
import { RowActions } from '@/components/ui/RowActions'
import { TABLE_FRAME } from '@/components/ui/Table'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Field, controlClass } from '@/components/ui/Field'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  updates: AdmissionsUpdate[]
}

const SEVERITY: Record<string, { label: string; tone: BadgeTone }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  important: { label: 'Important', tone: 'warning' },
  info: { label: 'Info', tone: 'neutral' },
}
const INFO = { label: 'Info', tone: 'neutral' as BadgeTone }
const severityOf = (s: string) => SEVERITY[s] ?? INFO
const SEVERITY_RANK: Record<string, number> = { urgent: 3, important: 2, info: 1 }

// Date-only strings ("2026-10-15") are UTC midnight; format in UTC so the day never shifts.
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const DateCell = ({ value }: { value: string | null }) =>
  value ? <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(value)}</span> : <span className="text-ink-subtle">—</span>

const FILTERS: FilterDef<AdmissionsUpdate>[] = [
  {
    id: 'severity', label: 'Severity', allLabel: 'Any severity',
    options: [{ value: 'urgent', label: 'Urgent' }, { value: 'important', label: 'Important' }, { value: 'info', label: 'Info' }],
    predicate: (u, v) => u.severity === v,
  },
  {
    id: 'verified', label: 'Verified', allLabel: 'All',
    options: [{ value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }],
    predicate: (u, v) => (v === 'yes' ? u.verified : !u.verified),
  },
]

// ── Form ────────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)

type UpdateForm = {
  report_date: string
  severity: string
  school_slug: string
  school_name: string
  title: string
  body: string
  action_required: string
  event_date: string
  event_type: string
  sources_raw: string
  verified: boolean
}

function toForm(update: AdmissionsUpdate | null): UpdateForm {
  if (!update) {
    return {
      report_date: today(), severity: 'info', school_slug: '', school_name: '', title: '', body: '',
      action_required: '', event_date: '', event_type: '', sources_raw: '', verified: false,
    }
  }
  return {
    report_date: update.report_date,
    severity: update.severity,
    school_slug: update.school_slug ?? '',
    school_name: update.school_name ?? '',
    title: update.title,
    body: update.body,
    action_required: update.action_required ?? '',
    event_date: update.event_date ?? '',
    event_type: update.event_type ?? '',
    sources_raw: Array.isArray(update.sources) ? update.sources.join('\n') : '',
    verified: update.verified,
  }
}

type Required = Pick<UpdateForm, 'report_date' | 'severity' | 'title' | 'body'>

/** Per-field problems for the fields the server requires. Empty when the form can be saved. */
export function validateUpdateForm(form: Required): Partial<Record<keyof Required, string>> {
  const errors: Partial<Record<keyof Required, string>> = {}
  if (!form.severity) errors.severity = 'Choose a severity.'
  if (!form.report_date) errors.report_date = 'Enter the report date.'
  if (!form.title.trim()) errors.title = 'Enter a title.'
  if (!form.body.trim()) errors.body = 'Enter the update text.'
  return errors
}

export function UpdateDrawer({ update, onClose, onRequestDelete }: {
  update: AdmissionsUpdate | null
  onClose: () => void
  onRequestDelete: (update: AdmissionsUpdate) => void
}) {
  const formId = useId()
  const fid = (name: string) => `${formId}-${name}`
  const [initial] = useState(() => toForm(update))
  const [form, setForm] = useState<UpdateForm>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof UpdateForm, string>>>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const dirty = isDirty(form, initial)

  function set<K extends keyof UpdateForm>(field: K, value: UpdateForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => {
      if (!e[field]) return e
      const next = { ...e }
      delete next[field]
      return next
    })
  }
  const text = (field: keyof UpdateForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(field, e.target.value as never)

  async function handleSave() {
    setServerError('')
    const found = validateUpdateForm(form)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.getElementById(fid(first))?.focus()
      return
    }
    setSaving(true)
    const sources = form.sources_raw
      .split('\n')
      .flatMap(s => { const t = s.trim(); return t ? [t] : [] })
    const payload = {
      ...(update ? { id: update.id } : {}),
      report_date: form.report_date,
      severity: form.severity,
      school_slug: form.school_slug || null,
      school_name: form.school_name || null,
      title: form.title,
      body: form.body,
      action_required: form.action_required || null,
      event_date: form.event_date || null,
      event_type: form.event_type || null,
      sources,
      verified: form.verified,
    }
    try {
      const result = await saveUpdate(payload)
      if (!result.ok) {
        setServerError(result.error)
        notifyError(result.error)
        return
      }
      notifySuccess(update ? 'Update saved' : 'Update created')
      router.refresh()
      onClose()
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={update ? 'Edit admissions update' : 'New admissions update'}
      onSubmit={handleSave}
      dirty={dirty}
      footer={close => (
        <>
          {update && (
            <Button variant="ghost" icon="trash" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger-strong" onClick={() => onRequestDelete(update)}>
              Delete
            </Button>
          )}
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? 'Saving…' : update ? 'Save changes' : 'Create update'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {serverError && <ErrorBanner title="Couldn’t save this update" message={serverError} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid('severity')} label="Severity" required error={errors.severity}>
            {p => (
              <select {...p} value={form.severity} onChange={text('severity')} className={controlClass}>
                <option value="info">Info</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            )}
          </Field>
          <Field id={fid('report_date')} label="Report date" required error={errors.report_date}>
            {p => <input {...p} type="date" value={form.report_date} onChange={text('report_date')} className={`${controlClass} tabular-nums`} />}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid('school_slug')} label="School slug">
            {p => <input {...p} type="text" value={form.school_slug} onChange={text('school_slug')} className={controlClass} placeholder="e.g. ateneo-manila" />}
          </Field>
          <Field id={fid('school_name')} label="School name">
            {p => <input {...p} type="text" value={form.school_name} onChange={text('school_name')} className={controlClass} placeholder="e.g. Ateneo de Manila" />}
          </Field>
        </div>

        <Field id={fid('title')} label="Title" required error={errors.title}>
          {p => <input {...p} type="text" value={form.title} onChange={text('title')} className={controlClass} placeholder="Brief headline" />}
        </Field>

        <Field id={fid('body')} label="Body" required error={errors.body}>
          {p => <textarea {...p} value={form.body} onChange={text('body')} rows={4} className={`${controlClass} h-auto py-2`} placeholder="Full update text" />}
        </Field>

        <Field id={fid('action_required')} label="Action required">
          {p => <input {...p} type="text" value={form.action_required} onChange={text('action_required')} className={controlClass} placeholder="e.g. Submit application before deadline" />}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid('event_date')} label="Event date">
            {p => <input {...p} type="date" value={form.event_date} onChange={text('event_date')} className={`${controlClass} tabular-nums`} />}
          </Field>
          <Field id={fid('event_type')} label="Event type">
            {p => <input {...p} type="text" value={form.event_type} onChange={text('event_type')} className={controlClass} placeholder="e.g. application, exam" />}
          </Field>
        </div>

        <Field id={fid('sources')} label="Sources" hint="One URL per line.">
          {p => (
            <textarea
              {...p}
              value={form.sources_raw}
              onChange={text('sources_raw')}
              rows={3}
              className={`${controlClass} h-auto py-2 font-mono text-xs`}
              placeholder="https://example.com/announcement"
            />
          )}
        </Field>

        <div className="flex items-center gap-2">
          <input
            id={fid('verified')}
            type="checkbox"
            checked={form.verified}
            onChange={e => set('verified', e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-maroon"
          />
          <label htmlFor={fid('verified')} className="cursor-pointer text-sm text-ink">Verified against a source</label>
        </div>
      </div>
    </Drawer>
  )
}

// ── Table ───────────────────────────────────────────────────────────────────

export function UpdatesView({ updates }: Props) {
  // undefined = closed, null = new, AdmissionsUpdate = edit
  const [drawerUpdate, setDrawerUpdate] = useState<AdmissionsUpdate | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<AdmissionsUpdate | null>(null)
  const router = useRouter()

  async function handleDelete(update: AdmissionsUpdate) {
    try {
      const result = await deleteUpdate(update.id)
      if (!result.ok) {
        notifyError(result.error)
        return
      }
      setDeleteTarget(null)
      setDrawerUpdate(undefined)
      notifySuccess('Update deleted')
      router.refresh()
    } catch {
      notifyError('Network error')
    }
  }

  const columns: Column<AdmissionsUpdate>[] = [
    {
      id: 'title',
      header: 'Update',
      sortValue: u => u.title,
      searchValue: u => `${u.title} ${u.school_name ?? ''} ${u.school_slug ?? ''} ${u.event_type ?? ''}`,
      cell: u => (
        <>
          <button
            type="button"
            onClick={() => setDrawerUpdate(u)}
            className="text-left font-medium text-ink underline-offset-2 hover:underline"
          >
            {u.title}
          </button>
          {u.school_name && <span className="block text-xs text-ink-muted">{u.school_name}</span>}
        </>
      ),
    },
    {
      id: 'severity',
      header: 'Severity',
      sortValue: u => SEVERITY_RANK[u.severity] ?? 0,
      cell: u => <Badge tone={severityOf(u.severity).tone}>{severityOf(u.severity).label}</Badge>,
    },
    { id: 'report_date', header: 'Reported', sortValue: u => u.report_date, cell: u => <DateCell value={u.report_date} /> },
    { id: 'event_date', header: 'Event date', sortValue: u => u.event_date, cell: u => <DateCell value={u.event_date} /> },
    {
      id: 'verified',
      header: 'Verified',
      sortValue: u => (u.verified ? 1 : 0),
      cell: u => u.verified
        ? <span className="inline-flex text-success"><Icon name="check" /><span className="sr-only">Verified</span></span>
        : <span className="text-ink-subtle">—<span className="sr-only">Not verified</span></span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: u => (
        <RowActions
          label={`Actions for ${u.title}`}
          items={[
            { label: 'Edit', name: `Edit ${u.title}`, icon: 'pencil', onSelect: () => setDrawerUpdate(u) },
            { label: 'Delete', name: `Delete ${u.title}`, icon: 'trash', tone: 'danger', onSelect: () => setDeleteTarget(u) },
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <div className={TABLE_FRAME}>
        <DataTable
          label="Admissions updates"
          rows={updates}
          columns={columns}
          rowKey={u => u.id}
          filters={FILTERS}
          defaultSort={{ id: 'report_date', dir: 'desc' }}
          searchPlaceholder="Search title, school or event type"
          pageSize={50}
          emptyTitle="No admissions updates yet"
          emptyDescription="Add one when a school announces a deadline, exam date or requirement change."
          emptyAction={<Button size="sm" icon="plus" onClick={() => setDrawerUpdate(null)}>New update</Button>}
          toolbar={<Button variant="primary" size="sm" icon="plus" onClick={() => setDrawerUpdate(null)}>New update</Button>}
        />
      </div>

      {drawerUpdate !== undefined && (
        <UpdateDrawer
          key={drawerUpdate?.id ?? 'new'}
          update={drawerUpdate}
          onClose={() => setDrawerUpdate(undefined)}
          onRequestDelete={setDeleteTarget}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete “${deleteTarget.title}”? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
