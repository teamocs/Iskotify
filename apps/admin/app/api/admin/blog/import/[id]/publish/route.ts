import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import { isUuid } from '@/lib/isUuid'
import type { BlogPostDraft } from '@/lib/blog/parseDoc'

export const runtime = 'nodejs'

interface BlogBatch { id: string; drive_file_id: string; status: string; post: BlogPostDraft; flags: string[] }

/**
 * Publishes a blog preview (from the Drive sync) to blog_posts, live at
 * /blog/<slug>. Body (optional): confirmFlags — a preview with flagged claims
 * (e.g. pricing) is never published without it.
 *
 * Order, as announcements: claim the batch (preview → published, only if still
 * in preview), then upsert the post on drive_file_id; if that write fails the
 * batch goes back to preview. A slug held by another post is a 409.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid preview id' }, { status: 400 })
  let body: { confirmFlags?: unknown } | null = null
  try { body = await req.json() } catch { /* body is optional */ }

  const db = gate.supabase!
  try {
    const { data: row, error: fetchError } = await db.from('blog_import_batches').select('*').eq('id', id).maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    if (!row) return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
    const batch = row as BlogBatch
    if (batch.status !== 'preview') return NextResponse.json({ error: `This preview is already ${batch.status}.` }, { status: 409 })
    if (batch.flags.length > 0 && body?.confirmFlags !== true) {
      return NextResponse.json({ error: 'This post has claims to check before it can go live.', flags: batch.flags }, { status: 400 })
    }

    const { data: existing, error: existingError } = await db.from('blog_posts').select('slug').eq('drive_file_id', batch.drive_file_id)
    if (existingError) throw new Error(existingError.message)
    const oldSlug = ((existing ?? []) as { slug: string }[])[0]?.slug

    const now = new Date().toISOString()
    const { data: claimed, error: claimError } = await db
      .from('blog_import_batches')
      .update({ status: 'published', published_at: now, published_by: gate.userId ?? null })
      .eq('id', id)
      .eq('status', 'preview')
      .select('id')
    if (claimError) throw new Error(claimError.message)
    if (!claimed || claimed.length === 0) return NextResponse.json({ error: 'This preview was already published or discarded.' }, { status: 409 })

    const p = batch.post
    const { error: writeError } = await db.from('blog_posts').upsert({
      drive_file_id: batch.drive_file_id, slug: p.slug, title: p.title, meta_title: p.metaTitle, meta_description: p.metaDescription,
      body_md: p.bodyMd, faq: p.faq, author_name: p.authorName, author_bio: p.authorBio, status: 'published',
    }, { onConflict: 'drive_file_id' })
    if (writeError) {
      // Put the batch back so it can be published again. If a newer preview of
      // the same Doc arrived meanwhile (one live preview per file), discard this one.
      const { error: revertError } = await db
        .from('blog_import_batches')
        .update({ status: 'preview', published_at: null, published_by: null })
        .eq('id', id)
        .eq('status', 'published')
      if (revertError) {
        console.error('[admin/blog/import/[id]/publish] revert failed:', revertError)
        await db.from('blog_import_batches').update({ status: 'discarded', discarded_at: new Date().toISOString() }).eq('id', id)
      }
      if ((writeError as { code?: string }).code === '23505') {
        return NextResponse.json({ error: `Another post already uses /blog/${p.slug} — change the slug in the Doc.` }, { status: 409 })
      }
      throw new Error(`blog_posts write failed: ${writeError.message}`)
    }

    revalidatePath('/blog')
    revalidatePath(`/blog/${p.slug}`)
    if (oldSlug && oldSlug !== p.slug) revalidatePath(`/blog/${oldSlug}`)
    revalidatePath('/admin/sync')
    return NextResponse.json({ published: p.slug })
  } catch (err) {
    console.error('[admin/blog/import/[id]/publish POST] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Publish failed') }, { status: 500 })
  }
}
