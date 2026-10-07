// The Google service account's client_email, for "share this with …" copy.
// Server-side only: it parses GOOGLE_SERVICE_ACCOUNT_JSON (which holds the
// private key) and hands back nothing but the email.
export function serviceAccountEmail(raw: string | undefined = process.env.GOOGLE_SERVICE_ACCOUNT_JSON): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown }
    return typeof parsed.client_email === 'string' && parsed.client_email ? parsed.client_email : null
  } catch {
    return null
  }
}
