interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: string
}

export function StatCard({ label, value, sub, accent }: Props) {
  return (
    <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-4">
      <p className="text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-widest mb-2">{label}</p>
      <p className={`font-heading font-extrabold text-[2rem] leading-none tracking-tight mb-1 ${accent ?? 'text-[#1d1d1f]'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#aeaeb2]">{sub}</p>}
    </div>
  )
}
