'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

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

export function CsvDropzone({
  onFileSelected,
  disabled,
  hint = 'Max 5 MB · UTF-8 · larger files are split into batches automatically',
  sampleHref = '/sample-flashcards.csv',
  sampleLabel = 'Download sample CSV',
  accept = '.csv,text/csv',
  label = 'Drop CSV here or click to browse',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFileSelected(f)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFileSelected(f)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      className={`
        cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition bg-white
        ${dragOver ? 'border-maroon bg-[#fff5f6]' : 'border-black/[0.12]'}
        ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-maroon/60'}
      `}
    >
      <div className="text-3xl mb-2">📄</div>
      <div className="text-ink font-semibold mb-1 font-heading">{label}</div>
      <div className="text-ink-muted text-sm">{hint}</div>
      {sampleHref && (
        <a
          href={sampleHref}
          onClick={e => e.stopPropagation()}
          download
          className="inline-block mt-4 text-sm text-maroon font-medium underline hover:text-maroon-light"
        >
          {sampleLabel}
        </a>
      )}
      <input
        ref={inputRef}
        type="file"
        aria-label="Choose a CSV file to upload"
        accept={accept}
        className="hidden"
        onChange={handlePicked}
        disabled={disabled}
      />
    </div>
  )
}
