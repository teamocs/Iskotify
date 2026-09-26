import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  TERMS_CONTACT_EMAIL,
  TERMS_LAST_UPDATED,
  TERMS_PRIVACY_LINK,
  TERMS_SECTIONS,
  TERMS_SUMMARY,
  type TermsBlock,
} from '@iskotify/utils/terms-of-service'

// The terms text lives in packages/utils/src/termsOfService.ts, shared with the
// in-app page (apps/mobile/app/terms.tsx), so the two always match. This page
// only lays it out, the same way app/privacy/page.tsx lays out the policy.

export const metadata: Metadata = {
  title: 'Terms of Service — Iskotify',
  description: 'The rules for using Iskotify, the free study app for Filipino students, in plain language.',
  alternates: { canonical: '/terms' },
}

const LINK_CLASS = 'text-maroon underline'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LINK_PATTERN = new RegExp(`(${escape(TERMS_CONTACT_EMAIL)}|${escape(TERMS_PRIVACY_LINK.text)})`)

/** Turns the contact address and "Privacy Policy" into links; everything else stays text. */
function Linked({ text }: { text: string }) {
  const parts = text.split(LINK_PATTERN)
  return (
    <>
      {parts.map((part, i) => {
        if (part === TERMS_CONTACT_EMAIL) {
          return <a key={i} href={`mailto:${TERMS_CONTACT_EMAIL}`} className={LINK_CLASS}>{part}</a>
        }
        if (part === TERMS_PRIVACY_LINK.text) {
          return <Link key={i} href={TERMS_PRIVACY_LINK.href} className={LINK_CLASS}>{part}</Link>
        }
        return part
      })}
    </>
  )
}

function Bullets({ items }: { items: { label?: string; text: string }[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map(item => (
        <li key={item.label ?? item.text}>
          {item.label ? <strong className="text-ink">{item.label}</strong> : null}
          {item.label ? ' ' : null}
          <Linked text={item.text} />
        </li>
      ))}
    </ul>
  )
}

function Block({ block }: { block: TermsBlock }) {
  return typeof block === 'string'
    ? <p><Linked text={block} /></p>
    : <Bullets items={block.items} />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg text-ink mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-ink-muted space-y-3">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-2">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-ink tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-ink tracking-tight mb-1">Terms of Service</h1>
        <p className="text-sm text-ink-muted mb-10">Last updated: {TERMS_LAST_UPDATED}</p>

        <Section title="The short version">
          <Bullets items={TERMS_SUMMARY.map(text => ({ text }))} />
        </Section>

        {TERMS_SECTIONS.map(sec => (
          <Section key={sec.title} title={sec.title}>
            {sec.blocks.map((block, i) => <Block key={i} block={block} />)}
          </Section>
        ))}

        <div className="pt-6 border-t border-black/[0.08] text-sm text-ink-muted">
          <Link href={TERMS_PRIVACY_LINK.href} className={LINK_CLASS}>{TERMS_PRIVACY_LINK.text}</Link>
        </div>
      </main>
    </div>
  )
}
