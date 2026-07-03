import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { WEB_APP_URL } from '../../lib/links'

export const metadata: Metadata = {
  title: 'Contact — Iskotify',
  description: 'Get in touch with the Iskotify team — questions, feedback, and bug reports welcome.',
}

const CONTACT_EMAIL = 'teamocsph@gmail.com'
const FB_GROUP_URL = 'https://www.facebook.com/share/g/193aUvEccE/'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg text-[#1d1d1f] mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-[#3a3a3c]">{children}</div>
    </section>
  )
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-[#1d1d1f] tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-[#1d1d1f] tracking-tight mb-1">Contact</h1>
        <p className="text-sm text-[#6e6e73] mb-10">
          We&rsquo;d love to hear from you — whether it&rsquo;s a question, feedback, or a bug report.
        </p>

        <Section title="Email">
          Reach us anytime at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#800000] underline">{CONTACT_EMAIL}</a>.
          We read every message and try to reply within a couple of days.
        </Section>

        <Section title="Beta Community">
          <p className="mb-4">
            Iskotify is in early access, and the best way to shape it is to join fellow students in our
            private Facebook community. Share feedback, report bugs, ask questions, and connect with
            other iskolars preparing for their exams and scholarships. It&rsquo;s a private group for
            beta users — we&rsquo;d be thrilled to have you.
          </p>
          <a
            href={FB_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join the private Iskotify beta community on Facebook"
            className="inline-flex items-center justify-center gap-2 bg-[#800000] text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-[#9a0000] transition-colors shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
            </svg>
            Join the Community
          </a>
        </Section>

        <Section title="App Links">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Open the{' '}
              <a
                href={WEB_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#800000] underline"
              >
                Iskotify web app
              </a>{' '}
              in your browser.
            </li>
            <li>
              Request the Android app on our{' '}
              <Link href="/#early-access" className="text-[#800000] underline">early-access form</Link>.
            </li>
          </ul>
        </Section>

        <div className="pt-6 border-t border-black/[0.08] text-sm text-[#6e6e73] flex gap-4">
          <Link href="/privacy" className="text-[#800000] underline">Privacy Policy</Link>
          <Link href="/terms" className="text-[#800000] underline">Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}
