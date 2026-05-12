'use client'

import { useRef } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function UploadDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
        disabled
          ? 'border-[#d1d5db] cursor-default opacity-50'
          : 'border-[#ccc] hover:border-[#800000] cursor-pointer'
      }`}
    >
      <div className="text-3xl mb-2">📄</div>
      <p className="font-semibold text-[#1d1d1f] text-sm">Drop PDF here or click to browse</p>
      <p className="text-[#6e6e73] text-xs mt-1">Max 20MB · PDF only</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
