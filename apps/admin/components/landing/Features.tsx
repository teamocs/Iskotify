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
            src="/kuya-baw-mascot.svg"
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
            Everything You Need to Succeed
          </h2>
        </div>

        <div className="flex flex-col gap-20">
          <FeatureBlock
            imageRight
            eyebrow="Scholarships"
            title="Track Every Scholarship Deadline"
            copy="Never miss a scholarship application. Iskotify aggregates CHED, DOST, and private grants — filtered by your region and course."
            visual={<ScholarshipCard />}
          />

          <FeatureBlock
            imageRight={false}
            eyebrow="Exam Prep"
            title="Ace Your Qualifying Exams"
            copy="AI-curated flashcards for UPCAT, ACET, DCAT, and more. Study smarter with spaced repetition and instant score feedback."
            visual={<QuizCard />}
          />

          <FeatureBlock
            imageRight
            eyebrow="AI Companion"
            title="Your AI Study Companion — Kuya Baw"
            copy="Ask Kuya Baw anything about your exam topics. Get explanations, mnemonics, and study tips tailored to your focus listing."
            visual={<KuyaBawChat />}
          />
        </div>
      </div>
    </section>
  )
}
