import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { notifySuccess, notifyError, ERROR_TOAST_MS } from '../toast'

describe('notifySuccess', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls toast.success with the given message', () => {
    notifySuccess('Listing saved')
    expect(toast.success).toHaveBeenCalledWith('Listing saved')
  })
})

describe('notifyError', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls toast.error with a plain string message, held longer than a success', () => {
    notifyError('Something went wrong')
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', { duration: ERROR_TOAST_MS })
    expect(ERROR_TOAST_MS).toBeGreaterThanOrEqual(8000)
  })

  it('extracts the message from an Error instance', () => {
    notifyError(new Error('Network error'))
    expect(toast.error).toHaveBeenCalledWith('Network error', { duration: ERROR_TOAST_MS })
  })

  it('falls back to a generic message for an empty string', () => {
    notifyError('')
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', { duration: ERROR_TOAST_MS })
  })

  it('falls back to a generic message for an Error with an empty message', () => {
    notifyError(new Error(''))
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', { duration: ERROR_TOAST_MS })
  })
})
