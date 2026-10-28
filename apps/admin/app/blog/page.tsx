import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { listPublishedPosts } from '@/lib/blog/posts'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Blog — Iskotify',
  description: 'UPCAT and college entrance exam guides for Filipino students: what to study, what to buy, and how to plan your review.',
  alternates: { canonical: '/blog' },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

export default async function BlogIndexPage() {
  // Prerendered at build time: a failed read shows the empty state instead of
  // failing the build; the next publish (revalidatePath) or the hour refills it.
  let posts: Awaited<ReturnType<typeof listPublishedPosts>> = []
  try { posts = await listPublishedPosts() } catch (err) { console.error('[blog] posts unavailable:', err) }
  return (
    <div className="min-h-screen bg-surface-2">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-ink tracking-tight">Iskotify</span>
        </Link>
        <h1 className="font-heading font-extrabold text-3xl text-ink tracking-tight mb-10">Blog</h1>
        {posts.length === 0 ? (
          <p className="text-[15px] text-ink-muted">No posts yet — check back soon.</p>
        ) : (
          <ul className="space-y-8">
            {posts.map(p => (
              <li key={p.id}>
                <Link href={`/blog/${p.slug}`} className="font-heading font-bold text-lg text-ink hover:text-maroon">{p.title}</Link>
                {p.meta_description && <p className="text-[15px] leading-relaxed text-ink-muted mt-1">{p.meta_description}</p>}
                <p className="text-sm text-ink-muted mt-1"><time dateTime={p.first_published_at}>{fmtDate(p.first_published_at)}</time></p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
