// Global setup for services tests — sets EXPO_PUBLIC_* env vars before
// babel-preset-expo inlines them during Jest transform.
module.exports = async function () {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
}
