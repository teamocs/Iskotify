'use client'

import { useEffect, useState } from 'react'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ExamTagSelector } from './ExamTagSelector'

interface Listing {
  slug: string
  title: string
  type?: string
}

interface Props {
  open: boolean
  title: string
  description: string
  topicIds: string[]                          // topics to publish (1+ for single, N for bulk)
  onClose: () => void
  onPublished: (publishedTopicIds: string[]) => void
  primaryLabel?: string                       // e.g. "Publish 3 topics"
}

export function PublishModal({
  open, title, description, topicIds, onClose, onPublished, primaryLabel,
}: Props) {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | undefined>(undefined)
  const [listingsError, setListingsError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null); setPublishing(false); setProgress(null); setSelectedSlugs([]); setTagError(undefined); setListings(null); setListingsError(null)
    fetch('/api/admin/listings')
      .then(r => r.json())
      .then(body => {
        setListings(Array.isArray(body) ? body : (body.listings ?? []))
      })
      .catch(e => { setListings([]); setListingsError(e?.message ?? 'Failed to load listings') })
  }, [open])

  async function handlePublish() {
    if (publishing || topicIds.length === 0) return
    if (selectedSlugs.length === 0) {
      setTagError('Pick at least one exam or scholarship.')
      return
    }
    setTagError(undefined)
    setPublishing(true); setError(null); setProgress({ done: 0, total: topicIds.length })

    const slugs = selectedSlugs
    const published: string[] = []
    const failed: Array<{ topicId: string; message: string }> = []

    for (let i = 0; i < topicIds.length; i++) {
      const topicId = topicIds[i]!
      try {
        const res = await fetch(`/api/flashcards/publish/${topicId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_slugs: slugs }),
        })
        if (res.ok) {
          published.push(topicId)
        } else {
          const body = await res.json().catch(() => ({}))
          failed.push({ topicId, message: body?.error ?? `HTTP ${res.status}` })
        }
      } catch (e: any) {
        failed.push({ topicId, message: e?.message ?? 'Network error' })
      }
      setProgress({ done: i + 1, total: topicIds.length })
    }

    setPublishing(false)
    if (failed.length > 0) {
      // Keep the detailed partial-failure breakdown inline (which topic ids
      // failed and why) — the toast gives the action-level headline only.
      setError(
        `Published ${published.length}/${topicIds.length}. ${failed.length} failed: ` +
        failed.map(f => f.message).join('; ')
      )
      notifyError(`Published ${published.length}/${topicIds.length} — ${failed.length} failed`)
    } else {
      notifySuccess(`Published ${published.length} topic${published.length === 1 ? '' : 's'}`)
    }
    if (published.length > 0) onPublished(published)
  }

  const finished = progress !== null && progress.done === progress.total && !publishing
  // Closing mid-publish would orphan the loop's progress, so the dialog stays put.
  const guardedClose = () => { if (!publishing) onClose() }

  return (
    <Dialog
      open={open}
      onClose={guardedClose}
      title={title}
      description={description}
      size="lg"
      onSubmit={handlePublish}
      dirty={selectedSlugs.length > 0 && !publishing && !finished}
      footer={close => (
        <>
          <Button onClick={close} disabled={publishing}>{finished ? 'Close' : 'Cancel'}</Button>
          <Button type="submit" variant="primary" loading={publishing} disabled={topicIds.length === 0}>
            {publishing
              ? `Publishing ${progress?.done ?? 0}/${progress?.total ?? topicIds.length}…`
              : (primaryLabel ?? `Publish ${topicIds.length} topic${topicIds.length === 1 ? '' : 's'}`)}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {listings === null ? (
          <fieldset className="space-y-2">
            <legend className="text-ui font-medium text-ink">
              Tag to exams and scholarships<span aria-hidden="true" className="ml-0.5 text-danger">*</span>
            </legend>
            <p role="status" className="text-ui text-ink-muted">Loading exams and scholarships…</p>
          </fieldset>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <ExamTagSelector
              label="Tag to exams and scholarships"
              hint="Every card in the selected topics gets these tags."
              required
              listings={listings}
              selected={selectedSlugs}
              onChange={slugs => { setSelectedSlugs(slugs); if (slugs.length > 0) setTagError(undefined) }}
              error={tagError}
              disabled={publishing}
            />
          </div>
        )}

        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-ink-muted">
              <span id="publish-progress-label">{finished ? 'Done' : 'Publishing…'}</span>
              <span className="tabular-nums">{progress.done}/{progress.total}</span>
            </div>
            <div
              role="progressbar"
              aria-labelledby="publish-progress-label"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="h-1.5 w-full overflow-hidden rounded-pill bg-neutral-soft"
            >
              <div className="h-full bg-maroon transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {listingsError && <ErrorBanner title="Couldn’t load exams and scholarships" message={listingsError} />}
        {error && <ErrorBanner title="Some topics were not published" message={error} />}
      </div>
    </Dialog>
  )
}
