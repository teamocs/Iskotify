import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '@/lib/blog/posts'

// The public pages of iskotify.ph, then every published blog post. Add a page here when it ships.
const PAGES = ['/', '/listings', '/blog', '/contact', '/privacy', '/terms', '/delete-account']

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = PAGES.map(path => ({ url: `https://iskotify.ph${path}` }))
  try {
    const posts = await listPublishedPosts()
    return [...pages, ...posts.map(p => ({ url: `https://iskotify.ph/blog/${p.slug}`, lastModified: p.updated_at }))]
  } catch (err) {
    console.error('[sitemap] blog posts unavailable:', err)
    return pages
  }
}
