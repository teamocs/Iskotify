import React from 'react'
import { renderHook } from '@testing-library/react-native'
import { DatabaseProvider, useDatabase } from '../useDatabase'

jest.mock('../../db', () => ({
  database: { __isMock: true },
}))

describe('useDatabase', () => {
  it('returns the database instance provided by DatabaseProvider', () => {
    const { result } = renderHook(() => useDatabase(), {
      wrapper: ({ children }) => <DatabaseProvider>{children}</DatabaseProvider>,
    })
    expect((result.current as any).__isMock).toBe(true)
  })

  it('returns the singleton when used without a DatabaseProvider', () => {
    // Context has a default value (the singleton), so it never throws.
    // Test confirms the hook returns a truthy value in all cases.
    const { result } = renderHook(() => useDatabase())
    expect(result.current).toBeTruthy()
  })
})
