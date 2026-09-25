'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Topbar } from '@/components/admin/Topbar'
import { saveCourseTags } from '@/lib/admin/courseTagsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { controlClass } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'

// The canonical course clusters (must match career_courses.cluster). A listing tagged
// with one or more of these is restricted to those fields; ["all"] = open to any course.
const CLUSTERS = [
  'Engineering & Technology', 'Health Professions', 'Science & Math', 'Business & Management',
  'Information Technology', 'Architecture', 'Teacher Education', 'Social Sciences',
  'Maritime', 'Multi-Interdisciplinary', 'Other',
] as const

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'exam', label: 'Exams' },
  { value: 'scholarship', label: 'Scholarships' },
] as const

interface Row {
  id: string
  title: string
  type: string
  target_courses: string[]
  target_courses_source: string | null
}

/** A pressed-state chip: selected reads as a check + tinted fill, not colour alone. */
function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-7 items-center gap-1 rounded-pill border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'border-maroon bg-maroon-dim text-maroon' : 'border-strong bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink',
      ].join(' ')}
    >
      {on && <Icon name="check" size={12} />}
      {children}
    </button>
  )
}

export default function CourseTagsPage() {
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    [],
  )
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'exam' | 'scholarship'>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id,title,type,target_courses,target_courses_source')
        .order('type', { ascending: true })
        .order('title', { ascending: true })
      if (!active) return
      if (error) setError(error.message)
      else setRows((data ?? []) as Row[])
      setLoading(false)
    })()
    return () => { active = false }
  }, [supabase])

  const save = useCallback(async (id: string, target_courses: string[]) => {
    setSavingId(id)
    // Optimistic update — remember the previous value so it can be rolled
    // back if the server rejects the change. Previously there was no
    // rollback at all: a failed save left the checkbox showing a state the
    // database never actually stored.
    let previous: { target_courses: string[]; target_courses_source: string | null } | null = null
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      previous = { target_courses: r.target_courses, target_courses_source: r.target_courses_source }
      return { ...r, target_courses, target_courses_source: 'manual' }
    }))
    const result = await saveCourseTags(id, target_courses)
    if (!result.ok) {
      setError(result.error)
      notifyError(result.error)
      if (previous) {
        const revertTo = previous as { target_courses: string[]; target_courses_source: string | null }
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...revertTo } : r))
      }
      setSavingId(null)
      return
    }
    notifySuccess('Course tags saved')
    setSavingId(null)
  }, [])

  const toggleCluster = useCallback((r: Row, cluster: string) => {
    const has = r.target_courses.includes(cluster)
    let next = has
      ? r.target_courses.filter(c => c !== cluster)
      : [...r.target_courses.filter(c => c !== 'all'), cluster]
    if (next.length === 0) next = ['all']
    void save(r.id, next)
  }, [save])

  const setOpenAll = useCallback((r: Row) => { void save(r.id, ['all']) }, [save])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      (typeFilter === 'all' || r.type === typeFilter) &&
      (!needle || r.title.toLowerCase().includes(needle)),
    )
  }, [rows, q, typeFilter])

  const aiCount = useMemo(() => rows.filter(r => r.target_courses_source === 'ai').length, [rows])

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Course Tags" />
      <PageBody
        width="wide"
        intro={<>
          Which course fields each exam or scholarship is open to. <strong className="font-semibold text-ink">All courses</strong> means no
          field restriction. Tags map to a student&apos;s target course via its cluster, so course-specific scholarships (DOST, etc.) reach
          the right students.{aiCount > 0 ? ` ${aiCount} were AI-tagged — review and correct any below.` : ''}
        </>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              aria-label="Search listings"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search listings"
              className={`${controlClass} pl-8`}
            />
          </div>
          <div role="group" aria-label="Listing type" className="flex gap-1">
            {TYPE_FILTERS.map(tf => (
              <button
                key={tf.value}
                type="button"
                aria-pressed={typeFilter === tf.value}
                onClick={() => setTypeFilter(tf.value)}
                className={buttonClass({ variant: typeFilter === tf.value ? 'secondary' : 'ghost', size: 'sm', className: typeFilter === tf.value ? 'bg-surface-2' : undefined })}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBanner title="Couldn’t load or save course tags" message={error} />}

        {loading ? (
          <p role="status" className="py-10 text-center text-ui text-ink-muted">Loading listings…</p>
        ) : (
          <Card flush>
            <p aria-live="polite" className="border-b border-subtle px-4 py-2 text-xs tabular-nums text-ink-muted">
              {filtered.length} listing{filtered.length === 1 ? '' : 's'}
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                icon="tag"
                title={rows.length === 0 ? 'No listings yet' : 'No listings match'}
                description={rows.length === 0 ? 'Listings arrive from the master-sheet sync on the Listings page.' : 'Try a different search or type.'}
              />
            ) : (
              <ul className="divide-y divide-subtle">
                {filtered.map(r => {
                  const openAll = r.target_courses.length === 0 || r.target_courses.includes('all')
                  const saving = savingId === r.id
                  return (
                    <li key={r.id} className="px-4 py-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge tone={r.type === 'exam' ? 'info' : 'brand'}>{r.type === 'exam' ? 'Exam' : r.type === 'scholarship' ? 'Scholarship' : r.type}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.title}</span>
                        {r.target_courses_source === 'ai' && <Badge tone="warning">AI-tagged</Badge>}
                        {saving && <span role="status" className="text-xs text-ink-muted">Saving…</span>}
                      </div>
                      <div role="group" aria-label={`Course fields for ${r.title}`} className="flex flex-wrap gap-1.5">
                        <Chip on={openAll} onClick={() => setOpenAll(r)} disabled={saving}>All courses</Chip>
                        {CLUSTERS.map(c => (
                          <Chip key={c} on={r.target_courses.includes(c)} onClick={() => toggleCluster(r, c)} disabled={saving}>{c}</Chip>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )}
      </PageBody>
    </div>
  )
}
