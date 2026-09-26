import type { ReactNode, SVGProps } from 'react'

/*
 * One inline icon set for the landing page: 24-unit grid, 1.75 stroke,
 * currentColor, decorative (aria-hidden). Colour comes from the parent's text
 * token, never from the SVG.
 */
function Icon({ children, className = 'size-5', ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

type P = { className?: string }

export const ArrowRight = (p: P) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
export const Check = (p: P) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
export const Globe = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></Icon>
export const Phone = (p: P) => <Icon {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></Icon>
export const Sun = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Icon>
export const Pencil = (p: P) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Icon>
export const Compass = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></Icon>
export const Chart = (p: P) => <Icon {...p}><path d="M4 4v16h16" /><path d="m7.5 14 3.5-4 3 3 5-6" /></Icon>
export const School = (p: P) => <Icon {...p}><path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" /><path d="M6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" /></Icon>
export const Award = (p: P) => <Icon {...p}><circle cx="12" cy="9" r="5.5" /><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5" /></Icon>
export const Book = (p: P) => <Icon {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></Icon>
export const Plane = (p: P) => <Icon {...p}><path d="M2.5 13.5 21 6l-4 14-5-5.5-4.5 3v-5L2.5 13.5Z" /></Icon>
export const Calendar = (p: P) => <Icon {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>
export const Wifi = (p: P) => <Icon {...p}><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M9 16a4.5 4.5 0 0 1 6 0" /><circle cx="12" cy="19.5" r="0.5" /></Icon>
export const Cloud = (p: P) => <Icon {...p}><path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 10H7Z" /><path d="m9.5 13.5 2 2 3.5-3.5" /></Icon>
export const Devices = (p: P) => <Icon {...p}><rect x="2.5" y="4" width="14" height="10" rx="1.5" /><path d="M6 18h7" /><rect x="15.5" y="9" width="6" height="11" rx="1.5" /></Icon>
export const Access = (p: P) => <Icon {...p}><circle cx="12" cy="4.5" r="1.5" /><path d="M5 8.5 12 10l7-1.5M12 10v5M9 21l3-6 3 6" /></Icon>
export const Route = (p: P) => <Icon {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5" /></Icon>
export const Flag = (p: P) => <Icon {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Icon>
export const Plus = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const Android = (p: P) => <Icon {...p}><rect x="5" y="9" width="14" height="10" rx="2" /><path d="M5 13h14M8.5 9V8a3.5 3.5 0 0 1 7 0v1M9 5.5 7.5 3.5M15 5.5l1.5-2" /></Icon>
