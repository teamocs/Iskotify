'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { notifySuccess, notifyError } from '@/lib/toast'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { Field, controlClass } from '@/components/ui/Field'
import { Button, IconButton } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { DiscardChangesDialog } from '@/components/ui/Dialog'
import { errorMessage } from '@/lib/errorMessage'

interface Blueprint {
  slug: string
  name: string
  acronym: string
  total_items: number
  total_time_minutes: number
  has_guessing_penalty: boolean
  guessing_penalty: number
  section_blocked: boolean
  scoring_note: string
  mechanics_note: string
  status: string
  display_order: number
}

interface Section {
  name: string
  skill_category: string
  item_count: number
  time_minutes: number | null
  requires_spatial_logic: boolean
}

interface CourseNote {
  course_cluster: string
  note: string
  min_percentile: number | null
}

interface SkillCategory {
  name: string
  requires_spatial_logic: boolean
  display_order: number
}

interface Props {
  initialBlueprint: Blueprint | null
  initialSections: Section[]
  initialNotes: CourseNote[]
  categories: SkillCategory[]
  isNew: boolean
}

const EMPTY_BLUEPRINT: Blueprint = {
  slug: '', name: '', acronym: '',
  total_items: 0, total_time_minutes: 0,
  has_guessing_penalty: false, guessing_penalty: 0.25,
  section_blocked: false, scoring_note: '', mechanics_note: '',
  status: 'draft', display_order: 0,
}

const EMPTY_SECTION: Section = {
  name: '', skill_category: '', item_count: 0, time_minutes: null, requires_spatial_logic: false,
}

const EMPTY_NOTE: CourseNote = {
  course_cluster: 'all', note: '', min_percentile: null,
}

const LIST_URL = '/admin/exam-blueprints'
const textareaClass = `${controlClass} h-auto py-2 resize-y`
const checkboxClass = 'h-4 w-4 cursor-pointer accent-maroon'

export type BlueprintErrors = Record<string, string>

/**
 * Required-field check run on submit. Keys are `slug`/`name`/`acronym` for the
 * blueprint and `section-<i>-<field>` for sections — each key is also the id
 * suffix of the Field that shows it.
 */
export function validateBlueprint(bp: Pick<Blueprint, 'slug' | 'name' | 'acronym'>, sections: Pick<Section, 'name' | 'skill_category'>[]): BlueprintErrors {
  const errors: BlueprintErrors = {}
  if (!bp.slug.trim()) errors.slug = 'Enter a slug, e.g. upcat-2026.'
  if (!bp.name.trim()) errors.name = 'Enter the exam’s full name.'
  if (!bp.acronym.trim()) errors.acronym = 'Enter an acronym, e.g. UPCAT.'
  sections.forEach((s, i) => {
    if (!s.name.trim()) errors[`section-${i}-name`] = 'Name this section.'
    if (!s.skill_category) errors[`section-${i}-skill_category`] = 'Choose a skill category.'
  })
  return errors
}

const fieldId = (key: string) => `bp-${key}`

export function BlueprintEditor({ initialBlueprint, initialSections, initialNotes, categories, isNew }: Props) {
  const router = useRouter()
  const [blueprint, setBlueprint] = useState<Blueprint>(initialBlueprint ?? EMPTY_BLUEPRINT)
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [notes, setNotes] = useState<CourseNote[]>(initialNotes)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<BlueprintErrors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  // Unsaved edits = anything differing from what the page loaded with.
  const [initialSnapshot] = useState(() => JSON.stringify({ b: initialBlueprint ?? EMPTY_BLUEPRINT, s: initialSections, n: initialNotes }))
  const dirty = useMemo(
    () => JSON.stringify({ b: blueprint, s: sections, n: notes }) !== initialSnapshot,
    [blueprint, sections, notes, initialSnapshot],
  )
  const leaving = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      if (leaving.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function clearError(key: string) {
    setErrors(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function setBp<K extends keyof Blueprint>(key: K, value: Blueprint[K]) {
    setBlueprint(prev => ({ ...prev, [key]: value }))
    clearError(key)
  }

  // ---- Sections helpers ----
  function addSection() { setSections(prev => [...prev, { ...EMPTY_SECTION }]) }
  function removeSection(i: number) {
    setSections(prev => prev.filter((_, idx) => idx !== i))
    // Section error keys are positional; drop them rather than let them point at the wrong row.
    setErrors(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('section-'))))
  }
  function setSection<K extends keyof Section>(i: number, key: K, value: Section[K]) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))
    clearError(`section-${i}-${key}`)
  }

  // ---- Course notes helpers ----
  function addNote() { setNotes(prev => [...prev, { ...EMPTY_NOTE }]) }
  function removeNote(i: number) { setNotes(prev => prev.filter((_, idx) => idx !== i)) }
  function setNote<K extends keyof CourseNote>(i: number, key: K, value: CourseNote[K]) {
    setNotes(prev => prev.map((n, idx) => idx === i ? { ...n, [key]: value } : n))
  }

  function leave() {
    leaving.current = true
    router.push(LIST_URL)
  }

  function requestCancel() {
    if (dirty) setConfirmingDiscard(true)
    else leave()
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || deleting) return
    const found = validateBlueprint(blueprint, sections)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    await handleSave()
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/exam-blueprints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprint, sections, courseNotes: notes }),
      })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? 'Save failed'
        setError(message)
        notifyError(message)
        return
      }
      notifySuccess('Blueprint saved')
      leaving.current = true
      router.push(LIST_URL)
      router.refresh()
    } catch (e) {
      const message = errorMessage(e, 'Save failed')
      setError(message)
      notifyError(message)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    setConfirmingDelete(true)
  }

  async function confirmDelete() {
    setConfirmingDelete(false)
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/exam-blueprints?slug=${encodeURIComponent(blueprint.slug)}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? 'Delete failed'
        setError(message)
        notifyError(message)
        return
      }
      notifySuccess('Blueprint deleted')
      leaving.current = true
      router.push(LIST_URL)
      router.refresh()
    } catch (e) {
      const message = errorMessage(e, 'Delete failed')
      setError(message)
      notifyError(message)
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const title = isNew ? 'New Blueprint' : (blueprint.name || blueprint.slug || 'Edit Blueprint')

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title={title} />
      <form noValidate onSubmit={handleSubmit} aria-label={isNew ? 'New blueprint' : `Edit blueprint ${blueprint.slug}`} className="flex min-h-0 flex-1 flex-col">
        <PageBody width="narrow">
          {error && <ErrorBanner title="Couldn’t save the blueprint" message={error} />}

          {/* ---- Blueprint fields ---- */}
          <Card title="Details">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Slug" id={fieldId('slug')} required error={errors.slug} hint={isNew ? 'Lowercase, used in links. Can’t be changed later.' : 'Can’t be changed after creation.'}>
                  {p => (
                    <input {...p} value={blueprint.slug} onChange={e => setBp('slug', e.target.value)} disabled={!isNew} placeholder="e.g. upcat-2026" className={controlClass} />
                  )}
                </Field>
                <Field label="Acronym" id={fieldId('acronym')} required error={errors.acronym}>
                  {p => (
                    <input {...p} value={blueprint.acronym} onChange={e => setBp('acronym', e.target.value)} placeholder="e.g. UPCAT" className={controlClass} />
                  )}
                </Field>
              </div>

              <Field label="Name" id={fieldId('name')} required error={errors.name}>
                {p => (
                  <input {...p} value={blueprint.name} onChange={e => setBp('name', e.target.value)} placeholder="Full exam name" className={controlClass} />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Total items" id={fieldId('total_items')}>
                  {p => (
                    <input {...p} type="number" min={0} value={blueprint.total_items} onChange={e => setBp('total_items', Number(e.target.value))} className={`${controlClass} tabular-nums`} />
                  )}
                </Field>
                <Field label="Total minutes" id={fieldId('total_time_minutes')}>
                  {p => (
                    <input {...p} type="number" min={0} value={blueprint.total_time_minutes} onChange={e => setBp('total_time_minutes', Number(e.target.value))} className={`${controlClass} tabular-nums`} />
                  )}
                </Field>
                <Field label="Display order" id={fieldId('display_order')}>
                  {p => (
                    <input {...p} type="number" min={0} value={blueprint.display_order} onChange={e => setBp('display_order', Number(e.target.value))} className={`${controlClass} tabular-nums`} />
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className={checkboxClass} checked={blueprint.has_guessing_penalty} onChange={e => setBp('has_guessing_penalty', e.target.checked)} />
                    Has guessing penalty
                  </label>
                  {blueprint.has_guessing_penalty && (
                    <Field label="Penalty per wrong answer" id={fieldId('guessing_penalty')}>
                      {p => (
                        <input {...p} type="number" min={0} step={0.01} value={blueprint.guessing_penalty} onChange={e => setBp('guessing_penalty', Number(e.target.value))} className={`${controlClass} tabular-nums`} />
                      )}
                    </Field>
                  )}
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                  <input type="checkbox" className={`${checkboxClass} mt-0.5`} checked={blueprint.section_blocked} onChange={e => setBp('section_blocked', e.target.checked)} />
                  Section-blocked (separate time per section)
                </label>
              </div>

              <Field label="Scoring note" id={fieldId('scoring_note')}>
                {p => (
                  <textarea {...p} rows={2} value={blueprint.scoring_note} onChange={e => setBp('scoring_note', e.target.value)} placeholder="e.g. 1 point per correct answer, no penalty for wrong answers" className={textareaClass} />
                )}
              </Field>

              <Field label="Mechanics note" id={fieldId('mechanics_note')}>
                {p => (
                  <textarea {...p} rows={3} value={blueprint.mechanics_note} onChange={e => setBp('mechanics_note', e.target.value)} placeholder="General mechanics, instructions, or notes for this exam" className={textareaClass} />
                )}
              </Field>

              <Field label="Status" id={fieldId('status')} hint="Only published blueprints appear in the app." className="sm:max-w-xs">
                {p => (
                  <select {...p} value={blueprint.status} onChange={e => setBp('status', e.target.value)} className={controlClass}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                )}
              </Field>
            </div>
          </Card>

          {/* ---- Sections editor ---- */}
          <Card
            title="Sections"
            description="Saved in this order. Saving replaces every section of this blueprint."
            actions={<Button size="sm" icon="plus" onClick={addSection}>Add section</Button>}
            flush
          >
            {sections.length === 0 ? (
              <p className="px-4 py-6 text-ui text-ink-muted">No sections yet. Use Add section to define the exam’s parts.</p>
            ) : (
              <ol className="divide-y divide-subtle">
                {sections.map((sec, i) => (
                  <li key={i}>
                    <fieldset className="relative space-y-3 px-4 py-4">
                      <legend className="float-left w-full pr-10 text-ui font-semibold text-ink">Section {i + 1}</legend>
                      <IconButton icon="trash" label={`Remove section ${i + 1}${sec.name ? ` (${sec.name})` : ''}`} onClick={() => removeSection(i)} className="absolute right-3 top-3 hover:bg-danger-soft hover:text-danger-strong" />
                      <div className="clear-both" />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Section name" id={fieldId(`section-${i}-name`)} required error={errors[`section-${i}-name`]}>
                          {p => (
                            <input {...p} value={sec.name} onChange={e => setSection(i, 'name', e.target.value)} placeholder="e.g. Mathematics" className={controlClass} />
                          )}
                        </Field>
                        <Field label="Skill category" id={fieldId(`section-${i}-skill_category`)} required error={errors[`section-${i}-skill_category`]}>
                          {p => (
                            <select {...p} value={sec.skill_category} onChange={e => setSection(i, 'skill_category', e.target.value)} className={controlClass}>
                              <option value="">Choose a category</option>
                              {categories.map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="Item count" id={fieldId(`section-${i}-item_count`)}>
                          {p => (
                            <input {...p} type="number" min={0} value={sec.item_count} onChange={e => setSection(i, 'item_count', Number(e.target.value))} className={`${controlClass} tabular-nums`} />
                          )}
                        </Field>
                        <Field label="Section minutes" id={fieldId(`section-${i}-time_minutes`)} hint="Only if section-blocked.">
                          {p => (
                            <input {...p} type="number" min={0} value={sec.time_minutes ?? ''} onChange={e => setSection(i, 'time_minutes', e.target.value === '' ? null : Number(e.target.value))} placeholder="Optional" className={`${controlClass} tabular-nums`} />
                          )}
                        </Field>
                        <label className="flex cursor-pointer items-center gap-2 self-start text-sm text-ink sm:mt-7">
                          <input type="checkbox" className={checkboxClass} checked={sec.requires_spatial_logic} onChange={e => setSection(i, 'requires_spatial_logic', e.target.checked)} />
                          Spatial / logic
                        </label>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* ---- Course notes editor ---- */}
          <Card
            title="Course notes"
            description="Course-specific guidance shown with this exam."
            actions={<Button size="sm" icon="plus" onClick={addNote}>Add note</Button>}
            flush
          >
            {notes.length === 0 ? (
              <p className="px-4 py-6 text-ui text-ink-muted">No course notes. Use Add note for course-specific guidance.</p>
            ) : (
              <ol className="divide-y divide-subtle">
                {notes.map((n, i) => (
                  <li key={i}>
                    <fieldset className="relative space-y-3 px-4 py-4">
                      <legend className="float-left w-full pr-10 text-ui font-semibold text-ink">Note {i + 1}</legend>
                      <IconButton icon="trash" label={`Remove note ${i + 1}`} onClick={() => removeNote(i)} className="absolute right-3 top-3 hover:bg-danger-soft hover:text-danger-strong" />
                      <div className="clear-both" />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Course cluster" id={fieldId(`note-${i}-course_cluster`)} hint="“all” applies to every course.">
                          {p => (
                            <input {...p} value={n.course_cluster} onChange={e => setNote(i, 'course_cluster', e.target.value)} placeholder="all, Engineering & Technology, …" className={controlClass} />
                          )}
                        </Field>
                        <Field label="Min percentile" id={fieldId(`note-${i}-min_percentile`)} hint="Optional.">
                          {p => (
                            <input {...p} type="number" min={0} max={100} value={n.min_percentile ?? ''} onChange={e => setNote(i, 'min_percentile', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 90" className={`${controlClass} tabular-nums`} />
                          )}
                        </Field>
                      </div>
                      <Field label="Note" id={fieldId(`note-${i}-note`)}>
                        {p => (
                          <textarea {...p} rows={2} value={n.note} onChange={e => setNote(i, 'note', e.target.value)} placeholder="Course-specific exam guidance or tip" className={textareaClass} />
                        )}
                      </Field>
                    </fieldset>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </PageBody>

        {/* ---- Actions ---- */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-subtle bg-surface px-4 py-3 md:px-6">
          <Button type="submit" variant="primary" loading={saving} disabled={busy}>
            {saving ? 'Saving…' : 'Save blueprint'}
          </Button>
          <Button onClick={requestCancel} disabled={busy}>Cancel</Button>
          {dirty && !busy && <span className="text-xs text-ink-muted">Unsaved changes</span>}
          {!isNew && (
            <Button
              variant="ghost"
              icon="trash"
              onClick={handleDelete}
              loading={deleting}
              disabled={busy}
              className="ml-auto text-danger hover:bg-danger-soft hover:text-danger-strong"
            >
              {deleting ? 'Deleting…' : 'Delete blueprint'}
            </Button>
          )}
        </div>
      </form>

      {confirmingDelete && (
        <ConfirmDialog
          message={`Delete blueprint "${blueprint.slug}"? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <DiscardChangesDialog
        open={confirmingDiscard}
        onKeep={() => setConfirmingDiscard(false)}
        onDiscard={() => { setConfirmingDiscard(false); leave() }}
      />
    </div>
  )
}
