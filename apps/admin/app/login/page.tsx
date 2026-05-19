'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Invalid email or password')
      return
    }
    router.push('/admin/listings')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="Iskotify" width={40} height={40} className="mx-auto mb-3" />
          <h1 className="font-heading font-bold text-2xl text-[#1d1d1f] tracking-tight">Admin Console</h1>
          <p className="text-sm text-[#6e6e73] mt-1">Sign in to manage listings</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[22px] shadow-[0_8px_32px_rgba(0,0,0,0.06)] p-8 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-[#6e6e73] mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-[10px] border border-black/[0.08] text-sm text-[#1d1d1f] bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/30 focus:border-[#800000]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6e6e73] mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-[10px] border border-black/[0.08] text-sm text-[#1d1d1f] bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/30 focus:border-[#800000]"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#800000] text-white rounded-[980px] py-2.5 text-sm font-medium font-body hover:bg-[#a00000] transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
