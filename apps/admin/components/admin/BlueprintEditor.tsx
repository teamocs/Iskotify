'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'

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

export function BlueprintEditor({ initialBlueprint, initialSections, initialNotes, categories, isNew }: Props) {
  const router = useRouter()
  const [blueprint, setBlueprint] = useState<Blueprint>(initialBlueprint ?? EMPTY_BLUEPRINT)
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [notes, setNotes] = useState<CourseNote[]>(initialNotes)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setBp<K extends keyof Blueprint>(key: K, value: Blueprint[K]) {
    setBlueprint(prev => ({ ...prev, [key]: value }))
  }

  // ---- Sections helpers ----
  function addSection() { setSections(prev => [...prev, { ...EMPTY_SECTION }]) }
  function removeSection(i: number) { setSections(prev => prev.filter((_, idx) => idx !== i)) }
  function setSection<K extends keyof Section>(i: number, key: K, value: Section[K]) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))
  }

  // ---- Course notes helpers ----
  function addNote() { setNotes(prev => [...prev, { ...EMPTY_NOTE }]) }
  function removeNote(i: number) { setNotes(prev => prev.filter((_, idx) => idx !== i)) }
  function setNote<K extends keyof CourseNote>(i: number, key: K, value: CourseNote[K]) {
    setNotes(prev => prev.map((n, idx) => idx === i ? { ...n, [key]: value } : n))
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
      if (!res.ok) { setError(body.error ?? 'Save failed'); return }
      router.push('/admin/exam-blueprints')
      router.refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete blueprint "${blueprint.slug}"? This cannot be undone.`)) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/exam-blueprints?slug=${encodeURIComponent(blueprint.slug)}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'Delete failed'); return }
      router.push('/admin/exam-blueprints')
      router.refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const title = isNew ? 'New Blueprint' : (blueprint.name || blueprint.slug || 'Edit Blueprint')

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title={title} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-8">

          {error && (
            <div className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-danger-strong text-sm">{error}</div>
          )}

          {/* ---- Blueprint fields ---- */}
          <section className="space-y-4">
            <h2 className="text-ink font-heading font-bold text-lg tracking-tight border-b border-black/[0.08] pb-2">Blueprint</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Slug</label>
                <input aria-label="Slug"
                  value={blueprint.slug}
                  onChange={e => setBp('slug', e.target.value)}
                  disabled={!isNew}
                  placeholder="e.g. upcat-2026"
                  className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm disabled:bg-surface-2 disabled:text-ink-muted"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Acronym</label>
                <input aria-label="Acronym"
                  value={blueprint.acronym}
                  onChange={e => setBp('acronym', e.target.value)}
                  placeholder="e.g. UPCAT"
                  className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Name</label>
              <input aria-label="Name"
                value={blueprint.name}
                onChange={e => setBp('name', e.target.value)}
                placeholder="Full exam name"
                className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Total items</label>
                <input aria-label="Total items"
                  type="number" min={0}
                  value={blueprint.total_items}
                  onChange={e => setBp('total_items', Number(e.target.value))}
                  className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Total minutes</label>
                <input aria-label="Total minutes"
                  type="number" min={0}
                  value={blueprint.total_time_minutes}
                  onChange={e => setBp('total_time_minutes', Number(e.target.value))}
                  className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Display order</label>
                <input aria-label="Display order"
                  type="number" min={0}
                  value={blueprint.display_order}
                  onChange={e => setBp('display_order', Number(e.target.value))}
                  className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blueprint.has_guessing_penalty}
                    onChange={e => setBp('has_guessing_penalty', e.target.checked)}
                  />
                  Has guessing penalty
                </label>
                {blueprint.has_guessing_penalty && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Penalty per wrong answer</label>
                    <input aria-label="Penalty per wrong answer"
                      type="number" min={0} step={0.01}
                      value={blueprint.guessing_penalty}
                      onChange={e => setBp('guessing_penalty', Number(e.target.value))}
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blueprint.section_blocked}
                    onChange={e => setBp('section_blocked', e.target.checked)}
                  />
                  Section-blocked (separate time per section)
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Scoring note</label>
              <textarea aria-label="Scoring note"
                value={blueprint.scoring_note}
                onChange={e => setBp('scoring_note', e.target.value)}
                rows={2}
                className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm resize-y"
                placeholder="e.g. 1 point per correct answer, no penalty for wrong answers"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Mechanics note</label>
              <textarea aria-label="Mechanics note"
                value={blueprint.mechanics_note}
                onChange={e => setBp('mechanics_note', e.target.value)}
                rows={3}
                className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm resize-y"
                placeholder="General mechanics, instructions, or notes for this exam"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Status</label>
              <select aria-label="Status"
                value={blueprint.status}
                onChange={e => setBp('status', e.target.value)}
                className="border border-black/[0.15] rounded px-3 py-2 text-sm"
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
            </div>
          </section>

          {/* ---- Sections editor ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
              <h2 className="text-ink font-heading font-bold text-lg tracking-tight">Sections</h2>
              <button
                type="button"
                onClick={addSection}
                className="text-xs font-semibold text-maroon hover:text-maroon-light transition-colors"
              >
                + Add section
              </button>
            </div>

            {sections.length === 0 && (
              <p className="text-ink-muted text-sm">No sections yet. Click &quot;Add section&quot; to start.</p>
            )}

            {sections.map((sec, i) => (
              <div key={i} className="rounded-xl border border-black/[0.08] bg-surface-3 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Section {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    className="text-xs text-danger hover:text-danger-strong transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Name</label>
                    <input aria-label="Name"
                      value={sec.name}
                      onChange={e => setSection(i, 'name', e.target.value)}
                      placeholder="e.g. Mathematics"
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Skill category</label>
                    <select aria-label="Skill category"
                      value={sec.skill_category}
                      onChange={e => setSection(i, 'skill_category', e.target.value)}
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    >
                      <option value="">— select category —</option>
                      {categories.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Item count</label>
                    <input aria-label="Item count"
                      type="number" min={0}
                      value={sec.item_count}
                      onChange={e => setSection(i, 'item_count', Number(e.target.value))}
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">
                      Per-section minutes <span className="text-ink-subtle">(only if section-blocked)</span>
                    </label>
                    <input aria-label="Per-section minutes (only if section-blocked)"
                      type="number" min={0}
                      value={sec.time_minutes ?? ''}
                      onChange={e => setSection(i, 'time_minutes', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="optional"
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sec.requires_spatial_logic}
                        onChange={e => setSection(i, 'requires_spatial_logic', e.target.checked)}
                      />
                      Spatial/logic
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* ---- Course notes editor ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
              <h2 className="text-ink font-heading font-bold text-lg tracking-tight">Course Notes</h2>
              <button
                type="button"
                onClick={addNote}
                className="text-xs font-semibold text-maroon hover:text-maroon-light transition-colors"
              >
                + Add note
              </button>
            </div>

            {notes.length === 0 && (
              <p className="text-ink-muted text-sm">No course notes. Click &quot;Add note&quot; for course-specific guidance.</p>
            )}

            {notes.map((n, i) => (
              <div key={i} className="rounded-xl border border-black/[0.08] bg-surface-3 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Note {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeNote(i)}
                    className="text-xs text-danger hover:text-danger-strong transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Course cluster</label>
                    <input aria-label="Course cluster"
                      value={n.course_cluster}
                      onChange={e => setNote(i, 'course_cluster', e.target.value)}
                      placeholder="all, Engineering & Technology, …"
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">
                      Min percentile <span className="text-ink-subtle">(optional)</span>
                    </label>
                    <input aria-label="Min percentile"
                      type="number" min={0} max={100}
                      value={n.min_percentile ?? ''}
                      onChange={e => setNote(i, 'min_percentile', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="e.g. 90"
                      className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1">Note</label>
                  <textarea aria-label="Note"
                    value={n.note}
                    onChange={e => setNote(i, 'note', e.target.value)}
                    rows={2}
                    className="w-full border border-black/[0.15] rounded px-3 py-2 text-sm resize-y"
                    placeholder="Course-specific exam guidance or tip"
                  />
                </div>
              </div>
            ))}
          </section>

          {/* ---- Actions ---- */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-black/[0.08]">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm ${
                busy
                  ? 'bg-surface-2 text-ink-muted cursor-not-allowed'
                  : 'bg-maroon text-white hover:bg-[#9a0a1f]'
              }`}
            >
              {saving ? 'Saving…' : 'Save blueprint'}
            </button>

            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors ${
                  busy
                    ? 'text-ink-subtle cursor-not-allowed'
                    : 'text-danger hover:bg-danger-soft'
                }`}
              >
                {deleting ? 'Deleting…' : 'Delete blueprint'}
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push('/admin/exam-blueprints')}
              disabled={busy}
              className="text-sm text-ink-muted hover:text-ink-muted transition-colors"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
