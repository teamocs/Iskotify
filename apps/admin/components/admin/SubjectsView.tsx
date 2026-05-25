'use client'

import React, { useState } from 'react'
import Link from 'next/link'

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

function StatusBadge({ status }: { status: string }) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

function ListingPills({ slugs, listings }: { slugs: string[]; listings: ListingOption[] }) {
  if (slugs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {slugs.map(slug => {
        const listing = listings.find(l => l.slug === slug)
        return listing ? (
          <span key={slug} className="px-1.5 py-0.5 rounded text-[10px] bg-[#f3f4f6] text-[#6e6e73]">
            {listing.title}
          </span>
        ) : null
      })}
    </div>
  )
}

export function SubjectsView({ subjects: initialSubjects, listings }: Props) {
  const [subjects, setSubjects] = useState(initialSubjects)
  const [editingSubject, setEditingSubject] = useState<SubjectRow | null>(null)
  const [deletingSubject, setDeletingSubject] = useState<SubjectRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [editName, setEditName] = useState('')
  const [editSlugs, setEditSlugs] = useState<string[]>([])

  const scholarships = listings.filter(l => l.type === 'scholarship')
  const exams = listings.filter(l => l.type === 'exam')

  function startEdit(subject: SubjectRow) {
    setEditingSubject(subject)
    setEditName(subject.name)
    setEditSlugs(subject.listing_slugs)
    setDeletingSubject(null)
    setEditError('')
  }

  function startDelete(subject: SubjectRow) {
    setDeletingSubject(subject)
    setEditingSubject(null)
    setDeleteError('')
  }

  function toggleSlug(slug: string) {
    setEditSlugs(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  async function saveEdit() {
    if (!editingSubject) return
    setSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/flashcards/subjects/${editingSubject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), listing_slugs: editSlugs }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setEditError(body.error ?? 'Something went wrong')
        return
      }
      const updated = await res.json()
      setSubjects(prev =>
        prev.map(s =>
          s.id === updated.id
            ? { ...s, name: updated.name, listing_slugs: updated.listing_slugs }
            : s
        )
      )
      setEditingSubject(null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deletingSubject) return
    setSaving(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/flashcards/subjects/${deletingSubject.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setDeleteError(body.error ?? 'Something went wrong')
        return
      }
      setSubjects(prev => prev.filter(s => s.id !== deletingSubject.id))
      setDeletingSubject(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="subjects-view" className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6e6e73]">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Link
            href="/admin/flashcards/new"
            className="px-3 py-1.5 text-xs font-semibold border border-[#d1d5db] rounded-lg text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
          >
            + Add manually
          </Link>
          <Link
            href="/admin/flashcards/upload"
            className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
          >
            Upload PDF
          </Link>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="text-center py-16 text-[#6e6e73] text-sm">
          No subjects yet. Upload a PDF or add cards manually.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Subject</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topics</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map(subject => (
                  <React.Fragment key={subject.id}>
                    <tr className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1d1d1f]">{subject.name}</p>
                        <ListingPills slugs={subject.listing_slugs} listings={listings} />
                      </td>
                      <td className="px-5 py-3 text-[#374151]">{subject.topics.length}</td>
                      <td className="px-5 py-3 text-[#374151]">{subject.totalCards}</td>
                      <td className="px-5 py-3"><StatusBadge status={subject.overallStatus} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <Link
                            href={`/admin/flashcards/subjects/${subject.id}`}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => startEdit(subject)}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => startDelete(subject)}
                            className="text-xs text-[#6e6e73] hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {deletingSubject?.id === subject.id && (
                      <tr className="border-b border-[#f3f4f6]">
                        <td colSpan={5} className="px-5 py-3 bg-red-50 border-t border-red-100">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-red-700">
                              Delete <strong>{subject.name}</strong>? This will permanently remove{' '}
                              <strong>{subject.topics.length} topic{subject.topics.length !== 1 ? 's' : ''}</strong> and{' '}
                              <strong>{subject.totalCards} card{subject.totalCards !== 1 ? 's' : ''}</strong>.
                            </p>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                              <button
                                onClick={confirmDelete}
                                disabled={saving}
                                className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                              >
                                Yes, delete
                              </button>
                              <button
                                onClick={() => { setDeletingSubject(null); setDeleteError('') }}
                                className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {subjects.map(subject => (
              <div key={subject.id} className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
                <p className="font-medium text-[#1d1d1f]">{subject.name}</p>
                <p className="text-xs text-[#6e6e73] mt-0.5">
                  {subject.topics.length} {subject.topics.length !== 1 ? 'topics' : 'topic'} · {subject.totalCards} {subject.totalCards !== 1 ? 'cards' : 'card'}
                </p>
                <ListingPills slugs={subject.listing_slugs} listings={listings} />
                <div className="mt-1"><StatusBadge status={subject.overallStatus} /></div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-[#f3f4f6]">
                  <Link
                    href={`/admin/flashcards/subjects/${subject.id}`}
                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => startEdit(subject)}
                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => startDelete(subject)}
                    className="text-xs text-[#6e6e73] hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
                {deletingSubject?.id === subject.id && (
                  <div className="mt-3 pt-3 border-t border-red-100 bg-red-50 -mx-4 -mb-4 px-4 pb-4 rounded-b-2xl">
                    <p className="text-sm text-red-700 mb-2">
                      Delete <strong>{subject.name}</strong>? This will permanently remove{' '}
                      <strong>{subject.topics.length} topic{subject.topics.length !== 1 ? 's' : ''}</strong> and{' '}
                      <strong>{subject.totalCards} card{subject.totalCards !== 1 ? 's' : ''}</strong>.
                    </p>
                    {deleteError && <p className="text-xs text-red-600 mb-2">{deleteError}</p>}
                    <div className="flex gap-3">
                      <button
                        onClick={confirmDelete}
                        disabled={saving}
                        className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => { setDeletingSubject(null); setDeleteError('') }}
                        className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editingSubject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (!saving) { setEditingSubject(null); setEditError('') } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-subject-heading"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !saving) {
                setEditingSubject(null)
                setEditError('')
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 id="edit-subject-heading" className="text-base font-semibold text-[#1d1d1f]">Edit Subject</h2>

            <div className="space-y-1">
              <label htmlFor="edit-subject-name" className="text-xs font-medium text-[#6e6e73]">Subject name</label>
              <input
                id="edit-subject-name"
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
              />
            </div>

            {scholarships.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#6e6e73]">Scholarships</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {scholarships.map(l => (
                    <label key={l.slug} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSlugs.includes(l.slug)}
                        onChange={() => toggleSlug(l.slug)}
                        className="accent-[#800000]"
                      />
                      <span className="text-sm text-[#1d1d1f]">{l.title}</span>
                      {l.provider && <span className="text-xs text-[#6e6e73]">· {l.provider}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {exams.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#6e6e73]">Exams</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {exams.map(l => (
                    <label key={l.slug} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSlugs.includes(l.slug)}
                        onChange={() => toggleSlug(l.slug)}
                        className="accent-[#800000]"
                      />
                      <span className="text-sm text-[#1d1d1f]">{l.title}</span>
                      {l.provider && <span className="text-xs text-[#6e6e73]">· {l.provider}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {editError && (
              <p className="bg-red-50 rounded-[10px] px-3 py-2 text-sm text-red-600">{editError}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setEditingSubject(null); setEditError('') }}
                className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="px-4 py-1.5 text-sm font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
