import type { RowError } from './parseCsvRow'

export interface FileError {
  message: string
}

export const EXPECTED_HEADER = ['subject', 'topic', 'question', 'answer', 'explanation', 'distractors'] as const

export function validateCsvFile(file: { name: string; size: number }): FileError | null {
  if (file.size > 5 * 1024 * 1024) {
    return { message: 'File too large (max 5MB)' }
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { message: 'File must have a .csv extension' }
  }
  return null
}

export function validateHeader(headerRow: string[]): FileError | null {
  const normalized = headerRow.map(h => h.trim().toLowerCase().replace(/^﻿/, ''))
  if (normalized.length !== EXPECTED_HEADER.length) {
    return { message: `Header must be exactly: ${EXPECTED_HEADER.join(',')}. Got: ${headerRow.join(',')}` }
  }
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (normalized[i] !== EXPECTED_HEADER[i]) {
      return { message: `Header must be exactly: ${EXPECTED_HEADER.join(',')}. Got: ${headerRow.join(',')}` }
    }
  }
  return null
}

export function checkDuplicates(
  rows: Array<{ subject: string; topic: string; question: string }>,
): RowError[] {
  const seen = new Map<string, number>()
  const errors: RowError[] = []
  rows.forEach((row, i) => {
    const key = `${row.subject.toLowerCase()}|${row.topic.toLowerCase()}|${row.question.toLowerCase()}`
    const prev = seen.get(key)
    if (prev != null) {
      errors.push({ rowIndex: i, field: 'question', message: `duplicate of row ${prev + 1}` })
    } else {
      seen.set(key, i)
    }
  })
  return errors
}
