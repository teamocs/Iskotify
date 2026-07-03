// Shared defaults + helpers for the "App update — for existing users" rollout.
// The update APK URL and this email template live in app_config under
// `update_apk_url` and `update_email_template`. Distinct from the first-install
// early-access APK (`early_access_apk_url`).

export const DEFAULT_UPDATE_EMAIL_TEMPLATE: string = `Subject: Your Iskotify update is ready — a quick 2-minute install 🎓

Hi {{name}},

Good news — a new version of Iskotify is ready for you! We've been improving the app based on your feedback, and this update makes Kuya Baw smarter and the whole experience smoother.

WHAT'S NEW
• Kuya Baw now answers more reliably about your exams, scholarships, subjects, and progress — with clearer, more complete replies.
• More accurate exam and scholarship details, and better handling of your saved data.
• Speed and stability improvements across the app.

HOW TO UPDATE (about 2 minutes)
1. Tap the download link below on your Android phone:
   {{apk_url}}
2. When the file finishes downloading, tap it to open.
3. If Android asks, allow "Install from unknown sources" for your browser — this is normal for apps outside the Play Store.
4. Tap "Install." The new version installs right over your current app.

WHAT TO EXPECT
• Your data is safe. Your progress, focus list, notes, and settings stay exactly as they are — you won't lose anything.
• You'll stay signed in. No need to log in again.
• On first open, the app may take a few seconds to refresh your data. That's normal.

Iskotify is completely free during Early Access — no subscription, ever.

Need help or want to share feedback? Reply to this email (teamocsph@gmail.com) or join our private beta community on Facebook: https://www.facebook.com/share/g/193aUvEccE/

Keep going — you've got this! 💪
— Kuya Baw & the Iskotify Team`

/**
 * Render an update email by substituting {{name}} and {{apk_url}} placeholders.
 * Missing name falls back to "there"; missing apkUrl to the literal "[download link]".
 */
export function renderUpdateEmail(
  template: string,
  vars: { name?: string; apkUrl?: string },
): string {
  const name = vars.name?.trim() || 'there'
  const apkUrl = vars.apkUrl?.trim() || '[download link]'
  return template
    .replace(/\{\{\s*name\s*\}\}/g, name)
    .replace(/\{\{\s*apk_url\s*\}\}/g, apkUrl)
}
