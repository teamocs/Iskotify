import fs from 'fs'
import path from 'path'

// The web build is a static export: each route is an .html file. Without
// cleanUrls, a direct load, refresh or bookmark of /help (or /practice, /settings…)
// 404s because only help.html exists. Dynamic routes ([id]) need an explicit
// rewrite to their [param].html file. This keeps both in step with app/.

const root = path.join(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
  cleanUrls?: boolean
  rewrites?: Array<{ source: string; destination: string }>
}

function dynamicRoutes(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Route groups like (tabs) don't appear in the URL.
      const seg = /^\(.*\)$/.test(entry.name) ? '' : `${entry.name}/`
      out.push(...dynamicRoutes(full, prefix + seg))
    } else if (/\[.+\]\.tsx$/.test(entry.name)) {
      out.push(prefix + entry.name.replace(/\.tsx$/, ''))
    }
  }
  return out
}

describe('vercel.json web routing', () => {
  it('serves static routes by their clean URL (/help → help.html)', () => {
    expect(config.cleanUrls).toBe(true)
  })

  const routes = dynamicRoutes(path.join(root, 'app'))

  it.each(routes)('rewrites the dynamic route /%s to its html file', route => {
    const source = '/' + route.replace(/\[([^\]]+)\]/g, ':$1')
    const destination = '/' + route + '.html'
    expect(config.rewrites).toEqual(expect.arrayContaining([{ source, destination }]))
  })
})

// Comparing with HEAD^ skips the build when a later commit does not touch the app,
// even if the live deployment is several commits behind (Nov 2026: the web app
// stayed on an older commit after builds finished out of order).
describe('vercel.json ignoreCommand', () => {
  it.each(['mobile', 'admin'])('%s compares with the last deployed commit', app => {
    const file = path.join(root, '..', app, 'vercel.json')
    const { ignoreCommand } = JSON.parse(fs.readFileSync(file, 'utf8')) as { ignoreCommand: string }
    expect(ignoreCommand).toContain('git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD')
  })
})
