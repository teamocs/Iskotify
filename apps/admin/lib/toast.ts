import { toast } from 'sonner'

const FALLBACK_MESSAGE = 'Something went wrong'

/** Success toast for a completed mutating action. Always pass a specific,
 * past-tense confirmation ("Listing saved", "Card deleted") — never a generic
 * "Success". */
export function notifySuccess(message: string): void {
  toast.success(message)
}

/** Error toast for a failed mutating action. Accepts either the server's
 * error string or a caught Error — the message is extracted either way. */
export function notifyError(messageOrError: string | Error): void {
  const message = messageOrError instanceof Error ? messageOrError.message : messageOrError
  toast.error(message || FALLBACK_MESSAGE)
}

export interface WithToastOptions<T> {
  /** Shown immediately while the promise is pending. Omit to skip the loading toast. */
  loading?: string
  /** Shown once the promise resolves. May be computed from the resolved value. */
  success: string | ((value: T) => string)
  /** Shown if the promise rejects. Defaults to the caught error's message. */
  error?: string | ((err: unknown) => string)
}

/**
 * Wraps a promise with loading/success/error toasts. Resolves with the same
 * value the input promise resolves with, and re-throws on rejection — it
 * never swallows the error, so callers keep their own catch/finally (e.g. to
 * clear a "saving" flag) working exactly as before.
 */
export async function withToast<T>(promise: Promise<T>, options: WithToastOptions<T>): Promise<T> {
  const loadingId = options.loading !== undefined ? toast.loading(options.loading) : undefined
  try {
    const value = await promise
    if (loadingId !== undefined) toast.dismiss(loadingId)
    const successMessage = typeof options.success === 'function' ? options.success(value) : options.success
    toast.success(successMessage)
    return value
  } catch (err) {
    if (loadingId !== undefined) toast.dismiss(loadingId)
    const errorMessage = options.error
      ? (typeof options.error === 'function' ? options.error(err) : options.error)
      : (err instanceof Error ? err.message : FALLBACK_MESSAGE)
    toast.error(errorMessage || FALLBACK_MESSAGE)
    throw err
  }
}
