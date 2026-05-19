import Image from 'next/image'

export function KuyaBawCTA() {
  return (
    <section id="download" className="bg-gradient-to-br from-[#fff5f5] to-[#fef2f2] border-t border-red-200 px-6 py-8">
      <div className="max-w-3xl mx-auto flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <Image
            src="/kuya-baw-mascot.svg"
            alt="Kuya Baw"
            width={80}
            height={80}
            className="drop-shadow-lg"

          />
        </div>
        <div>
          <h3 className="font-heading font-bold text-[#800000] text-lg mb-1">
            Meet Kuya Baw — Your AI Study Companion
          </h3>
          <p className="text-sm text-[#6e6e73] mb-3 max-w-md">
            Kuya Baw helps you prep for qualifying exams with flashcards, practice sessions, and personalized tips. Available in the Iskotify mobile app.
          </p>
          <a
            href="#"
            className="inline-block bg-[#800000] text-white rounded-xl px-5 py-2 text-sm font-medium hover:bg-[#a00000] transition-colors"
          >
            Download Now →
          </a>
        </div>
      </div>
    </section>
  )
}
