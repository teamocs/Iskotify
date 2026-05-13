import React from 'react'
import { renderHook } from '@testing-library/react-native'
import { useDb } from '../useDb'

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(() => ({ execSync: jest.fn() })),
  SQLiteProvider: (props: any) => props.children,
}))

jest.mock('../../db/client', () => ({
  createDrizzleClient: jest.fn(() => ({ __isDrizzle: true })),
}))

jest.mock('../../db', () => {
  const R = require('react')
  const { createDrizzleClient } = require('../../db/client')
  const { useSQLiteContext } = require('expo-sqlite')
  const DrizzleContext = R.createContext(null)
  return {
    DrizzleProvider: function MockDrizzleProvider(props: any) {
      const rawDb = useSQLiteContext()
      const db = R.useMemo(function () { return createDrizzleClient(rawDb) }, [rawDb])
      return R.createElement(DrizzleContext.Provider, { value: db }, props.children)
    },
    DrizzleContext,
  }
})

describe('useDb', () => {
  it('returns the drizzle client from DrizzleProvider', () => {
    const { DrizzleProvider } = require('../../db')
    const { result } = renderHook(() => useDb(), {
      wrapper: function Wrapper(props: any) {
        return React.createElement(DrizzleProvider, null, props.children)
      },
    })
    expect((result.current as any).__isDrizzle).toBe(true)
  })

  it('throws when called outside DrizzleProvider', () => {
    expect(() => renderHook(() => useDb())).toThrow('useDb must be used within DrizzleProvider')
  })
})
