import Image from 'next/image'
import Link from 'next/link'

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-[52px] bg-white/80 backdrop-blur-[20px] saturate-[180%] border-b border-black/[0.08]">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.svg" alt="Iskotify" width={28} height={28} />
        <span className="font-heading font-extrabold text-[#800000] text-lg tracking-tight">Iskotify</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="#listings" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">Scholarships</Link>
        <Link href="#listings" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">Exams</Link>
        <a href="#download" className="bg-[#800000] text-white rounded-[980px] px-4 py-1.5 text-sm font-medium hover:bg-[#a00000] transition-colors">
          Get the App
        </a>
      </div>
    </nav>
  )
}
