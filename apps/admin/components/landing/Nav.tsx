import Image from 'next/image'
import Link from 'next/link'

const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-[56px] bg-white/80 backdrop-blur-[20px] saturate-[180%] border-b border-black/[0.08]">
      <Link href="/" className="flex items-center gap-2 flex-shrink-0">
        <Image src="/logo.svg" alt="Iskotify" width={28} height={28} className="rounded-[20%]" />
        <span className="font-heading font-extrabold text-[#800000] text-lg tracking-tight">Iskotify</span>
      </Link>

      <div className="hidden md:flex items-center gap-7">
        <a href="#features" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">Features</a>
        <a href="#how-it-works" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">How It Works</a>
        <a href="#testimonials" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">Testimonials</a>
        <a href="#faq" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">FAQ</a>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {webAppUrl && (
          <a
            href={webAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Try Iskotify on the web"
            className="hidden sm:inline-flex items-center border border-[#800000] text-[#800000] rounded-[980px] px-5 py-2 text-sm font-medium hover:bg-[#800000]/[0.06] transition-colors"
          >
            Try on Web
          </a>
        )}
        <a
          href="#download"
          className="bg-[#800000] text-white rounded-[980px] px-5 py-2 text-sm font-medium hover:bg-[#a00000] transition-colors"
        >
          Get the App
        </a>
      </div>
    </nav>
  )
}
