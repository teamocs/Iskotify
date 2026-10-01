// Iskotify's students are in the Philippines, so every test runs in Asia/Manila
// (UTC+8) — the same zone on a developer's machine and on the UTC CI runner.
// Set here, before any test worker starts: workers inherit the env, and a TZ
// changed inside a test file comes too late once Date has been used.
module.exports = async () => {
  process.env.TZ = 'Asia/Manila'
}
