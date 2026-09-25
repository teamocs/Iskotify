import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CsvDropzone } from '../CsvDropzone'

describe('CsvDropzone', () => {
  it('keeps the file input keyboard-reachable (visually hidden, not display:none) inside its label', () => {
    const out = renderToStaticMarkup(<CsvDropzone onFileSelected={() => {}} />)
    expect(out).toMatch(/<label[^>]*>[\s\S]*<input[^>]*type="file"[^>]*class="[^"]*sr-only/)
    expect(out).not.toMatch(/<input[^>]*type="file"[^>]*class="hidden"/)
  })

  it('uses an icon instead of an emoji', () => {
    const out = renderToStaticMarkup(<CsvDropzone onFileSelected={() => {}} />)
    expect(out).not.toContain('📄')
    expect(out).toContain('<svg')
  })

  it('keeps the sample link outside the drop label and optional', () => {
    const withSample = renderToStaticMarkup(<CsvDropzone onFileSelected={() => {}} />)
    expect(withSample).toMatch(/<\/label>[\s\S]*<a[^>]*href="\/sample-flashcards.csv"/)
    expect(renderToStaticMarkup(<CsvDropzone onFileSelected={() => {}} sampleHref="" />)).not.toContain('<a')
  })
})
