import fs from 'fs'
import path from 'path'

// Google Play requires an Android App Bundle for new apps; the APK profiles
// stay for sideloading (development client, internal preview installs).
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'))

describe('EAS build profiles', () => {
  it('builds production as an Android App Bundle', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle')
  })

  it('keeps APKs for development and preview installs', () => {
    expect(eas.build.development.android.buildType).toBe('apk')
    expect(eas.build.preview.android.buildType).toBe('apk')
  })
})
