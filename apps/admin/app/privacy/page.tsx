import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  NPC_WEBSITE,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
  type PrivacyBlock,
} from '@iskotify/utils/privacy-policy'

// The policy text lives in packages/utils/src/privacyPolicy.ts, shared with the
// in-app page (apps/mobile/app/privacy.tsx), so the two always match. This page
// only lays it out.

export const metadata: Metadata = {
  title: 'Privacy Policy — Iskotify',
  description: 'What Iskotify collects, why, who it’s shared with, and your rights under the Data Privacy Act of 2012.',
}

const LINK_CLASS = 'text-maroon underline'

/** Turns the contact address and the NPC website into links; everything else stays text. */
function Linked({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${PRIVACY_CONTACT_EMAIL.replace(/\./g, '\\.')}|${NPC_WEBSITE.replace(/\./g, '\\.')})`))
  return (
    <>
      {parts.map((part, i) => {
        if (part === PRIVACY_CONTACT_EMAIL) {
          return <a key={i} href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className={LINK_CLASS}>{part}</a>
        }
        if (part === NPC_WEBSITE) {
          return <a key={i} href={`https://${NPC_WEBSITE}`} className={LINK_CLASS} rel="noopener noreferrer" target="_blank">{part}</a>
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

function Block({ block }: { block: PrivacyBlock }) {
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-2">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-ink tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-ink tracking-tight mb-1">Privacy Policy</h1>
        <p className="text-sm text-ink-muted mb-10">Last updated: {PRIVACY_LAST_UPDATED}</p>

        <Section title="The short version">
          <Bullets items={PRIVACY_SUMMARY.map(text => ({ text }))} />
        </Section>

        {PRIVACY_SECTIONS.map(sec => (
          <Section key={sec.title} title={sec.title}>
            {sec.blocks.map((block, i) => <Block key={i} block={block} />)}
          </Section>
        ))}

        <div className="pt-6 border-t border-black/[0.08] text-sm text-ink-muted">
          <Link href="/terms" className={LINK_CLASS}>Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}
