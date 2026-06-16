import Image from 'next/image'

function ScholarshipCard() {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="bg-gradient-to-br from-[#800000] to-[#5a0000] rounded-[20px] p-5 shadow-xl text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-body uppercase tracking-widest text-red-200">CHED Scholarship</span>
          <span className="bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-body text-red-100">Open</span>
        </div>
        <h4 className="font-heading font-bold text-base leading-snug mb-1">
          Tulong Dunong Program
        </h4>
        <p className="text-red-200 text-xs font-body mb-4">Deadline: Jun 30, 2026</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-[10px] p-2">
            <p className="text-red-200 text-[9px] font-body">Coverage</p>
            <p className="text-white text-xs font-heading font-semibold">Full Tuition</p>
          </div>
          <div className="bg-white/10 rounded-[10px] p-2">
            <p className="text-red-200 text-[9px] font-body">Stipend</p>
            <p className="text-white text-xs font-heading font-semibold">₱7,000/sem</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full">
            <div className="h-1.5 bg-white/60 rounded-full w-3/4" />
          </div>
          <span className="text-[9px] text-red-200 font-body">75 days left</span>
        </div>
      </div>
    </div>
  )
}

function QuizCard() {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="bg-white rounded-[20px] p-5 shadow-xl border border-[#f0f0f0]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-body uppercase tracking-widest text-[#6e6e73]">UPCAT · Math</span>
          <span className="bg-[#800000]/10 text-[#800000] rounded-full px-2 py-0.5 text-[10px] font-body font-medium">Q 14 / 50</span>
        </div>
        <p className="font-heading font-semibold text-[#1d1d1f] text-sm leading-snug mb-4">
          What is the value of x in: 3x + 9 = 21?
        </p>
        <div className="flex flex-col gap-2">
          {['x = 3', 'x = 4', 'x = 6', 'x = 7'].map((opt, i) => (
            <div
              key={opt}
              className={[
                'rounded-[10px] px-3 py-2 text-xs font-body border flex items-center gap-2',
                i === 1
                  ? 'bg-[#800000] border-[#800000] text-white font-medium'
                  : 'bg-[#f5f5f7] border-[#f0f0f0] text-[#6e6e73]',
              ].join(' ')}
            >
              <span
                className={[
                  'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-heading font-bold flex-shrink-0',
                  i === 1 ? 'bg-white/20 text-white' : 'bg-white text-[#6e6e73]',
                ].join(' ')}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KuyaBawChat() {
  return (
    <div className="w-full max-w-xs mx-auto flex flex-col gap-3">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="bg-[#800000] text-white rounded-[16px] rounded-tr-[4px] px-4 py-2.5 max-w-[80%]">
          <p className="text-xs font-body leading-snug">Paano ko malalaman ang Pythagorean theorem?</p>
        </div>
      </div>
      {/* Kuya Baw bubble */}
      <div className="flex items-end gap-2">
        <div className="flex-shrink-0">
          <Image
            src="/kuya-baw-avatar.png"
            alt="Kuya Baw"
            width={36}
            height={36}
            className="rounded-full bg-[#800000]/10 p-1"
          />
        </div>
        <div className="bg-white border border-[#f0f0f0] rounded-[16px] rounded-bl-[4px] px-4 py-2.5 shadow-sm max-w-[80%]">
          <p className="text-[#1d1d1f] text-xs font-body leading-snug">
            Sa right triangle, ang <strong>a² + b² = c²</strong>. Ang c ay ang hypotenuse — ang pinakamahabang gilid. 📐
          </p>
        </div>
      </div>
      {/* Another user bubble */}
      <div className="flex justify-end">
        <div className="bg-[#800000] text-white rounded-[16px] rounded-tr-[4px] px-4 py-2.5 max-w-[80%]">
          <p className="text-xs font-body leading-snug">Give me a sample problem!</p>
        </div>
      </div>
    </div>
  )
}

type BenefitCardProps = {
  icon: React.ReactNode
  title: string
  copy: string
}

function BenefitCard({ icon, title, copy }: BenefitCardProps) {
  return (
    <div className="bg-white border border-black/[0.06] rounded-[20px] p-6 transition hover:shadow-md hover:-translate-y-0.5">
      <div className="w-11 h-11 rounded-[12px] bg-[#800000]/[0.08] flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="font-heading font-bold text-[#1d1d1f] text-base leading-snug mb-2">{title}</h4>
      <p className="text-[#6e6e73] font-body text-sm leading-relaxed">{copy}</p>
    </div>
  )
}

type FeatureBlockProps = {
  imageRight: boolean
  eyebrow: string
  title: string
  copy: string
  visual: React.ReactNode
}

function FeatureBlock({ imageRight, eyebrow, title, copy, visual }: FeatureBlockProps) {
  const textBlock = (
    <div className="flex-1">
      <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">{eyebrow}</p>
      <h3 className="font-heading font-bold text-[#1d1d1f] text-2xl md:text-3xl leading-tight mb-4">{title}</h3>
      <p className="text-[#6e6e73] font-body text-base leading-relaxed max-w-md">{copy}</p>
    </div>
  )

  const visualBlock = (
    <div className="flex-1 flex justify-center items-center py-6">{visual}</div>
  )

  return (
    <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
      {imageRight ? (
        <>
          {textBlock}
          {visualBlock}
        </>
      ) : (
        <>
          {visualBlock}
          {textBlock}
        </>
      )}
    </div>
  )
}

export function Features() {
  return (
    <section id="features" className="bg-white py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">Features</p>
          <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
            Everything You Need, in One App
          </h2>
          <p className="text-[#6e6e73] font-body text-base md:text-lg leading-relaxed max-w-2xl mx-auto mt-4">
            From choosing an AI-proof course to landing the scholarship that pays for it — Iskotify guides every step with real data, not guesswork.
          </p>
        </div>

        <div className="flex flex-col gap-20">
          <FeatureBlock
            imageRight
            eyebrow="Scholarships"
            title="Scholarships matched to your course, school & province"
            copy="Filter CHED, DOST, and private grants by the course, university, or province you want — and instantly see which ones you actually qualify for, with deadlines you'll never miss."
            visual={<ScholarshipCard />}
          />

          <FeatureBlock
            imageRight={false}
            eyebrow="Top Universities & Exam Prep"
            title="Top universities and exam prep, backed by real board-exam data"
            copy="Compare universities by historical PRC board-exam passing rates and accreditation — then prep for UPCAT, ACET, and more with AI flashcards and full mock exams."
            visual={<QuizCard />}
          />

          <FeatureBlock
            imageRight
            eyebrow="AI Companion"
            title="Your AI study companion — Kuya Baw"
            copy="Ask Kuya Baw anything about your exam topics. Get explanations, mnemonics, and study tips in Taglish, tailored to the exam you're targeting."
            visual={<KuyaBawChat />}
          />
        </div>

        <div className="mt-24">
          <div className="text-center mb-12">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">Why Iskotify</p>
            <h3 className="font-heading font-bold text-[#1d1d1f] text-2xl md:text-3xl leading-tight">
              Decide your future with evidence
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <BenefitCard
              title="Search courses & see AI's impact"
              copy="Search any college course and understand how AI is reshaping that field — which skills stay in demand and where the career is heading."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <path d="M11 8l.9 1.9L13.8 11l-1.9.9L11 13.8l-.9-1.9L8.2 11l1.9-.9L11 8z" />
                </svg>
              }
            />
            <BenefitCard
              title="Career destination countries"
              copy="See which countries are hiring for each course — 20+ overseas destinations ranked by real demand for your future profession."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
                </svg>
              }
            />
            <BenefitCard
              title="Top universities by evidence"
              copy="Compare universities using historical PRC board-exam passing rates and accreditation — not hearsay."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="6" />
                  <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
                </svg>
              }
            />
            <BenefitCard
              title="Scholarships matched to you"
              copy="Filter scholarships by course, university, or province, and see which grants you actually qualify for."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
              }
            />
            <BenefitCard
              title="Application news & updates"
              copy="Stay on top of the latest entrance-exam schedules, deadlines, and university admission announcements."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              }
            />
            <BenefitCard
              title="Exam prep with Kuya Baw"
              copy="AI flashcards and mock exams for UPCAT, ACET, and more — plus Kuya Baw, your AI study buddy, on call 24/7."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M9.5 12.5l1.5 1.5 3.5-3.5" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </section>
  )
}
