'use client'

interface Props {
  /** Export route base, e.g. "/api/admin/listings/export". `?format=` is appended. */
  baseHref: string
}

// CSV / JSON download links for bespoke pages whose table isn't in the generic
// Data Manager (listings, flashcards, upcat_questions). Browser streams the file.
export function ExportButtons({ baseHref }: Props) {
  const cls = 'rounded-[980px] px-3 py-1.5 text-[13px] font-medium border border-black/[0.08] text-[#1d1d1f] bg-white hover:bg-[#f5f5f7] transition-colors shadow-sm'
  return (
    <div className="flex items-center gap-2">
      <a href={`${baseHref}?format=csv`} className={cls}>⬇ CSV</a>
      <a href={`${baseHref}?format=json`} className={cls}>⬇ JSON</a>
    </div>
  )
}
