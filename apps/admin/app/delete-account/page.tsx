import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { PRIVACY_CONTACT_EMAIL } from '@iskotify/utils/privacy-policy'
import { WEB_APP_URL } from '../../lib/links'

// The public "delete your account" page Google Play asks for (Data safety →
// account deletion URL). No login needed: someone who has lost access to the app
// must still be able to find out how to delete their data. The steps and the
// list below must match the in-app flow (components/DeleteAccountSheet.tsx) and
// the route app/api/account/delete and migration 064 (delete_user_data); change them together.

export const metadata: Metadata = {
  title: 'Delete your account — Iskotify',
  description: 'How to delete your Iskotify account and the data linked to it, in the app or by email.',
  alternates: { canonical: '/delete-account' },
}

const LINK_CLASS = 'text-maroon underline'
const MAIL_SUBJECT = 'Delete my Iskotify account'
const MAILTO = `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT)}`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg text-ink mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-ink-muted space-y-3">{children}</div>
    </section>
  )
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-surface-2">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-ink tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-ink tracking-tight mb-1">Delete your Iskotify account</h1>
        <p className="text-sm text-ink-muted mb-10">
          Iskotify is made by Online Creative Solutions. This page explains how to delete your account and what happens to your data.
        </p>

        <Section title="Delete it in the app">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Sign in to Iskotify on your phone, or on the web at{' '}
              <a href={WEB_APP_URL} className={LINK_CLASS} rel="noopener noreferrer">{WEB_APP_URL.replace(/^https?:\/\//, '')}</a>.
            </li>
            <li>Open <strong className="text-ink">Profile</strong>, then <strong className="text-ink">Your data</strong>, then <strong className="text-ink">Delete account</strong>.</li>
            <li>Read what will be deleted, type DELETE, and confirm.</li>
          </ol>
          <p>It happens straight away and can’t be undone.</p>
        </Section>

        <Section title="Can’t open the app? Email us">
          <p>
            Email <a href={MAILTO} className={LINK_CLASS}>{PRIVACY_CONTACT_EMAIL}</a> with the
            subject <strong className="text-ink">{MAIL_SUBJECT}</strong>, from the email address on your account. We’ll
            confirm it’s you, delete your account and tell you when it’s done, within 7 days.
          </p>
        </Section>

        <Section title="What is deleted">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Your account and sign-in.</li>
            <li>Your cloud backup: profile, progress, settings, notes and saved items.</li>
            <li>Bug reports, feedback, question reports and date suggestions you sent us, including any screenshots.</li>
            <li>Your early-access sign-up, if you made one.</li>
          </ul>
          <p>
            Your study data and notes on your own device are not on our servers. The app clears your study data
            when you delete your account; any notes stay on that device until you delete them in Notes or uninstall the app.
          </p>
        </Section>

        <Section title="What we keep">
          <p>
            We keep nothing about you afterwards, except where the law requires us to. That is none today.
          </p>
          <p>
            One exception you should know about: usage analytics that we keep in PostHog aren’t removed by
            the Delete account button. Email us and we’ll delete what’s linked to you.
          </p>
        </Section>

        <div className="pt-6 border-t border-black/[0.08] text-sm text-ink-muted flex gap-4">
          <Link href="/privacy" className={LINK_CLASS}>Privacy Policy</Link>
          <Link href="/terms" className={LINK_CLASS}>Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}
