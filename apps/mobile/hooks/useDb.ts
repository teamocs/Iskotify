import { useContext } from 'react'
import { DrizzleContext } from '../db'
import type { DrizzleClient } from '../db/client'

export function useDb(): DrizzleClient {
  const db = useContext(DrizzleContext)
  if (!db) throw new Error('useDb must be used within DrizzleProvider')
  return db
}
