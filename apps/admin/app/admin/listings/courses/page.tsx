'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Topbar } from '@/components/admin/Topbar'

// The canonical course clusters (must match career_courses.cluster). A listing tagged
// with one or more of these is restricted to those fields; ["all"] = open to any course.
const CLUSTERS = [
  'Engineering & Technology', 'Health Professions', 'Science & Math', 'Business & Management',
  'Information Technology', 'Architecture', 'Teacher Education', 'Social Sciences',
  'Maritime', 'Multi-Interdisciplinary', 'Other',
] as const

interface Row {
  id: string
  title: string
  type: string
  target_courses: string[]
  target_courses_source: string | null
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
    setRows(prev => prev.map(r => r.id === id ? { ...r, target_courses, target_courses_source: 'manual' } : r))
    try {
      const res = await fetch('/api/admin/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, target_courses }),
      })
      if (!res.ok) setError('Save failed — check your admin session and try again.')
    } catch {
      setError('Save failed — network error.')
    } finally {
      setSavingId(null)
    }
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
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-4">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Course-field tags</h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              Which course fields each exam/scholarship is open to. <strong>All courses</strong> = no field
              restriction. Tags map to a student&apos;s target course via its cluster, so course-specific
              scholarships (DOST, etc.) reach the right students. {aiCount > 0 ? `${aiCount} were AI-tagged — review and correct any below.` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search listings…"
              className="flex-1 min-w-[200px] border border-black/[0.12] rounded-lg px-3 py-2 text-sm"
            />
            {(['all', 'exam', 'scholarship'] as const).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setTypeFilter(tf)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold ${typeFilter === tf ? 'bg-[#800000] text-white' : 'bg-[#f5f5f7] text-[#6e6e73]'}`}
              >
                {tf === 'all' ? 'All' : tf === 'exam' ? 'Exams' : 'Scholarships'}
              </button>
            ))}
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-800 text-sm">{error}</div>}
          {loading ? (
            <div className="text-[#6e6e73] text-sm py-10 text-center">Loading…</div>
          ) : (
            <div className="space-y-2">
              <div className="text-[#6e6e73] text-xs">{filtered.length} listing{filtered.length === 1 ? '' : 's'}</div>
              {filtered.map(r => {
                const openAll = r.target_courses.length === 0 || r.target_courses.includes('all')
                return (
                  <div key={r.id} className="rounded-2xl border border-black/[0.08] bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${r.type === 'exam' ? 'bg-[#800000]/10 text-[#800000]' : 'bg-green-100 text-green-700'}`}>
                        {r.type}
                      </span>
                      <span className="text-[#1d1d1f] text-sm font-semibold flex-1 min-w-0 truncate">{r.title}</span>
                      {r.target_courses_source === 'ai' && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">AI</span>}
                      {savingId === r.id && <span className="text-[10px] text-[#6e6e73]">saving…</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenAll(r)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${openAll ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white text-[#6e6e73] border-black/[0.15]'}`}
                      >
                        All courses
                      </button>
                      {CLUSTERS.map(c => {
                        const on = r.target_courses.includes(c)
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCluster(r, c)}
                            className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white text-[#3a3a3c] border-black/[0.15]'}`}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
