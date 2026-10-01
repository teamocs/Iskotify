/**
 * A one-shot message handed to the next signed-out screen (landing on native,
 * sign-in on web). Deleting an account sends the student there, so the screen
 * says why they are back at the start. Module state, not a route param: it is
 * read once and cleared, and survives the replace() on every platform.
 */
export const ACCOUNT_DELETED_NOTICE = 'Your account was deleted.'

let pending: string | null = null

export function setAccountNotice(message: string): void {
  pending = message
}

/** Returns the pending message once, then clears it. */
export function takeAccountNotice(): string | null {
  const message = pending
  pending = null
  return message
}
