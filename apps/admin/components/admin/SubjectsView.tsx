'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { createSubject as createSubjectRequest, updateSubject, deleteSubject } from '@/lib/admin/subjectsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton, buttonClass } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, controlClass } from '@/components/ui/Field'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ConfirmDialog } from './ConfirmDialog'

interface SubjectRow {
  id: string
  name: string
  listing_slugs: string[]
  topics: { id: string; flashcards: { id: string }[] }[]
  totalCards: number
  overallStatus: string
}

interface ListingOption {
  id: string
  slug: string
  title: string
  provider: string
  type: 'scholarship' | 'exam'
}

interface Props {
  subjects: SubjectRow[]
  listings: ListingOption[]
}

/** The editable part of a subject. */
export interface SubjectDraft {
  id: string
  name: string
  listing_slugs: string[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A subject needs a name; returns the message to show, or undefined when valid. */
export function validateSubjectName(name: string): string | undefined {
  return name.trim() ? undefined : 'Enter a subject name.'
}

function sameSlugs(a: string[], b: string[]) {
  return a.length === b.length && a.every(s => b.includes(s))
}

function ListingPills({ slugs, listings }: { slugs: string[]; listings: ListingOption[] }) {
  const linked = slugs.map(slug => listings.find(l => l.slug === slug)).filter((l): l is ListingOption => Boolean(l))
  if (linked.length === 0) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {linked.map(l => <Badge key={l.slug}>{l.title}</Badge>)}
    </span>
  )
}

function ListingGroup({ legend, options, selected, onToggle }: {
  legend: string
  options: ListingOption[]
  selected: string[]
  onToggle: (slug: string) => void
}) {
  if (options.length === 0) return null
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-ui font-medium text-ink">{legend}</legend>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-subtle p-2">
        {options.map(l => (
          <label key={l.slug} className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-surface-hover">
            <input
              type="checkbox"
              value={l.slug}
              checked={selected.includes(l.slug)}
              onChange={() => onToggle(l.slug)}
              className="h-4 w-4 accent-maroon"
            />
            <span className="text-sm text-ink">{l.title}</span>
            {l.provider && <span className="text-xs text-ink-muted">· {l.provider}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Create (subject = null) or edit a subject: its name and the scholarships and
 * exams it belongs to.
 */
export function SubjectFormDialog({ subject, listings, onClose, onSaved }: {
  subject: SubjectDraft | null
  listings: ListingOption[]
  onClose: () => void
  onSaved: (saved: SubjectDraft) => void
}) {
  const creating = subject === null
  const initialName = subject?.name ?? ''
  const initialSlugs = subject?.listing_slugs ?? []
  const [name, setName] = useState(initialName)
  const nameRef = useRef<HTMLInputElement>(null)
  const [slugs, setSlugs] = useState<string[]>(initialSlugs)
  const [nameError, setNameError] = useState<string | undefined>()
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (slug: string) =>
    setSlugs(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]))

  async function handleSubmit() {
    if (saving) return
    const invalid = validateSubjectName(name)
    setNameError(invalid)
    if (invalid) return
    setSaving(true)
    setServerError('')
    try {
      const result = subject === null
        ? await createSubjectRequest(name, slugs)
        : await updateSubject(subject.id, name, slugs)
      if (!result.ok) {
        setServerError(result.error)
        notifyError(result.error)
        return
      }
      const saved = result.data
      notifySuccess(creating ? 'Subject created' : 'Subject saved')
      onSaved({ id: saved.id, name: saved.name, listing_slugs: saved.listing_slugs ?? [] })
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!saving) onClose() }}
      title={creating ? 'New subject' : 'Edit subject'}
      initialFocusRef={nameRef}
      description="Link the scholarships and exams whose reviewers should include this subject."
      onSubmit={handleSubmit}
      dirty={name !== initialName || !sameSlugs(slugs, initialSlugs)}
      footer={close => (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {creating ? (saving ? 'Creating…' : 'Create subject') : (saving ? 'Saving…' : 'Save subject')}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {serverError && <ErrorBanner title={creating ? 'Couldn’t create the subject' : 'Couldn’t save the subject'} message={serverError} />}
        <Field label="Subject name" required error={nameError}>
          {p => (
            <input {...p} ref={nameRef} type="text" value={name} placeholder="e.g. Biology"
              onChange={e => setName(e.target.value)} className={controlClass} />
          )}
        </Field>
        <ListingGroup legend="Scholarships" options={listings.filter(l => l.type === 'scholarship')} selected={slugs} onToggle={toggle} />
        <ListingGroup legend="Exams" options={listings.filter(l => l.type === 'exam')} selected={slugs} onToggle={toggle} />
      </div>
    </Dialog>
  )
}

export function SubjectsView({ subjects: initialSubjects, listings }: Props) {
  const [subjects, setSubjects] = useState(initialSubjects)
  // null = closed, 'new' = creating, a row = editing it
  const [formFor, setFormFor] = useState<SubjectRow | 'new' | null>(null)
  const [deletingSubject, setDeletingSubject] = useState<SubjectRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  function handleSaved(saved: SubjectDraft) {
    if (formFor === 'new') {
      setSubjects(prev =>
        [...prev, { id: saved.id, name: saved.name, listing_slugs: saved.listing_slugs, topics: [], totalCards: 0, overallStatus: 'draft' }]
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    } else {
      setSubjects(prev => prev.map(s => (s.id === saved.id ? { ...s, name: saved.name, listing_slugs: saved.listing_slugs } : s)))
    }
    setFormFor(null)
  }

  async function confirmDelete() {
    if (!deletingSubject || deleting) return
    const id = deletingSubject.id
    setDeleting(true)
    try {
      const result = await deleteSubject(id)
      if (!result.ok) {
        notifyError(result.error)
        return
      }
      setSubjects(prev => prev.filter(s => s.id !== id))
      setDeletingSubject(null)
      notifySuccess('Subject deleted')
    } catch {
      notifyError('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<SubjectRow>[] = [
    {
      id: 'name',
      header: 'Subject',
      sortValue: s => s.name,
      searchValue: s => `${s.name} ${s.listing_slugs.map(slug => listings.find(l => l.slug === slug)?.title ?? '').join(' ')}`,
      cell: s => (
        <>
          <Link href={`/admin/flashcards/subjects/${s.id}`} className="font-medium text-ink underline-offset-2 hover:underline">{s.name}</Link>
          <ListingPills slugs={s.listing_slugs} listings={listings} />
        </>
      ),
    },
    { id: 'topics', header: 'Topics', align: 'right', sortValue: s => s.topics.length, cell: s => <span className="tabular-nums text-ink-muted">{s.topics.length}</span> },
    { id: 'cards', header: 'Cards', align: 'right', sortValue: s => s.totalCards, cell: s => <span className="tabular-nums text-ink-muted">{s.totalCards}</span> },
    {
      id: 'status',
      header: 'Status',
      sortValue: s => s.overallStatus,
      cell: s => (s.overallStatus === 'published' ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>),
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: s => (
        <span className="inline-flex gap-1">
          <IconButton icon="pencil" label={`Edit ${s.name}`} onClick={() => setFormFor(s)} />
          <IconButton icon="trash" label={`Delete ${s.name}`} onClick={() => setDeletingSubject(s)} className="hover:bg-danger-soft hover:text-danger-strong" />
        </span>
      ),
    },
  ]

  return (
    <div data-testid="subjects-view">
      <div className="overflow-hidden rounded-md border border-subtle bg-surface">
        <DataTable
          label="Subjects"
          rows={subjects}
          columns={columns}
          rowKey={s => s.id}
          searchPlaceholder="Search subjects or linked listings"
          pageSize={50}
          emptyTitle="No subjects yet"
          emptyDescription="Create a subject, add cards by hand, or import a CSV of questions."
          toolbar={
            <>
              <Link href="/admin/upcat/import" className={buttonClass({ size: 'sm' })}>Import CSV</Link>
              <Link href="/admin/flashcards/new" className={buttonClass({ size: 'sm' })}>Add manually</Link>
              <Button variant="primary" size="sm" icon="plus" onClick={() => setFormFor('new')}>New subject</Button>
            </>
          }
        />
      </div>

      {formFor !== null && (
        <SubjectFormDialog
          subject={formFor === 'new' ? null : formFor}
          listings={listings}
          onClose={() => setFormFor(null)}
          onSaved={handleSaved}
        />
      )}

      {deletingSubject && (
        <ConfirmDialog
          message={`Delete "${deletingSubject.name}"? This permanently removes ${plural(deletingSubject.topics.length, 'topic')} and ${plural(deletingSubject.totalCards, 'card')}.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete subject'}
          onConfirm={confirmDelete}
          onCancel={() => { if (!deleting) setDeletingSubject(null) }}
        />
      )}
    </div>
  )
}
