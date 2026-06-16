import Image from 'next/image'
import { ANDROID_APP_URL, WEB_APP_URL } from '../../lib/links'

export function KuyaBawCTA() {
  return (
    <section className="bg-gradient-to-br from-[#fff5f5] to-[#fef2f2] border-t border-red-200 px-6 py-8">
      <div className="max-w-3xl mx-auto flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <Image
            src="/kuya-baw-waving.png"
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
            Kuya Baw helps you prep for qualifying exams with flashcards, practice sessions, and personalized tips. Free during Early Access.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={ANDROID_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Start your free Iskotify trial on Android"
              className="inline-block bg-[#800000] text-white rounded-xl px-5 py-2 text-sm font-medium hover:bg-[#a00000] transition-colors"
            >
              Start free trial →
            </a>
            <a
              href={WEB_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Iskotify web app"
              className="inline-block text-[#800000] text-sm font-medium hover:underline"
            >
              Try on the web
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
