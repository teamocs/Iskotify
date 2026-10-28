import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseBlogDoc } from '../parseDoc'

// A trimmed copy of a real post, exactly as Drive exports a Google Doc to text/markdown.
// LF-normalised: a Windows checkout turns the fixture CRLF, which the string edits below assume away.
const doc = fs.readFileSync(path.join(__dirname, 'fixtures', 'post.md'), 'utf8').replace(/\r\n/g, '\n')

describe('parseBlogDoc', () => {
  const r = parseBlogDoc(doc)
  if (!r.ok) throw new Error(r.message)
  const { post, flags } = r

  it('reads the front-matter fields, unescaping the export', () => {
    expect(post.title).toBe('Which UPCAT Review Books Are Actually Worth Buying?')
    expect(post.metaTitle).toBe("Best UPCAT Reviewer Book: What's Actually Worth It")
    expect(post.metaDescription).toBe('Maroon Bluebook, UPCAT Champion, MSA — ano ang gamit ng bawat isa, and why a harder book can work against you.')
  })

  it('takes the slug without its /blog/ prefix', () => {
    expect(post.slug).toBe('best-upcat-reviewer-book')
  })

  it('keeps the body from the first H2, without the duplicate H1 or the author block', () => {
    expect(post.bodyMd.startsWith('Three titles come up again and again')).toBe(true)
    expect(post.bodyMd).toContain('## The trap: harder is not better')
    expect(post.bodyMd).toContain('## FAQ')
    expect(post.bodyMd).not.toMatch(/^# /m)
    expect(post.bodyMd).not.toContain('By Bryden')
    expect(post.bodyMd).not.toContain('sources:')
  })

  it('pulls the FAQ pairs for FAQPage structured data', () => {
    expect(post.faq).toEqual([
      { q: 'Alin ang pinakamagandang UPCAT reviewer book?', a: 'There is no single best one. Maroon Bluebook is the most recommended.' },
      { q: 'Sapat na ba ang isang book?', a: 'It has been enough for documented passers.' },
    ])
  })

  it('reads the author byline and bio', () => {
    expect(post.authorName).toBe('Bryden Basil C. Elizan')
    expect(post.authorBio).toBe('Bryden Basil C. Elizan is the founder of Online Creative Solutions (OCS). He studied at UP Diliman.')
  })

  it('flags pricing claims that need owner sign-off before publishing', () => {
    expect(flags).toEqual(expect.arrayContaining([
      expect.stringMatching(/free while in Early Access/i),
      expect.stringMatching(/no subscription/i),
    ]))
  })

  it('rejects a Doc without a valid slug', () => {
    const bad = parseBlogDoc(doc.replace('slug: /blog/best-upcat-reviewer-book', 'slug: /blog/Best Book!'))
    expect(bad).toEqual({ ok: false, message: expect.stringMatching(/slug/i) })
  })

  it('keeps multi-paragraph FAQ answers whole, and a bold lead-in is not a new question', () => {
    const faqDoc = doc.replace(
      '**Sapat na ba ang isang book?** It has been enough for documented passers.',
      '**Sapat na ba ang isang book?** It has been enough for documented passers.\n\nPlus free sessions.\n\n**Note:** check the edition.',
    )
    const r2 = parseBlogDoc(faqDoc)
    if (!r2.ok) throw new Error(r2.message)
    expect(r2.post.faq).toHaveLength(2)
    expect(r2.post.faq[1]).toEqual({ q: 'Sapat na ba ang isang book?', a: 'It has been enough for documented passers. Plus free sessions. Note: check the edition.' })
  })

  it('keeps a horizontal rule inside the body when no author block follows it', () => {
    const ruled = doc
      .replace('## Where Iskotify fits', '---\n\n## Where Iskotify fits')
      .replace(/\n---\n\nBy Bryden[\s\S]*$/, '\n')
    const r3 = parseBlogDoc(ruled)
    if (!r3.ok) throw new Error(r3.message)
    expect(r3.post.bodyMd).toContain('## Where Iskotify fits')
    expect(r3.post.bodyMd).toContain('## FAQ')
    expect(r3.post.authorName).toBeNull()
  })

  it('rejects a slug longer than 120 characters', () => {
    const long = parseBlogDoc(doc.replace('best-upcat-reviewer-book', 'a'.repeat(121)))
    expect(long).toEqual({ ok: false, message: expect.stringMatching(/slug/i) })
  })

  it('rejects a Doc with no front matter', () => {
    expect(parseBlogDoc('# Just a title\n\nSome text.')).toEqual({ ok: false, message: expect.stringMatching(/front matter|title/i) })
  })
})
