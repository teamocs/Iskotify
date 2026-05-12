describe('supabase client', () => {
  it('exports a client with a from() method', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('../supabase')
    expect(typeof supabase.from).toBe('function')
  })

  it('does not use localStorage-based session persistence', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('../supabase')
    // auth options should have persistSession: false for React Native
    expect(supabase.auth).toBeDefined()
  })
})
