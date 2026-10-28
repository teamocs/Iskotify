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
    // into the manifest, so they are blocked explicitly.
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
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps['llama.rn']).toBeUndefined()
    expect(deps['@kesha-antonov/react-native-background-downloader']).toBeUndefined()
  })

  // 1.9.0 added react-native-purchases (RevenueCat, P3 Full Access). 1.10.0 is
  // the Expo SDK 55 upgrade (React Native 0.83): every native module changes,
  // so it is a new binary and a new runtime. SDK 55 OTA bundles must never
  // reach 1.9.0 (SDK 54) binaries.
  it('ships the 1.10.0 runtime with runtimeVersion tied to the app version', () => {
    expect(app.version).toBe('1.10.0')
    expect(app.android.versionCode).toBe(27)
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' })
  })

  // The app uses no biometrics. expo-secure-store adds a default
  // NSFaceIDUsageDescription unless told not to, and App Review asks about
  // every usage string. `false` makes the plugin delete the key.
  it('asks for no Face ID usage string (expo-secure-store faceIDPermission: false)', () => {
    const entry = app.plugins.find((p: string | [string, unknown]) => (Array.isArray(p) ? p[0] : p) === 'expo-secure-store')
    expect(entry).toEqual(['expo-secure-store', { faceIDPermission: false }])
    expect(app.ios?.infoPlist?.NSFaceIDUsageDescription).toBeUndefined()
  })

  it('bundles the Google Play billing SDK (RevenueCat) and never blocks the billing permission', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    expect(pkg.dependencies['react-native-purchases']).toBeDefined()
    expect(app.android.blockedPermissions).not.toContain('com.android.vending.BILLING')
  })
})

// Install size and device reach, set on purpose instead of inherited defaults.
// minSdk 24 (Android 7.0) is the lowest React Native 0.83 supports, so older
// phones common in the Philippines still install. targetSdk 36 meets Google
// Play's target API rule. iOS 15.1 is the Expo SDK 55 floor. R8 and resource
// shrinking cut unused Java/Kotlin code and resources from release builds
// (preview APK and production AAB). Hermes stays on (the SDK default) and the
// AAB lets Play serve each device only its own ABI.
describe('Native build properties', () => {
  const entry = app.plugins.find((p: string | [string, unknown]) => Array.isArray(p) && p[0] === 'expo-build-properties')
  const props = entry?.[1]

  it('pins Android SDK levels deliberately', () => {
    expect(props.android).toMatchObject({ minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36 })
  })

  it('minifies and shrinks release builds', () => {
    expect(props.android.enableMinifyInReleaseBuilds).toBe(true)
    expect(props.android.enableShrinkResourcesInReleaseBuilds).toBe(true)
  })

  // Native libraries stay uncompressed and 16 KB aligned (Android 15+ devices
  // with 16 KB pages), every ABI ships in the AAB, and JS stays Hermes bytecode.
  it('keeps 16 KB-ready packaging, all ABIs and Hermes', () => {
    expect(props.android.useLegacyPackaging).toBeUndefined()
    expect(props.android.buildArchs).toBeUndefined()
    expect(app.jsEngine).toBeUndefined()
    expect(app.android.jsEngine).toBeUndefined()
  })

  it('targets iOS 15.1', () => {
    expect(props.ios.deploymentTarget).toBe('15.1')
  })
})
