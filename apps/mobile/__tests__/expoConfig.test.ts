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
  it('ships the 1.8.0 runtime with runtimeVersion tied to the app version', () => {
    expect(app.version).toBe('1.8.0')
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' })
  })
})
