'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export function CsvDropzone({ onFileSelected, disabled }: Props) {
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
        cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition
        ${dragOver ? 'border-[#800000] bg-[#800000]/5' : 'border-white/15 bg-white/[0.02]'}
        ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-white/30'}
      `}
    >
      <div className="text-3xl mb-2">📄</div>
      <div className="text-white font-semibold mb-1">Drop CSV here or click to browse</div>
      <div className="text-white/40 text-sm">Max 5MB · max 1000 rows · UTF-8</div>
      <a
        href="/sample-flashcards.csv"
        onClick={e => e.stopPropagation()}
        download
        className="inline-block mt-4 text-sm text-[#ff8aa0] underline"
      >
        Download sample CSV
      </a>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handlePicked}
        disabled={disabled}
      />
    </div>
  )
}
