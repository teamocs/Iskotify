'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '../ConfirmDialog'
import { apiRequest } from '@/lib/apiRequest'
import { notifyError, notifySuccess } from '@/lib/toast'
import type { BlogPostDraft } from '@/lib/blog/parseDoc'
import { HeldFiles } from './HeldFiles'
import { jsonInit, plural, type ContentFileRow } from './types'

export interface BlogPreview {
  id: string
  drive_file_id: string
  file_name: string
  action: 'new' | 'update'
  created_at: string
  flags: string[]
  post: BlogPostDraft
}

export interface LivePostRow {
  id: string
  slug: string
  title: string
  status: 'published' | 'unpublished'
  first_published_at: string
  updated_at: string
}

interface Props {
  previews: BlogPreview[]
  posts: LivePostRow[]
  /** Blog Docs the sync held back (unreadable front matter, slug clash) or skipped. */
  files: ContentFileRow[]
}

const words = (md: string) => md.split(/\s+/).filter(Boolean).length

function Preview({ b, busy, onPublish, onDiscard }: { b: BlogPreview; busy: boolean; onPublish: (confirmFlags: boolean) => void; onDiscard: () => void }) {
  const [checked, setChecked] = useState(false)
  const flagged = b.flags.length > 0
  const p = b.post
  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={b.action === 'new' ? 'success' : 'neutral'}>{b.action === 'new' ? 'New post' : 'Updated post'}</Badge>
        <span className="text-xs text-ink-muted break-all">{b.file_name}</span>
      </div>
      <h3 className="font-semibold text-ink">{p.title}</h3>
      <p className="text-xs text-ink-muted break-all">/blog/{p.slug} · {plural(words(p.bodyMd), 'word')}{p.faq.length ? ` · ${plural(p.faq.length, 'FAQ')}` : ''}</p>
      {p.metaDescription && <p className="text-ui text-ink-muted">{p.metaDescription}</p>}
      {flagged && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 space-y-2">
          <ul className="list-disc pl-5 text-ui text-ink">{b.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
          <label className="flex items-center gap-2 text-ui text-ink">
            <input type="checkbox" className="h-4 w-4 accent-maroon" checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)} />
            I’ve checked these claims
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={busy} disabled={busy || (flagged && !checked)} onClick={() => onPublish(flagged && checked)}>Publish</Button>
        <Button size="sm" disabled={busy} onClick={onDiscard}>Discard</Button>
      </div>
    </li>
  )
}

/**
 * Blog posts from the Drive blog folders (migration 069). Each Doc becomes a
 * preview; nothing is on iskotify.ph/blog until an admin publishes it, and a
 * live post can be taken down again.
 */
export function DriveBlogCard({ previews, posts, files }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<BlogPreview | null>(null)

  async function publish(b: BlogPreview, confirmFlags: boolean) {
    setBusy(b.id)
    const r = await apiRequest<{ published: string }>(`/api/admin/blog/import/${encodeURIComponent(b.id)}/publish`, jsonInit('POST', { confirmFlags }))
    setBusy(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess(`Published /blog/${r.data.published}`)
    router.refresh()
  }

  async function discard(b: BlogPreview) {
    setBusy(b.id)
    const r = await apiRequest(`/api/admin/blog/import/${encodeURIComponent(b.id)}`, { method: 'DELETE' })
    setBusy(null)
    setDiscarding(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess('Preview discarded')
    router.refresh()
  }

  async function setStatus(post: LivePostRow, status: LivePostRow['status']) {
    setBusy(post.id)
    const r = await apiRequest(`/api/admin/blog/posts/${encodeURIComponent(post.id)}`, jsonInit('PATCH', { status }))
    setBusy(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess(status === 'published' ? `/blog/${post.slug} is live again` : `/blog/${post.slug} taken down`)
    router.refresh()
  }

  return (
    <Card
      id="drive-blog"
      title="Blog posts from Drive"
      description="Each blog Doc becomes a preview. Nothing goes live on iskotify.ph/blog until you publish it."
      flush
      className="scroll-mt-16"
    >
      {previews.length > 0 ? (
        <ul aria-label="Blog previews" className="divide-y divide-subtle">
          {previews.map(b => (
            <Preview key={b.id} b={b} busy={busy === b.id} onPublish={c => publish(b, c)} onDiscard={() => setDiscarding(b)} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="file-pen" title="Nothing waiting to publish" description="When a Doc is added or changed in a blog folder, its post shows up here." />
      )}
      <HeldFiles files={files} label="Blog Docs" />
      {posts.length > 0 && (
        <details className="border-t border-subtle">
          <summary className="cursor-pointer px-4 py-3 text-ui font-medium text-ink">{`Posts (${posts.length})`}</summary>
          <ul aria-label="Blog posts" className="divide-y divide-subtle">
            {posts.map(post => (
              <li key={post.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:underline break-all">{post.title}</a>
                <Badge tone={post.status === 'published' ? 'success' : 'neutral'}>{post.status === 'published' ? 'Live' : 'Unpublished'}</Badge>
                <Button size="sm" className="ml-auto" loading={busy === post.id} disabled={busy === post.id}
                  onClick={() => setStatus(post, post.status === 'published' ? 'unpublished' : 'published')}>
                  {post.status === 'published' ? 'Unpublish' : 'Republish'}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {discarding && (
        <ConfirmDialog
          message={`Discard the preview of “${discarding.post.title}”? Nothing is published; the Doc makes a new preview when it changes.`}
          confirmLabel="Discard"
          onConfirm={() => discard(discarding)}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </Card>
  )
}
