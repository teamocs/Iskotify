import { act } from '@testing-library/react-native'
import { SHEET_EXIT_MS } from '../components/ui/Sheet'

/**
 * Let an in-place <Sheet> finish its exit animation (iOS redesign P3): it
 * stays mounted for SHEET_EXIT_MS after `visible` turns false. Real timers;
 * the wait runs inside act so the unmount is flushed.
 */
export async function waitForSheetExit(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, SHEET_EXIT_MS + 50))
  })
}
