import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReactMarkdown, { type Components } from 'react-markdown'
import { getPublishedPost } from '@/lib/blog/posts'
import { articleJsonLd, faqJsonLd, jsonLdString } from '@/lib/blog/jsonLd'

// Refreshed on publish/unpublish (revalidatePath); hourly as a fallback.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

const LINK_CLASS = 'text-maroon underline'
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

// The landing's long-form type (as /privacy). react-markdown renders no raw HTML.
const MD: Components = {
  h2: ({ children }) => <h2 className="font-heading font-bold text-xl text-ink mt-10 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="font-heading font-bold text-lg text-ink mt-8 mb-2">{children}</h3>,
  p: ({ children }) => <p className="mb-4">{children}</p>,
  strong: ({ children }) => <strong className="text-ink">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 mb-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 mb-4">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-maroon/30 pl-4 italic mb-4">{children}</blockquote>,
  hr: () => <hr className="my-8 border-black/[0.08]" />,
  a: ({ href = '', children }) => /^https?:\/\//.test(href)
    ? <a href={href} className={LINK_CLASS} rel="noopener noreferrer" target="_blank">{children}</a>
    : <a href={href} className={LINK_CLASS}>{children}</a>,
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug)
  if (!post) return { title: 'Post not found — Iskotify' }
  const title = post.meta_title || post.title
  return {
    title: `${title} — Iskotify`,
    description: post.meta_description ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', title, description: post.meta_description ?? undefined, publishedTime: post.first_published_at, modifiedTime: post.updated_at },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getPublishedPost((await params).slug)
  if (!post) notFound()
  const faq = faqJsonLd(post)
  return (
    <div className="min-h-screen bg-surface-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd(post)) }} />
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faq) }} />}
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-ink tracking-tight">Iskotify</span>
        </Link>
        <p className="text-sm mb-3"><Link href="/blog" className={LINK_CLASS}>Blog</Link></p>

        <article>
          <h1 className="font-heading font-extrabold text-3xl text-ink tracking-tight mb-2">{post.title}</h1>
          <p className="text-sm text-ink-muted mb-10">
            {post.author_name ? <>By {post.author_name} · </> : null}
            <time dateTime={post.first_published_at}>{fmtDate(post.first_published_at)}</time>
          </p>
          <div className="text-[15px] leading-relaxed text-ink-muted">
            <ReactMarkdown components={MD} skipHtml>{post.body_md}</ReactMarkdown>
          </div>
          {post.author_bio && (
            <footer className="mt-10 pt-6 border-t border-black/[0.08] text-sm text-ink-muted">
              <p>{post.author_bio}</p>
            </footer>
          )}
        </article>
      </main>
    </div>
  )
}
