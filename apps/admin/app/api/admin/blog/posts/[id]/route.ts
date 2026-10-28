import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import { isUuid } from '@/lib/isUuid'

export const runtime = 'nodejs'

// Takes a live post down (unpublished: /blog/<slug> 404s) or puts it back.
// Body: { status: 'published' | 'unpublished' }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid post id' }, { status: 400 })
  let body: { status?: unknown } | null = null
  try { body = await req.json() } catch { /* validated below */ }
  const status = body?.status
  if (status !== 'published' && status !== 'unpublished') {
    return NextResponse.json({ error: 'status must be published or unpublished' }, { status: 400 })
  }

  const db = gate.supabase!
  try {
    const { data, error } = await db.from('blog_posts').update({ status }).eq('id', id).select('slug')
    if (error) throw new Error(error.message)
    const slug = ((data ?? []) as { slug: string }[])[0]?.slug
    if (!slug) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
    revalidatePath('/admin/sync')
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    console.error('[admin/blog/posts/[id] PATCH] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Update failed') }, { status: 500 })
  }
}
