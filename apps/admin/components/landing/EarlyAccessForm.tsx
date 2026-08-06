'use client'

import { useState } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function EarlyAccessForm() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [school, setSchool] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const submitting = status === 'submitting'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, school, gradeLevel }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }

      if (res.ok && data.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  const inputClass =
    'w-full rounded-xl border border-[#d2d2d7] bg-white px-4 py-3 text-sm font-body text-[#1d1d1f] placeholder:text-[#a1a1a6] focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 transition-colors'
  const labelClass = 'block text-xs font-body font-semibold text-[#1d1d1f] mb-1.5'

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[#800000]/20 bg-[#800000]/[0.05] px-6 py-8 text-center"
        >
          <span className="text-3xl" aria-hidden="true">🎉</span>
          <h3 className="font-heading font-bold text-[#1d1d1f] text-xl mt-3 mb-2">
            You&apos;re on the list!
          </h3>
          <p className="text-[#6e6e73] font-body text-sm leading-relaxed">
            We&apos;ll email your Android APK to <span className="font-semibold text-[#1d1d1f]">{email}</span>.
            Keep an eye on your inbox (and spam folder, just in case).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Explanatory copy */}
      <p className="text-[#6e6e73] font-body text-sm leading-relaxed mb-6 text-center">
        Iskotify is in <span className="font-semibold text-[#1d1d1f]">free early access</span> for Android.
        We&apos;ll email you the app (APK) to install — before we launch on the Google Play Store.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="ea-full-name" className={labelClass}>
            Full name
          </label>
          <input
            id="ea-full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Juan dela Cruz"
            className={inputClass}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="ea-email" className={labelClass}>
            Email <span className="text-[#800000]">*</span>
          </label>
          <input
            id="ea-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputClass}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="ea-school" className={labelClass}>
            School <span className="font-normal text-[#a1a1a6]">(optional)</span>
          </label>
          <input
            id="ea-school"
            name="school"
            type="text"
            autoComplete="organization"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="Your school or university"
            className={inputClass}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="ea-grade-level" className={labelClass}>
            Grade level <span className="font-normal text-[#a1a1a6]">(optional)</span>
          </label>
          <input
            id="ea-grade-level"
            name="gradeLevel"
            type="text"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="e.g. Grade 12, College freshman"
            className={inputClass}
            disabled={submitting}
          />
        </div>

        {status === 'error' && (
          <p role="alert" aria-live="assertive" className="text-sm font-body text-[#800000]">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#800000] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#a00000] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Requesting…' : 'Request early access'}
        </button>

        <p className="text-center text-xs font-body text-[#a1a1a6]">
          Free · No subscription · We&apos;ll only email you about your early-access access.
        </p>
      </form>
    </div>
  )
}
