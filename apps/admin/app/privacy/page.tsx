import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Iskotify',
  description: 'How Iskotify collects, uses, and protects your data.',
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

        <Section title="Data Storage">
          Your data is stored securely via Supabase. Study progress is also cached locally on your
          device for offline access. Reminders and deadlines are scheduled as local device
          notifications and are never sent to any third-party calendar service.
        </Section>

        <Section title="Your Choices">
          <ul className="list-disc pl-5 space-y-1">
            <li>Turn reminder notifications on or off anytime in Settings.</li>
            <li>Request deletion of your account and data by emailing us.</li>
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
