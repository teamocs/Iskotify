import { toast } from 'sonner'

const FALLBACK_MESSAGE = 'Something went wrong'

/** Errors stay up longer than successes: they carry something to act on. */
export const ERROR_TOAST_MS = 8000

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
  toast.error(message || FALLBACK_MESSAGE, { duration: ERROR_TOAST_MS })
}
