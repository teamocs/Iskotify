import Image from 'next/image'
import Link from 'next/link'

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-[56px] bg-white/80 backdrop-blur-[20px] saturate-[180%] border-b border-black/[0.08]">
      <Link href="/" className="flex items-center gap-2 flex-shrink-0">
        <Image src="/logo.svg" alt="Iskotify" width={28} height={28} />
        <span className="font-heading font-extrabold text-[#800000] text-lg tracking-tight">Iskotify</span>
      </Link>

      <div className="hidden md:flex items-center gap-7">
        <a href="#features" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">Features</a>
        <a href="#how-it-works" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">How It Works</a>
        <a href="#testimonials" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">Testimonials</a>
        <a href="#faq" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-body">FAQ</a>
      </div>

      <a
        href="#download"
        className="bg-[#800000] text-white rounded-[980px] px-5 py-2 text-sm font-medium hover:bg-[#a00000] transition-colors flex-shrink-0"
      >
        Get the App
      </a>
    </nav>
  )
}
