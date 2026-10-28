import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlogPost } from '@/lib/blog/posts'

const mockGetPost = vi.fn()
const mockListPosts = vi.fn()
vi.mock('@/lib/blog/posts', () => ({
  getPublishedPost: (slug: string) => mockGetPost(slug),
  listPublishedPosts: () => mockListPosts(),
}))
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))

import { articleJsonLd, faqJsonLd } from '@/lib/blog/jsonLd'

const POST: BlogPost = {
  id: 'p1', slug: 'best-upcat-reviewer-book', title: 'Which UPCAT Review Books Are Actually Worth Buying?',
  meta_title: 'Best UPCAT Reviewer Book', meta_description: 'What each book is for.',
  body_md: 'Three titles come up.\n\n## The trap\n\nHarder is **not** better. <script>alert(1)</script>\n\n## FAQ\n\n**Sapat na ba?** Yes.',
  faq: [{ q: 'Sapat na ba?', a: 'Yes.' }], author_name: 'Bryden Basil C. Elizan', author_bio: 'Founder of OCS.',
  first_published_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-29T00:00:00Z',
}

beforeEach(() => {
  mockGetPost.mockReset()
  mockListPosts.mockReset()
  notFound.mockClear()
})

describe('blog JSON-LD', () => {
  it('describes the post as an Article by a Person, published by Iskotify', () => {
    expect(articleJsonLd(POST)).toMatchObject({
      '@context': 'https://schema.org', '@type': 'Article',
      headline: POST.title, description: 'What each book is for.',
      author: { '@type': 'Person', name: 'Bryden Basil C. Elizan' },
      publisher: { '@type': 'Organization', name: 'Iskotify' },
      datePublished: '2026-10-28T00:00:00Z', dateModified: '2026-10-29T00:00:00Z',
      mainEntityOfPage: 'https://iskotify.ph/blog/best-upcat-reviewer-book',
    })
  })

  it('builds FAQPage only when the post has FAQs', () => {
    expect(faqJsonLd(POST)).toEqual({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Sapat na ba?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } }],
    })
    expect(faqJsonLd({ ...POST, faq: [] })).toBeNull()
  })
})

describe('/blog/[slug]', () => {
  const load = async () => import('../[slug]/page')
  const props = (slug = POST.slug) => ({ params: Promise.resolve({ slug }) })

  it('renders the title as the only H1, the body as markdown, the byline and the structured data', async () => {
    mockGetPost.mockResolvedValue(POST)
    const { default: Page } = await load()
    const html = renderToStaticMarkup(await Page(props()))
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain(POST.title)
    expect(html).toMatch(/<h2[^>]*>The trap<\/h2>/)
    expect(html).toContain('<strong')
    expect(html).toContain('Bryden Basil C. Elizan')
    expect(html).toContain('"@type":"Article"')
    expect(html).toContain('"@type":"FAQPage"')
  })

  it('never renders raw HTML from the Doc', async () => {
    mockGetPost.mockResolvedValue(POST)
    const { default: Page } = await load()
    const html = renderToStaticMarkup(await Page(props()))
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('neutralises javascript: links from the Doc', async () => {
    mockGetPost.mockResolvedValue({ ...POST, body_md: '[click](javascript:alert(1))' })
    const { default: Page } = await load()
    expect(renderToStaticMarkup(await Page(props()))).not.toContain('javascript:')
  })

  it('404s a missing or unpublished post', async () => {
    mockGetPost.mockResolvedValue(null)
    const { default: Page } = await load()
    await expect(Page(props('nope'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('uses the meta title and description, with a canonical URL', async () => {
    mockGetPost.mockResolvedValue(POST)
    const { generateMetadata } = await load()
    expect(await generateMetadata(props())).toMatchObject({
      title: 'Best UPCAT Reviewer Book — Iskotify', description: 'What each book is for.',
      alternates: { canonical: '/blog/best-upcat-reviewer-book' },
      openGraph: { type: 'article', title: 'Best UPCAT Reviewer Book' },
    })
  })
})

describe('/blog', () => {
  it('lists published posts with links', async () => {
    mockListPosts.mockResolvedValue([POST])
    const { default: Index } = await import('../page')
    const html = renderToStaticMarkup(await Index())
    expect(html).toContain('href="/blog/best-upcat-reviewer-book"')
    expect(html).toContain('What each book is for.')
  })

  it('renders the empty state instead of failing when the posts cannot be read', async () => {
    mockListPosts.mockRejectedValue(new Error('db down'))
    const { default: Index } = await import('../page')
    expect(renderToStaticMarkup(await Index())).toMatch(/No posts yet/i)
  })

  it('says so when nothing is published yet', async () => {
    mockListPosts.mockResolvedValue([])
    const { default: Index } = await import('../page')
    expect(renderToStaticMarkup(await Index())).toMatch(/No posts yet/i)
  })
})
