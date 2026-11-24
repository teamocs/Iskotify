import { Platform } from 'react-native'

/** Reminders are scheduled on the phone; a browser tab cannot, so web never offers them. */
export const remindersSupported = Platform.OS !== 'web'
