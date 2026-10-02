// The web glimpse (P4): is this a signed-out web visitor? Native never has
// guests (it has its own "start without an account" flow), so this is false
// there without touching the auth client. On web the Supabase session is read
// from local storage (no network). A failed read counts as signed out: the
// guest routes stay limited and analytics stays off, so that is the safe side.
import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function isSignedOutWebGuest(): Promise<boolean> {
  if (Platform.OS !== 'web') return false
  try {
    const { data } = await supabase.auth.getSession()
    return !data.session
  } catch {
    return true
  }
}
