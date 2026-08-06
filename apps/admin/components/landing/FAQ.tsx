'use client'

import { useState } from 'react'

type FAQItem = {
  question: string
  answer: string
}

const faqs: FAQItem[] = [
  {
    question: 'How much does Iskotify cost?',
    answer:
      'Iskotify is free to use during Early Access — no subscription and no hidden fees. Start now and get full access to scholarships and exam content while we build toward launch.',
  },
  {
    question: 'Which scholarships are listed?',
    answer:
      'We list CHED, DOST, GSIS, and hundreds of private scholarships. Updated weekly from official sources so you always have the latest information.',
  },
  {
    question: 'Which exams does it cover?',
    answer:
      'UPCAT, ACET, DCAT, USTET, AdMU ACET, and more. New exams are added regularly based on student demand.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. We use industry-standard encryption for all data in transit and at rest. We never sell your personal data to third parties.',
  },
  {
    question: 'How can I get Iskotify?',
    answer:
      'Iskotify is in Early Access on Android — start a free trial and install it directly. You can also use the full app in any browser with the web version. iOS support is on the way.',
  },
]

function AccordionItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[#f0f0f0] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
        aria-expanded={isOpen}
      >
        <span className="font-heading font-semibold text-[#1d1d1f] text-base group-hover:text-[#800000] transition-colors">
          {item.question}
        </span>
        <span
          className={[
            'flex-shrink-0 w-6 h-6 rounded-full border border-[#d2d2d7] flex items-center justify-center transition-transform duration-200',
            isOpen ? 'rotate-45 border-[#800000]' : '',
          ].join(' ')}
          aria-hidden="true"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke={isOpen ? '#800000' : '#6e6e73'} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      <div
        className={[
          'overflow-hidden transition-all duration-300 ease-in-out',
          isOpen ? 'max-h-48 opacity-100 pb-5' : 'max-h-0 opacity-0',
        ].join(' ')}
      >
        <p className="text-[#6e6e73] font-body text-sm leading-relaxed">{item.answer}</p>
      </div>
    </div>
  )
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className="bg-[#f5f5f7] py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">FAQ</p>
          <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="bg-white rounded-[24px] px-6 shadow-[0_8px_32px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              item={faq}
              isOpen={openIndex === index}
              onToggle={() => toggle(index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
