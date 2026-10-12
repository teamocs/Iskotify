import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { selection } from '../haptics'

const selectionAsync = Haptics.selectionAsync as jest.Mock

describe('haptics.selection()', () => {
  const os = Platform.OS
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    selectionAsync.mockReset()
    selectionAsync.mockResolvedValue(undefined)
  })

  it('plays the selection tick on native', () => {
    selection()
    expect(selectionAsync).toHaveBeenCalledTimes(1)
  })

  it('is a no-op on web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    selection()
    expect(selectionAsync).not.toHaveBeenCalled()
  })

  it('never throws, whether the module throws or rejects', async () => {
    selectionAsync.mockImplementation(() => { throw new Error('no haptics engine') })
    expect(() => selection()).not.toThrow()
    selectionAsync.mockReset()
    selectionAsync.mockRejectedValue(new Error('rejected'))
    expect(() => selection()).not.toThrow()
    await Promise.resolve()
  })
})
