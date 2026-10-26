import type { MetadataRoute } from 'next'

// The public pages of iskotify.ph. Add a page here when it ships.
const PAGES = ['/', '/listings', '/contact', '/privacy', '/terms', '/delete-account']

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(path => ({ url: `https://iskotify.ph${path}` }))
}
