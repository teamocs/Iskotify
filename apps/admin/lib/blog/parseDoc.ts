// Reads one blog post from a Google Doc exported as text/markdown (Drive
// files.export). The Doc is written by the OCS content workflow:
//
//   ---
//   post\_number: 25 … title: … meta\_title: … meta\_description: … slug: /blog/… … sources:
//   - "…"
//   ---
//   # Title
//   body with ## sections, ending in ## FAQ (**Question?** Answer paragraphs)
//   ---
//   By Name, Role
//   *bio*
//   *Last updated: …*
//
// The export flattens the front matter onto one line and escapes markdown
// punctuation (\_ \[ \]), so fields are split on their known names.

export interface BlogFaq { q: string; a: string }

export interface BlogPostDraft {
  title: string
  metaTitle: string | null
  metaDescription: string | null
  slug: string
  bodyMd: string
  faq: BlogFaq[]
  authorName: string | null
  authorBio: string | null
}

export type ParseResult =
  | { ok: true; post: BlogPostDraft; flags: string[] }
  | { ok: false; message: string }

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Every front-matter key the workflow writes; values run until the next key.
const KEYS = [
  'post_number', 'version', 'title', 'meta_title', 'meta_description', 'slug', 'target_keyword',
  'secondary_keywords', 'search_intent', 'primary_persona', 'secondary_persona', 'persona_triggers_used',
  'voice_card_applied', 'signature_phrases_used', 'language_bank_rows_used', 'cta', 'tier',
  'publish_window', 'word_count', 'internal_links', 'schema', 'flags', 'sources',
]
const KEY_RE = new RegExp(`(?:^|\\s)(${KEYS.join('|')}):(?=\\s|$)`, 'g')

// Claims the owner must sign off before a post goes live (the ₱500 Full Access plan exists).
const CLAIMS: { re: RegExp; label: string }[] = [
  { re: /free while in early access/i, label: 'Says Iskotify is “free while in Early Access” — check it against the ₱500 Full Access plan.' },
  { re: /no subscription/i, label: 'Says “no subscription” — check it against the ₱500 Full Access plan.' },
]

const unescape = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
const isFence = (line: string) => /^-{3,}$/.test(line.trim())
const plain = (s: string) => unescape(s).replace(/\*\*|\*/g, '').replace(/\s+/g, ' ').trim()

function frontMatter(text: string): Map<string, string> {
  const flat = unescape(text).replace(/\s+/g, ' ').trim()
  const fields = new Map<string, string>()
  const hits = [...flat.matchAll(KEY_RE)]
  hits.forEach((m, i) => {
    const start = m.index! + m[0].length
    const end = i + 1 < hits.length ? hits[i + 1]!.index! : flat.length
    fields.set(m[1]!, flat.slice(start, end).trim())
  })
  return fields
}

function faqOf(body: string): BlogFaq[] {
  const m = body.match(/^##\s+(?:FAQ|Frequently asked questions)\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im)
  if (!m) return []
  // A new item starts only at a bold question ("**…?**"); any other paragraph,
  // even one opening with bold ("**Note:** …"), continues the previous answer.
  const items: { q: string; a: string[] }[] = []
  for (const para of m[1]!.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)) {
    const q = para.match(/^\*\*([^*]+\?)\*\*\s*([\s\S]*)$/)
    if (q) items.push({ q: plain(q[1]!), a: q[2] ? [q[2]] : [] })
    else items.at(-1)?.a.push(para)
  }
  return items.filter(i => i.a.length).map(i => ({ q: i.q, a: plain(i.a.join(' ')) }))
}

function authorOf(tail: string[]): { name: string | null; bio: string | null } {
  const at = tail.findIndex(l => /^By\s+\S/.test(l.trim()))
  if (at === -1) return { name: null, bio: null }
  const name = plain(tail[at]!.trim().replace(/^By\s+/, '')).split(',')[0]!.trim() || null
  const bioLine = tail.slice(at + 1).find(l => l.trim() && !/last updated/i.test(l))
  return { name, bio: bioLine ? plain(bioLine) : null }
}

export function parseBlogDoc(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fences = lines.flatMap((l, i) => (isFence(l) ? [i] : []))
  if (fences.length < 2) return { ok: false, message: 'No front matter (--- … ---) with a title and slug at the top of the Doc.' }

  const fields = frontMatter(lines.slice(fences[0]! + 1, fences[1]).join('\n'))
  const title = fields.get('title')
  if (!title) return { ok: false, message: 'The front matter has no title.' }
  const rawSlug = fields.get('slug') ?? ''
  const slug = rawSlug.replace(/^\/?blog\//i, '').replace(/^\/+|\/+$/g, '')
  if (!SLUG_RE.test(slug) || slug.length > 120) {
    return { ok: false, message: `The slug “${rawSlug || '(missing)'}” must be lowercase letters, numbers and dashes, like /blog/upcat-study-plan.` }
  }

  // Body: after the front matter, up to the last fence — but only when a "By …"
  // byline follows it; otherwise that --- is a rule inside the post.
  const last = fences[fences.length - 1]!
  const hasAuthor = fences.length > 2 && lines.slice(last + 1).some(l => /^By\s+\S/.test(l.trim()))
  const bodyEnd = hasAuthor ? last : lines.length
  const bodyLines = lines.slice(fences[1]! + 1, bodyEnd)
  const h1 = bodyLines.findIndex(l => /^#\s/.test(l))
  if (h1 !== -1) bodyLines.splice(h1, 1)
  const bodyMd = bodyLines.join('\n').trim()
  if (!bodyMd) return { ok: false, message: 'The Doc has no body under its title.' }

  const author = hasAuthor ? authorOf(lines.slice(bodyEnd + 1)) : { name: null, bio: null }
  const flags = CLAIMS.filter(c => c.re.test(bodyMd)).map(c => c.label)

  return {
    ok: true,
    post: {
      title,
      metaTitle: fields.get('meta_title') || null,
      metaDescription: fields.get('meta_description') || null,
      slug,
      bodyMd,
      faq: faqOf(bodyMd),
      authorName: author.name,
      authorBio: author.bio,
    },
    flags,
  }
}
