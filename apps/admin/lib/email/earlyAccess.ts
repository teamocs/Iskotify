// Server-only — RESEND_API_KEY and EARLY_ACCESS_FROM never reach the client.

const RESEND_URL = 'https://api.resend.com/emails'

export interface SendEarlyAccessApkEmailArgs {
  to: string
  name?: string | null
  downloadUrl: string
}

export type SendEarlyAccessApkEmailResult =
  | { ok: true }
  | { ok: false; error: string }

// Escape user-supplied values before interpolating into the email HTML. `name`
// is free text from the registration form, so treat it (and the address) as untrusted.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function buildHtml(args: SendEarlyAccessApkEmailArgs): string {
  const { name, downloadUrl } = args
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Iskotify Early Access APK</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: #800000; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px; }
    .body { padding: 32px; color: #1d1d1f; }
    .body p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #3d3d3f; }
    .cta-wrap { text-align: center; margin: 28px 0; }
    .cta { display: inline-block; background: #800000; color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 980px; }
    .steps { background: #f5f5f7; border-radius: 12px; padding: 20px 24px; margin: 20px 0; }
    .steps h3 { margin: 0 0 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6e6e73; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps ol li { font-size: 14px; color: #3d3d3f; margin-bottom: 8px; line-height: 1.5; }
    .note { border-left: 3px solid #800000; padding: 10px 14px; background: #fff8f8; border-radius: 0 8px 8px 0; font-size: 13px; color: #5a0000; margin: 16px 0; }
    .footer { padding: 20px 32px; border-top: 1px solid #f0f0f0; text-align: center; }
    .footer p { font-size: 12px; color: #aeaeb2; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>You&rsquo;re In, Iskolar! 🎉</h1>
      <p>Your Iskotify Early Access is approved</p>
    </div>
    <div class="body">
      <p>${greeting}</p>
      <p>Great news &mdash; you have been approved for <strong>Iskotify Early Access</strong>! Iskotify helps Filipino students find the right university, scholarship, and career path &mdash; all in one app.</p>

      <div class="cta-wrap">
        <a href="${downloadUrl}" class="cta">Download the Android App</a>
      </div>

      <div class="steps">
        <h3>Installation steps</h3>
        <ol>
          <li>Tap the button above to download the <code>.apk</code> file on your Android device.</li>
          <li>Open the downloaded file from your notifications or Files app.</li>
          <li>If Android asks, tap <strong>Settings</strong> and enable <em>Install from unknown sources</em> for your browser or file manager, then tap <strong>Install</strong>.</li>
          <li>Open Iskotify and <strong>sign in using this exact email address</strong> so the app can recognise your early-access status.</li>
        </ol>
      </div>

      <div class="note">
        <strong>Important:</strong> Sign in with <strong>${escapeHtml(args.to)}</strong> &mdash; the same email you registered with. Using a different email will not unlock your early access.
      </div>

      <p>Early access is <strong>completely FREE</strong>. Enjoy full access to all features.</p>

      <p>Having trouble installing? Just reply to this email and we&rsquo;ll help you out.</p>

      <p>Good luck with your college journey! 🌟<br /><strong>The Iskotify Team</strong></p>
    </div>
    <div class="footer">
      <p>You received this because you registered for Iskotify Early Access.</p>
    </div>
  </div>
</body>
</html>`
}

function buildText(args: SendEarlyAccessApkEmailArgs): string {
  const { name, downloadUrl } = args
  const greeting = name ? `Hi ${name},` : 'Hi there,'
  return `${greeting}

You're approved for Iskotify Early Access!

Download the Android app here:
${downloadUrl}

HOW TO INSTALL
1. Open the link above on your Android device to download the .apk file.
2. Open the downloaded file from your notifications or Files app.
3. If prompted, go to Settings and enable "Install from unknown sources" for your browser or file manager, then tap Install.
4. Open Iskotify and sign in with THIS same email address (${args.to}) so the app recognises your early-access status.

IMPORTANT: You must sign in with ${args.to} — the email you registered with. A different email will not unlock your access.

Early access is completely FREE.

Having trouble? Just reply to this email.

Good luck with your college journey!
The Iskotify Team`
}

export async function sendEarlyAccessApkEmail(
  args: SendEarlyAccessApkEmailArgs,
): Promise<SendEarlyAccessApkEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EARLY_ACCESS_FROM

  if (!apiKey || !from) {
    return {
      ok: false,
      error: 'Email not configured (set RESEND_API_KEY and EARLY_ACCESS_FROM)',
    }
  }

  const payload = {
    from,
    to: args.to,
    subject: "You're approved for Iskotify Early Access 🎉 — Download the Android app",
    html: buildHtml(args),
    text: buildText(args),
  }

  let res: Response
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Network error sending email: ${msg}` }
  }

  if (!res.ok) {
    let detail = ''
    try {
      const json = (await res.json()) as { message?: string; name?: string }
      detail = json.message ?? json.name ?? ''
    } catch {
      // ignore parse failure
    }
    const error = detail
      ? `Resend error ${res.status}: ${detail}`
      : `Resend returned HTTP ${res.status}`
    return { ok: false, error }
  }

  return { ok: true }
}
