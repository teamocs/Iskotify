import fs from 'fs'

// Install size: metro.config.js keeps two whole libraries out of the bundle.
// Before (Android export, 1.10.0): 10.5 MB Hermes bytecode + 17.3 MB assets;
// after: 6.1 MB + 1.1 MB. iOS bytecode went from 13.9 MB to 9.5 MB.
// Expo's real default config does not load under jest-expo; the redirects are
// all this file checks.
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: { assetExts: [], sourceExts: [] }, transformer: {} }),
}))

const subset = require('../scripts/lineicons-subset.js')
const metro = require('../metro.config.js')

function resolveWith(moduleName: string) {
  const calls: string[] = []
  const context = { resolveRequest: (_c: unknown, name: string) => (calls.push(name), { type: 'empty' }) }
  const result = metro.resolver.resolveRequest(context, moduleName, 'android')
  return { result, calls }
}

describe('install size: bundle only what the app uses', () => {
  it('lib/lineicons.js holds exactly the icons the source imports (run node scripts/lineicons-subset.js)', () => {
    expect(fs.readFileSync(subset.OUT, 'utf8').replace(/\r\n/g, '\n')).toBe(subset.render())
    expect(subset.usedIconNames().length).toBeGreaterThan(0)
  })

  it('resolves @lineiconshq/free-icons to the subset, not the 26,000-icon package', () => {
    expect(resolveWith('@lineiconshq/free-icons').result).toEqual({ type: 'sourceFile', filePath: subset.OUT })
  })

  it('loads useFonts from Material Symbols without its index of all 18 font files', () => {
    expect(resolveWith('@expo-google-fonts/material-symbols').calls).toEqual(['@expo-google-fonts/material-symbols/useFonts'])
  })

  it('leaves every other module to the default resolver', () => {
    expect(resolveWith('react-native').calls).toEqual(['react-native'])
  })
})
