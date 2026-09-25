'use client'

import { useId } from 'react'
import { Icon } from '@/components/ui/Icon'

interface Listing {
  slug: string
  title: string
}

interface Props {
  listings: Listing[]
  selected: string[]
  onChange: (slugs: string[]) => void
  /** Group label (the fieldset legend). */
  label?: string
  hint?: string
  required?: boolean
  /** Shown next to the group and announced; pass it only after a submit attempt. */
  error?: string
  disabled?: boolean
}

/**
 * Toggle chips for tagging cards with exams/scholarships. A fieldset with a
 * legend; each chip is a button that reports aria-pressed, so the state is
 * spoken, not just coloured.
 */
export function ExamTagSelector({
  listings, selected, onChange,
  label = 'Relevant exams and scholarships',
  hint = 'The mobile app uses these tags to show cards to students preparing for that exam.',
  required = false, error, disabled = false,
}: Props) {
  const uid = useId()
  const hintId = `${uid}-hint`
  const errorId = `${uid}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  function toggle(slug: string) {
    onChange(selected.includes(slug) ? selected.filter(s => s !== slug) : [...selected, slug])
  }

  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="min-w-0 space-y-2">
      <legend className="text-ui font-medium text-ink">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </legend>
      {hint && <p id={hintId} className="text-xs text-ink-muted">{hint}</p>}
      {listings.length === 0 ? (
        <p className="text-ui text-ink-muted">No exams or scholarships to tag yet. Add one under Listings first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {listings.map(l => {
            const active = selected.includes(l.slug)
            return (
              <button
                key={l.slug}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggle(l.slug)}
                className={`inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-maroon bg-maroon-dim text-maroon'
                    : 'border-strong bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink'
                }`}
              >
                <Icon name={active ? 'check' : 'plus'} size={14} />
                {l.title}
              </button>
            )
          })}
        </div>
      )}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  )
}
