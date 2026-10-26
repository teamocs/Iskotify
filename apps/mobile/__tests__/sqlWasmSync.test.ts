import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'

// public/sql-wasm.wasm is a committed copy that the web export serves. It must be
// byte-identical to the installed sql.js build, or the web app fails to boot
// ("Ie.O is not a function") — which a sql.js version bump silently causes.
// Fix: cp node_modules/sql.js/dist/sql-wasm.wasm apps/mobile/public/
const sha = (file: string) => createHash('sha1').update(readFileSync(file)).digest('hex')

it('public/sql-wasm.wasm matches the installed sql.js', () => {
  const installed = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
  expect(sha(path.join(__dirname, '..', 'public', 'sql-wasm.wasm'))).toBe(sha(installed))
})
