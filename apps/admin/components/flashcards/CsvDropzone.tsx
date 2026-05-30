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
        cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition bg-white
        ${dragOver ? 'border-[#800000] bg-[#fff5f6]' : 'border-black/[0.12]'}
        ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-[#800000]/60'}
      `}
    >
      <div className="text-3xl mb-2">📄</div>
      <div className="text-[#1d1d1f] font-semibold mb-1 font-heading">Drop CSV here or click to browse</div>
      <div className="text-[#6e6e73] text-sm">Max 5 MB · UTF-8 · larger files are split into batches automatically</div>
      <a
        href="/sample-flashcards.csv"
        onClick={e => e.stopPropagation()}
        download
        className="inline-block mt-4 text-sm text-[#800000] font-medium underline hover:text-[#9a0a1f]"
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
