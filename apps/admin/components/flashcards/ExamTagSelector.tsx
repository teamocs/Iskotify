'use client'

interface Listing {
  slug: string
  title: string
}

interface Props {
  listings: Listing[]
  selected: string[]
  onChange: (slugs: string[]) => void
}

export function ExamTagSelector({ listings, selected, onChange }: Props) {
  function toggle(slug: string) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug))
    } else {
      onChange([...selected, slug])
    }
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
      <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-1">
        Relevant Exams &amp; Scholarships
      </p>
      <p className="text-[11px] text-[#6e6e73] mb-3">
        Mobile app uses these tags to surface cards to students based on their target exam.
      </p>
      <div className="flex flex-wrap gap-2">
        {listings.map((l) => {
          const active = selected.includes(l.slug)
          return (
            <button
              key={l.slug}
              onClick={() => toggle(l.slug)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                active
                  ? 'bg-[#fef2f2] text-[#800000] border-[#fecaca]'
                  : 'bg-[#f5f5f7] text-[#6e6e73] border-[#e5e7eb]'
              }`}
            >
              {active ? '✓ ' : '+ '}{l.title}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-[#800000] mt-2">Select at least one exam or scholarship</p>
      )}
    </div>
  )
}
