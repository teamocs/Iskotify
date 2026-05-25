interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: string
  onClick?: () => void
  active?: boolean
}

export function StatCard({ label, value, sub, accent, onClick, active }: Props) {
  const baseClass =
    'bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-4 flex flex-col'
  const clickableClass = onClick
    ? 'cursor-pointer hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] transition-shadow'
    : ''
  const activeClass = active ? 'ring-2 ring-[#800000]/30 bg-[#fff8f8]' : ''

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${baseClass} ${clickableClass} ${activeClass} text-left w-full`}
      >
        <p className="text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-widest mb-2">{label}</p>
        <p className={`font-heading font-extrabold text-[2rem] leading-none tracking-tight mb-1 ${accent ?? 'text-[#1d1d1f]'}`}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-[#aeaeb2]">{sub}</p>}
      </button>
    )
  }

  return (
    <div className={`${baseClass} ${activeClass}`}>
      <p className="text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-widest mb-2">{label}</p>
      <p className={`font-heading font-extrabold text-[2rem] leading-none tracking-tight mb-1 ${accent ?? 'text-[#1d1d1f]'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#aeaeb2]">{sub}</p>}
    </div>
  )
}
