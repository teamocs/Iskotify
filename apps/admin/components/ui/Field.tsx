import { useId, type ReactNode } from 'react'

/** Shared look for text inputs, selects and textareas. */
export const controlClass =
  'block w-full rounded-sm border border-control bg-surface px-3 h-9 text-sm text-ink ' +
  'placeholder:text-ink-subtle transition-colors hover:border-ink-muted ' +
  'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle'

export interface FieldControlProps {
  id: string
  required?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FieldProps {
  label: string
  id?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  /** Render prop: spread the props onto the control so label, hint and error are wired. */
  children: (props: FieldControlProps) => ReactNode
}

/**
 * A labelled form control. The label is tied by htmlFor/id, the hint and the
 * error by aria-describedby, and an error also sets aria-invalid and is
 * announced (role="alert"). Required fields get the attribute; the visual
 * asterisk is hidden from screen readers.
 */
export function Field({ label, id: idProp, hint, error, required, className, children }: FieldProps) {
  const auto = useId()
  const id = idProp ?? auto
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className="text-ui font-medium text-ink">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </label>
      {children({ id, required: required || undefined, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={hintId} className="text-xs text-ink-muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
