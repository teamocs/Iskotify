import type { BlogPost } from './posts'

const SITE = 'https://iskotify.ph'

/** schema.org Article for a published post (author as a Person, Iskotify as publisher). */
export function articleJsonLd(p: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    ...(p.meta_description ? { description: p.meta_description } : {}),
    ...(p.author_name ? { author: { '@type': 'Person', name: p.author_name } } : {}),
    publisher: { '@type': 'Organization', name: 'Iskotify', logo: { '@type': 'ImageObject', url: `${SITE}/logo.svg` } },
    datePublished: p.first_published_at,
    dateModified: p.updated_at,
    mainEntityOfPage: `${SITE}/blog/${p.slug}`,
  }
}

/** schema.org FAQPage from the post's FAQ section, or null when it has none. */
export function faqJsonLd(p: BlogPost) {
  if (!p.faq?.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
}

/** For a <script type="application/ld+json">: escapes "<" so content can't close the tag. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')
