import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Iskotify',
  description: 'The terms governing your use of Iskotify.',
}

const UPDATED = 'May 31, 2026'
const CONTACT_EMAIL = 'teamocsph@gmail.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg text-[#1d1d1f] mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-[#3a3a3c]">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-[#1d1d1f] tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-[#1d1d1f] tracking-tight mb-1">Terms of Service</h1>
        <p className="text-sm text-[#6e6e73] mb-10">Last updated: {UPDATED}</p>

        <Section title="Acceptance">
          By creating an account or using Iskotify, you agree to these Terms. If you don’t agree,
          please don’t use the app.
        </Section>

        <Section title="What Iskotify Is">
          Iskotify is a study tool for Filipino students preparing for scholarships and qualifying
          exams. We provide listings, flashcards, practice quizzes, progress tracking, notes, and
          optional reminder syncing. Content is for educational purposes and we don’t guarantee any
          particular exam or scholarship outcome.
        </Section>

        <Section title="Your Account">
          You’re responsible for keeping your sign-in secure and for activity under your account.
          Provide accurate information during onboarding so the app can personalize your experience.
        </Section>

        <Section title="Acceptable Use">
          <ul className="list-disc pl-5 space-y-1">
            <li>Don’t misuse, reverse-engineer, or attempt to disrupt the service.</li>
            <li>Don’t use the app to violate any law or another person’s rights.</li>
            <li>Don’t scrape or redistribute our content without permission.</li>
          </ul>
        </Section>

        <Section title="Google Calendar Sync">
          The Google Calendar feature is optional and user-initiated. By connecting it, you authorize
          Iskotify to create, update, and delete calendar events that correspond to reminders you set
          in the app. You can disconnect at any time. Your use of Google services is also subject to{' '}
          <a href="https://policies.google.com/terms" className="text-[#800000] underline">Google’s Terms of Service</a>.
        </Section>

        <Section title="Payments">
          Iskotify may offer one-time or paid features. Any fees are shown before purchase. Except
          where required by law, payments are non-refundable.
        </Section>

        <Section title="Disclaimer & Liability">
          The service is provided “as is” without warranties of any kind. To the maximum extent
          permitted by law, Iskotify is not liable for indirect or consequential damages arising from
          your use of the app.
        </Section>

        <Section title="Changes">
          We may update these Terms as the app evolves. Continued use after changes means you accept
          the updated Terms.
        </Section>

        <Section title="Contact">
          Questions? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#800000] underline">{CONTACT_EMAIL}</a>.
        </Section>

        <div className="pt-6 border-t border-black/[0.08] text-sm text-[#6e6e73]">
          <Link href="/privacy" className="text-[#800000] underline">Privacy Policy</Link>
        </div>
      </main>
    </div>
  )
}
