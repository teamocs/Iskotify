import fs from 'fs'
import path from 'path'

// The owner approves every APK and OTA (product decision). EAS Workflows must
// therefore never start a build or publish an update on their own: each one is
// manual (workflow_dispatch / `eas workflow:run`) with no push, pull_request,
// schedule or label trigger.
const DIR = path.join(__dirname, '..', '.eas', 'workflows')
const files = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))
const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8')
const profiles = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8')).build)

describe('EAS workflows', () => {
  it('has the preview APK, preview release and production workflows', () => {
    expect(files.sort()).toEqual(['preview-apk.yml', 'preview-release.yml', 'production-android.yml'])
  })

  it.each(files)('%s runs only when started by hand', (f) => {
    const src = read(f)
    expect(src).toMatch(/^on:\s*\n\s+workflow_dispatch:/m)
    expect(src).not.toMatch(/^\s+(push|pull_request|pull_request_labeled|pull_request_comment|schedule|ref_delete):/m)
  })

  it.each(files)('%s only uses build profiles that exist in eas.json', (f) => {
    for (const m of read(f).matchAll(/profile:\s*(\S+)/g)) {
      expect(profiles).toContain(m[1])
    }
  })

  // An OTA must never reach a binary built from different native code: the
  // release workflow publishes only when a preview build with the same
  // fingerprint exists, and builds a new APK otherwise.
  it('gates the preview OTA on a fingerprint-matched build', () => {
    const src = read('preview-release.yml')
    expect(src).toMatch(/type: fingerprint/)
    expect(src).toMatch(/fingerprint_hash: \$\{\{ needs\.fingerprint\.outputs\.android_fingerprint_hash \}\}/)
    expect(src).toMatch(/publish_update:[\s\S]*if: \$\{\{ needs\.find_build\.outputs\.build_id \}\}[\s\S]*channel: preview/)
    expect(src).toMatch(/build_android:[\s\S]*if: \$\{\{ !needs\.find_build\.outputs\.build_id \}\}/)
  })
})
