import fs from 'fs'
import path from 'path'

// EAS builds must run under the teamocsph Expo account that owns the project.
// Without `owner`, a build uses whichever account the machine is logged into
// (an EXPO_TOKEN for another account failed with "Entity not authorized").
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo

describe('Expo project ownership', () => {
  it('pins builds to the teamocsph account', () => {
    expect(app.owner).toBe('teamocsph')
  })

  it('uses one project id for EAS and for updates', () => {
    const id = app.extra.eas.projectId
    expect(id).toBe('2aff33cd-6887-46ff-9242-4e0803ca31d5')
    expect(app.updates.url).toBe(`https://u.expo.dev/${id}`)
  })
  // runtimeVersion follows the app version, so a release that changes native
  // modules (1.8.0 added expo-image and dropped lottie) must bump it, or an
  // OTA update could reach 1.7.0 binaries that lack those modules.
  it('blocks every Android permission the app does not need', () => {
    // The app has no camera, microphone, overlay or shared-storage feature:
    // exports go through the system file picker (SAF) and the DocumentPicker,
    // and the database lives in app-private storage. Libraries can merge these
    // into the manifest, so they are blocked explicitly. DETECT_SCREEN_CAPTURE
    // (expo-screen-capture) is deliberately NOT here.
    expect(app.android.blockedPermissions).toEqual([
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    ])
  })

  it('ships no on-device AI or background-download plugins', () => {
    const names = app.plugins.map((p: string | [string, unknown]) => (Array.isArray(p) ? p[0] : p))
    expect(names).not.toContain('@kesha-antonov/react-native-background-downloader')
    expect(names).not.toContain('expo-build-properties')
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps['llama.rn']).toBeUndefined()
    expect(deps['@kesha-antonov/react-native-background-downloader']).toBeUndefined()
  })

  // 1.9.0 adds react-native-purchases (RevenueCat, P3 Full Access): a native
  // module, so a new binary and a new runtime. Old 1.8.0 OTA bundles can't reach it.
  it('ships the 1.9.0 runtime with runtimeVersion tied to the app version', () => {
    expect(app.version).toBe('1.9.0')
    expect(app.android.versionCode).toBe(26)
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' })
  })

  it('bundles the Google Play billing SDK (RevenueCat) and never blocks the billing permission', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    expect(pkg.dependencies['react-native-purchases']).toBeDefined()
    expect(app.android.blockedPermissions).not.toContain('com.android.vending.BILLING')
  })
})
