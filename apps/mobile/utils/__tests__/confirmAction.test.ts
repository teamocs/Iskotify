import { Alert, Platform } from 'react-native'
import { confirmAction } from '../confirmAction'

describe('confirmAction (native)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })
  afterEach(() => alertSpy.mockRestore())

  it('shows an Alert with the given title/message and a Cancel + confirm button', () => {
    const onConfirm = jest.fn()
    confirmAction('Leave the exam?', 'Your progress is saved.', 'Leave', onConfirm)

    expect(alertSpy).toHaveBeenCalledWith(
      'Leave the exam?',
      'Your progress is saved.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Leave' }),
      ]),
    )
  })

  it('calls onConfirm only when the confirm button is pressed', () => {
    const onConfirm = jest.fn()
    confirmAction('Submit exam?', '2 unanswered.', 'Submit', onConfirm)
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]
    expect(onConfirm).not.toHaveBeenCalled()
    buttons.find(b => b.text === 'Submit')!.onPress!()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('honors a custom cancel label', () => {
    confirmAction('Leave the exam?', 'msg', 'Leave', () => {}, { cancelLabel: 'Stay' })
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; style?: string }[]
    expect(buttons.find(b => b.style === 'cancel')?.text).toBe('Stay')
  })

  it('marks the confirm button destructive when requested', () => {
    confirmAction('Submit exam?', 'msg', 'Submit', () => {}, { destructive: true })
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; style?: string }[]
    expect(buttons.find(b => b.text === 'Submit')?.style).toBe('destructive')
  })
})

describe('confirmAction (web)', () => {
  let originalOS: typeof Platform.OS
  beforeAll(() => { originalOS = Platform.OS; Platform.OS = 'web' })
  afterAll(() => { Platform.OS = originalOS })

  it('uses window.confirm instead of Alert.alert (react-native-web Alert is a no-op)', () => {
    // The jest-expo (react-native) test environment has no browser `window`
    // by default — stub the one method confirmAction needs, same as
    // real react-native-web would provide it.
    const confirmFn = jest.fn().mockReturnValue(true)
    ;(global as any).window = { confirm: confirmFn }
    const onConfirm = jest.fn()
    confirmAction('Leave the exam?', 'Your progress is saved.', 'Leave', onConfirm)
    expect(confirmFn).toHaveBeenCalledWith(expect.stringContaining('Leave the exam?'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    delete (global as any).window
  })

  it('does not call onConfirm when window.confirm is dismissed', () => {
    ;(global as any).window = { confirm: jest.fn().mockReturnValue(false) }
    const onConfirm = jest.fn()
    confirmAction('Leave the exam?', 'msg', 'Leave', onConfirm)
    expect(onConfirm).not.toHaveBeenCalled()
    delete (global as any).window
  })
})
