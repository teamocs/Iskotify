'use client'

import { useEffect, useState } from 'react'

/** `value`, once it has stopped changing for `delay` ms (search-as-you-type). */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
