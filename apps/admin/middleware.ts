import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isLoginPage = request.nextUrl.pathname === '/login'

  // If Supabase is not configured, let /login through and block everything else
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isLoginPage) return NextResponse.next({ request })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      }
    }
  })

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // treat auth error as unauthenticated
  }

  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/listings', request.url))
  }

  return supabaseResponse
}

export const config = { matcher: ['/admin/:path*', '/login'] }
