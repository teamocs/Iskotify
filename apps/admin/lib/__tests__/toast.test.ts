import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { notifySuccess, notifyError, withToast } from '../toast'

describe('notifySuccess', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls toast.success with the given message', () => {
    notifySuccess('Listing saved')
    expect(toast.success).toHaveBeenCalledWith('Listing saved')
  })
})

describe('notifyError', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls toast.error with a plain string message', () => {
    notifyError('Something went wrong')
    expect(toast.error).toHaveBeenCalledWith('Something went wrong')
  })

  it('extracts the message from an Error instance', () => {
    notifyError(new Error('Network error'))
    expect(toast.error).toHaveBeenCalledWith('Network error')
  })

  it('falls back to a generic message for an empty string', () => {
    notifyError('')
    expect(toast.error).toHaveBeenCalledWith('Something went wrong')
  })

  it('falls back to a generic message for an Error with an empty message', () => {
    notifyError(new Error(''))
    expect(toast.error).toHaveBeenCalledWith('Something went wrong')
  })
})

describe('withToast', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('resolves with the promise value and calls toast.success', async () => {
    const value = await withToast(Promise.resolve(42), { success: 'Done' })
    expect(value).toBe(42)
    expect(toast.success).toHaveBeenCalledWith('Done')
  })

  it('supports a function success message computed from the resolved value', async () => {
    await withToast(Promise.resolve({ count: 3 }), {
      success: (v) => `Imported ${v.count} rows`,
    })
    expect(toast.success).toHaveBeenCalledWith('Imported 3 rows')
  })

  it('shows a loading toast and dismisses it once settled', async () => {
    vi.mocked(toast.loading).mockReturnValueOnce('loading-id')
    await withToast(Promise.resolve('ok'), { loading: 'Saving…', success: 'Saved' })
    expect(toast.loading).toHaveBeenCalledWith('Saving…')
    expect(toast.dismiss).toHaveBeenCalledWith('loading-id')
  })

  it('re-throws on rejection and calls toast.error instead of success', async () => {
    const err = new Error('boom')
    await expect(withToast(Promise.reject(err), { success: 'Done' })).rejects.toThrow('boom')
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('supports a custom error message string on rejection', async () => {
    await expect(
      withToast(Promise.reject(new Error('raw')), { success: 'Done', error: 'Custom failure' })
    ).rejects.toThrow('raw')
    expect(toast.error).toHaveBeenCalledWith('Custom failure')
  })

  it('supports a custom error message function on rejection', async () => {
    await expect(
      withToast(Promise.reject(new Error('raw')), {
        success: 'Done',
        error: (e) => `Failed: ${(e as Error).message}`,
      })
    ).rejects.toThrow('raw')
    expect(toast.error).toHaveBeenCalledWith('Failed: raw')
  })

  it('dismisses the loading toast even on rejection', async () => {
    vi.mocked(toast.loading).mockReturnValueOnce('loading-id-2')
    await expect(
      withToast(Promise.reject(new Error('fail')), { loading: 'Working…', success: 'Done' })
    ).rejects.toThrow('fail')
    expect(toast.dismiss).toHaveBeenCalledWith('loading-id-2')
  })
})
