import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-pill font-medium ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none'

// One primary (maroon) action per screen; everything else is secondary or ghost.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-maroon text-ink-inverse hover:bg-maroon-hover',
  secondary: 'bg-surface text-ink border border-strong hover:bg-surface-hover',
  ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
  danger: 'bg-danger text-ink-inverse hover:bg-danger-strong',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-ui',
  md: 'h-9 px-4 text-sm',
}

const ICON_ONLY: Record<ButtonSize, string> = { sm: 'h-8 w-8', md: 'h-9 w-9' }

/** Button styling as a class string, for links that should look like buttons. */
export function buttonClass({ variant = 'secondary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Blocks the button and announces it busy; the label stays so it can read "Publishing…". */
  loading?: boolean
  icon?: IconName
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, disabled, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...rest}
    >
      {loading ? <Icon name="loader" className="animate-spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
})

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: IconName
  /** Required accessible name; also shown as the native tooltip. */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'sm', className, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={[BASE, VARIANTS[variant], ICON_ONLY[size], 'rounded-sm', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
})
