// Iskotify terms of service: the ONE source of truth for their text.
//
// Rendered by the in-app page (apps/mobile/app/terms.tsx) and the public web
// page (apps/admin/app/terms/page.tsx). Plain data, no React and no imports, so
// both apps can load it through the "@iskotify/utils/terms-of-service" subpath
// without pulling in the rest of the package (the Supabase clients).
//
// Same voice as privacyPolicy.ts: plain, short, second person. Every feature
// named here exists in the app on the date below; never describe one that
// doesn't. The Estimated Admission Score wording follows the estimator's
// compliance guard (apps/mobile/app/estimator/__tests__/compliance.test.tsx).
// packages/utils/src/__tests__/termsOfService.test.ts guards the structure and
// the claims that must (or must never) appear.

export const TERMS_LAST_UPDATED = 'September 26, 2026'
export const TERMS_CONTACT_EMAIL = 'teamocsph@gmail.com'
export const TERMS_OPERATOR = 'Online Creative Solutions'

/** The words each renderer turns into a link to the privacy policy. */
export const TERMS_PRIVACY_LINK = { text: 'Privacy Policy', href: '/privacy' } as const

/** One bullet in a list. `label` is shown in bold before the text. */
export interface TermsListItem {
  label?: string
  text: string
}

/** A paragraph (string) or a bulleted list. */
export type TermsBlock = string | { items: TermsListItem[] }

export interface TermsSection {
  title: string
  blocks: TermsBlock[]
}

/** "The short version": a few lines above the full terms. */
export const TERMS_SUMMARY: string[] = [
  `Iskotify is a free study app run by ${TERMS_OPERATOR}. These terms are the rules for using it.`,
  'Use Iskotify for your own studying. Don’t cheat, scrape our content or harass anyone.',
  'Exam, school and scholarship details can change. Always check the official website before you act.',
  'The Estimated Admission Score is only an estimate. It is not an admission decision.',
  `Your notes are yours. You can ask us to delete your account at any time by emailing ${TERMS_CONTACT_EMAIL}.`,
]

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'Who we are',
    blocks: [
      `Iskotify is run by ${TERMS_OPERATOR}. In these terms, “we” and “us” means ${TERMS_OPERATOR}, and “you” means anyone who uses Iskotify.`,
      'These terms cover the Iskotify app, on your phone or on the web, and the Iskotify website. By creating an account or using Iskotify, you agree to them. If you don’t agree, please don’t use Iskotify.',
    ],
  },
  {
    title: 'What Iskotify is',
    blocks: [
      'Iskotify is a free study app for Filipino students getting ready for college entrance exams and scholarships. It includes:',
      {
        items: [
          { label: 'Practice questions and mock exams,', text: 'with explanations, plus flashcards and a study plan.' },
          { label: 'The Estimated Admission Score,', text: 'a rough estimate of where you stand, based on historical cutoffs.' },
          { label: 'Listings', text: 'of scholarships, schools, entrance exams and their deadlines.' },
          { label: 'Notes', text: 'and note reminders.' },
        ],
      },
      'Iskotify helps you prepare, but it can’t promise any exam result, admission or scholarship.',
    ],
  },
  {
    title: 'Iskotify is free',
    blocks: [
      'Iskotify is free to use. There are no payments or in-app purchases today, and there are no ads.',
      'If we ever add paid features, we’ll tell you first and update these terms before anyone is asked to pay.',
    ],
  },
  {
    title: 'Your account',
    blocks: [
      'You can sign up with your email address and a password, or with your Google account.',
      `Keep your password safe and don’t share your account. You’re responsible for what happens in it, so email us at ${TERMS_CONTACT_EMAIL} right away if you think someone else is using it.`,
      'Please give accurate details when you set up the app, so it can plan your studying properly.',
    ],
  },
  {
    title: 'Students under 18',
    blocks: [
      'Many Iskotify users are in senior high school, and some are under 18. If you’re under 18, please use Iskotify with a parent or guardian’s awareness, and read these terms and our Privacy Policy with them.',
      'Iskotify isn’t meant for young children.',
    ],
  },
  {
    title: 'Exam, school and scholarship details',
    blocks: [
      'Exam dates, school details, scholarship requirements and deadlines in Iskotify come from public sources and research by our staff. They can change, and they can contain mistakes.',
      'Always confirm the details on the official website of the school, exam or scholarship before you apply, pay a fee or make a decision. If you spot something wrong, you can suggest a correction in the app.',
      'Iskotify isn’t affiliated with or endorsed by the University of the Philippines, DOST or any other school, agency or scholarship provider, unless we clearly say so.',
    ],
  },
  {
    title: 'The Estimated Admission Score',
    blocks: [
      'The Estimated Admission Score is an estimate based on historical cutoffs and on the grades and practice results you give the app. It is worked out on your device.',
      'It is not an official score and it is not an admission decision. Only the school decides who gets in, and cutoffs change from year to year. Use the score as a guide for your studying, not as a prediction to rely on.',
    ],
  },
  {
    title: 'The on-device AI model',
    blocks: [
      'In Settings, you can download an optional AI model. It runs on your device, without internet, and writes extra answer choices for practice questions that don’t have enough. Your questions and answers stay on your device.',
      'Like any AI, it can be wrong, for example by writing an answer choice that is also correct. If something looks wrong, report the question.',
    ],
  },
  {
    title: 'Using Iskotify fairly',
    blocks: [
      'Please use Iskotify for your own studying. Don’t:',
      {
        items: [
          { text: 'Use Iskotify to cheat, for example during a real exam, or build or use tools that help anyone cheat.' },
          { text: 'Copy, scrape or download our questions, explanations or listings in bulk, by hand or with bots and other automated tools.' },
          { text: 'Try to break, overload or get around the security of Iskotify, or get into anyone else’s account or data.' },
          { text: 'Harass, bully, threaten or abuse anyone, including our team, for example in reports or feedback.' },
          { text: 'Put other people’s personal information, like their names, photos, contact details or grades, in bug reports, screenshots, feedback or suggestions.' },
          { text: 'Use Iskotify to break the law or someone else’s rights.' },
        ],
      },
    ],
  },
  {
    title: 'Your content',
    blocks: [
      'Your notes are yours. We keep them only to run the app and to back them up to your account, as our Privacy Policy explains.',
      'When you send us bug reports, feedback, question reports or date suggestions, you let us use them to fix and improve Iskotify, for example to correct a question or a deadline. Please only send things you have the right to share.',
    ],
  },
  {
    title: 'Our content',
    blocks: [
      'The questions, explanations, flashcards and other study materials in Iskotify, and the Iskotify name and logo, belong to us or to the people who let us use them.',
      'You can use them for your own personal study. Please don’t copy, republish, sell or share them outside Iskotify without our written permission.',
      `Exam names, like UPCAT, belong to the schools and organisations that run those exams. We respect their rights. If you believe something in Iskotify uses your work without permission, email ${TERMS_CONTACT_EMAIL} and we’ll look into it.`,
    ],
  },
  {
    title: 'Availability and our responsibility',
    blocks: [
      'We work hard to keep Iskotify running and accurate, but we provide it “as is” and “as available”. It may sometimes be down or slow, or have mistakes, and we may change or remove features.',
      'Your study data is saved on your device and backed up when you’re signed in. You can also download a copy in Profile, then Your data, then Export Data.',
      'As far as Philippine law allows, we aren’t responsible for losses that come from relying on Iskotify without checking official sources, like a missed deadline, or from things outside our control, like your internet connection or another service being down.',
      'Nothing in these terms takes away rights you have under Philippine law that can’t be waived, including your rights as a consumer and under the Data Privacy Act of 2012.',
    ],
  },
  {
    title: 'Ending your account',
    blocks: [
      `You can stop using Iskotify at any time. There isn’t a delete-account button yet, so to delete your account and your backup, email ${TERMS_CONTACT_EMAIL} from the email address on your account.`,
      'We may suspend or close an account that breaks these terms, for example one used to scrape content or harass others. When we can, we’ll tell you why first and give you a chance to respond.',
    ],
  },
  {
    title: 'Your privacy',
    blocks: [
      'Our Privacy Policy explains what we collect, why, who we share it with, and your rights under the Data Privacy Act of 2012. Please read it together with these terms.',
    ],
  },
  {
    title: 'Changes to these terms',
    blocks: [
      'We may update these terms as Iskotify changes. We’ll post the new version here and in the app, with a new date at the top. If a change is big, we’ll point it out in the app.',
      'If you don’t agree with the new terms, you can stop using Iskotify and ask us to delete your account.',
    ],
  },
  {
    title: 'Governing law',
    blocks: [
      'These terms are governed by the laws of the Philippines. If one part of them can’t be enforced, the rest still applies.',
    ],
  },
  {
    title: 'Contact us',
    blocks: [
      'Questions about these terms? Email us.',
      TERMS_CONTACT_EMAIL,
    ],
  },
]

/** Every word of the terms as one string (for tests and search). */
export function termsOfServiceText(): string {
  const blockText = (b: TermsBlock) =>
    typeof b === 'string' ? b : b.items.map(i => (i.label ? `${i.label} ${i.text}` : i.text)).join('\n')
  return [
    ...TERMS_SUMMARY,
    ...TERMS_SECTIONS.flatMap(s => [s.title, ...s.blocks.map(blockText)]),
  ].join('\n')
}
