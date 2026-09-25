'use client'

import { useState, type ChangeEvent, type DragEvent } from 'react'
import { Icon } from '@/components/ui/Icon'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
  hint?: string
  sampleHref?: string
  sampleLabel?: string
  /** File input `accept` attribute. Defaults to CSV-only for the existing import flows. */
  accept?: string
  /** Dropzone headline text. Defaults to the CSV import copy. */
  label?: string
}

/**
 * Drop a file or pick one. The whole zone is the file input's <label>, and the
 * input is only visually hidden, so Tab reaches it and Enter/Space opens the
 * picker; the focus ring shows on the zone.
 */
export function CsvDropzone({
  onFileSelected,
  disabled,
  hint = 'Max 5 MB · UTF-8 · larger files are split into batches automatically',
  sampleHref = '/sample-flashcards.csv',
  sampleLabel = 'Download sample CSV',
  accept = '.csv,text/csv',
  label = 'Drop CSV here or click to browse',
}: Props) {
  const [dragOver, setDragOver] = useState(false)

  function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFileSelected(f)
    // Let the same file be picked again after an edit.
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const f = e.dataTransfer.files?.[0]
    if (f) onFileSelected(f)
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  return (
    <div className="space-y-2">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        className={[
          'flex flex-col items-center gap-1 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-maroon',
          dragOver ? 'border-maroon bg-maroon-dim' : 'border-strong bg-surface',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-maroon hover:bg-surface-hover',
        ].join(' ')}
      >
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-sm bg-neutral-soft text-ink-muted">
          <Icon name="upload" size={20} />
        </span>
        <span className="font-heading text-sm font-semibold text-ink">{label}</span>
        <span className="text-ui text-ink-muted">{hint}</span>
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handlePicked}
          disabled={disabled}
        />
      </label>
      {sampleHref && (
        <a
          href={sampleHref}
          download
          className="inline-flex items-center gap-1 text-ui font-medium text-maroon underline underline-offset-2 hover:text-maroon-hover"
        >
          <Icon name="download" size={14} />
          {sampleLabel}
        </a>
      )}
    </div>
  )
}
