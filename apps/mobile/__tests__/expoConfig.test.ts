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
})
