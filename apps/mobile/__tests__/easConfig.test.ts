import fs from 'fs'
import path from 'path'

// Google Play requires an Android App Bundle for new apps; the APK profiles
// stay for sideloading (development client, internal preview installs).
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'))

describe('EAS build profiles', () => {
  it('builds production as an Android App Bundle', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle')
  })

  // A universal APK carries every ABI's native libraries. Phones that can run
  // minSdk 24 are arm (x86 Android phones stopped at Android 6), so the
  // sideloaded preview APK builds only the two arm ABIs. Development keeps x86
  // for emulators; the production AAB keeps all four and Play splits them.
  it('builds the preview APK for arm phones only', () => {
    expect(eas.build.preview.android.gradleCommand).toBe(
      ':app:assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a',
    )
    expect(eas.build.development.android.gradleCommand).toBeUndefined()
    expect(eas.build.production.android.gradleCommand).toBeUndefined()
  })

  it('keeps APKs for development and preview installs', () => {
    expect(eas.build.development.android.buildType).toBe('apk')
    expect(eas.build.preview.android.buildType).toBe('apk')
  })

  // Expo SDK 55 requires Xcode 26. Pin the exact image (the `sdk-55` alias
  // target) so an alias move never changes the iOS toolchain under a release.
  it('pins every profile to the Xcode 26 iOS build image', () => {
    for (const name of Object.keys(eas.build)) {
      expect(eas.build[name].ios?.image).toBe('macos-sequoia-15.6-xcode-26.2')
    }
  })
})
