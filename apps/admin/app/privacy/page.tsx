import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Iskotify',
  description: 'How Iskotify collects, uses, and protects your data, including optional Google Calendar sync.',
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={32} height={32} />
          <span className="font-heading font-extrabold text-xl text-[#1d1d1f] tracking-tight">Iskotify</span>
        </Link>

        <h1 className="font-heading font-extrabold text-3xl text-[#1d1d1f] tracking-tight mb-1">Privacy Policy</h1>
        <p className="text-sm text-[#6e6e73] mb-10">Last updated: {UPDATED}</p>

        <Section title="Who We Are">
          Iskotify helps Filipino students find scholarships, track exam deadlines, and prepare for
          qualifying exams. This policy explains what data we collect, how we use it, and the choices
          you have.
        </Section>

        <Section title="What We Collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account info:</strong> your name and email when you sign in with Google.</li>
            <li><strong>Profile:</strong> your school and grade level, which you provide during onboarding.</li>
            <li><strong>Study data:</strong> your focus list, practice progress, quiz scores, saved decks, and notes/reminders.</li>
          </ul>
        </Section>

        <Section title="How We Use It">
          Your data personalizes your study experience, syncs progress across devices, and improves
          our flashcard recommendations. We do not sell your data or share it with advertisers.
        </Section>

        <Section title="Google Calendar Access (Optional)">
          Iskotify offers an optional feature to sync your study reminders with your Google Calendar.
          This feature is off by default and only activates when you tap “Connect Google Calendar” in
          the app’s Settings.
          <br /><br />
          <strong>What we access:</strong> when you connect, we request the{' '}
          <code className="bg-white px-1.5 py-0.5 rounded text-[13px] border border-black/[0.06]">calendar.events</code>{' '}
          scope, which lets the app create, update, and delete calendar events.
          <br /><br />
          <strong>What we do with it:</strong> we create a Google Calendar event for each reminder you
          set in Iskotify, and we update or delete that event when you change or remove the reminder.
          We only ever touch events that Iskotify itself created. We do not read, modify, or store
          your existing personal calendar events.
          <br /><br />
          <strong>Token handling:</strong> to keep the connection working, we securely store a Google
          refresh token on our server (Supabase, protected by row-level security so only your account
          can access it). We never store this token on your device. You can revoke access anytime by
          tapping “Disconnect” in Settings, or from your{' '}
          <a href="https://myaccount.google.com/permissions" className="text-[#800000] underline">Google Account permissions</a>.
        </Section>

        <Section title="Limited Use Disclosure">
          Iskotify’s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-[#800000] underline">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements. Google Calendar data is used solely to provide
          the user-facing reminder-sync feature described above. It is never used for advertising,
          never sold to third parties, never used to train generalized AI or ML models, and never
          accessed by humans except with your explicit consent or as required for security or law.
        </Section>

        <Section title="Data Storage">
          Your data is stored securely via Supabase. Study progress is also cached locally on your
          device for offline access. Google Calendar refresh tokens are stored server-side under
          row-level security and are deleted when you disconnect.
        </Section>

        <Section title="Your Choices">
          <ul className="list-disc pl-5 space-y-1">
            <li>Disconnect Google Calendar anytime in Settings — this deletes the stored token.</li>
            <li>Request deletion of your account and data by emailing us.</li>
            <li>Revoke Google access from your Google Account permissions page.</li>
          </ul>
        </Section>

        <Section title="Contact">
          Questions about this policy? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#800000] underline">{CONTACT_EMAIL}</a>.
        </Section>

        <div className="pt-6 border-t border-black/[0.08] text-sm text-[#6e6e73]">
          <Link href="/terms" className="text-[#800000] underline">Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}
