import { cache } from 'react'
import { createServerClient } from '@iskotify/utils'
import type { BlogFaq } from './parseDoc'

// Published blog posts for the public /blog pages. blog_posts is service-role
// only (migration 069), so these reads run on the server, never in the browser.

export interface BlogPost {
  id: string
  slug: string
  title: string
  meta_title: string | null
  meta_description: string | null
  body_md: string
  faq: BlogFaq[]
  author_name: string | null
  author_bio: string | null
  first_published_at: string
  updated_at: string
}

const COLUMNS = 'id, slug, title, meta_title, meta_description, body_md, faq, author_name, author_bio, first_published_at, updated_at'

// cache(): generateMetadata and the page read the same post once per request.
export const getPublishedPost = cache(async (slug: string): Promise<BlogPost | null> => {
  const { data, error } = await createServerClient()
    .from('blog_posts').select(COLUMNS).eq('slug', slug).eq('status', 'published').maybeSingle()
  if (error) throw new Error(`blog_posts read failed: ${error.message}`)
  return (data as BlogPost | null) ?? null
})

export async function listPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await createServerClient()
    .from('blog_posts').select(COLUMNS).eq('status', 'published').order('first_published_at', { ascending: false })
  if (error) throw new Error(`blog_posts read failed: ${error.message}`)
  return (data ?? []) as BlogPost[]
}
