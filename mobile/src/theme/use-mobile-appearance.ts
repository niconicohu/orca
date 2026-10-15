import { useEffect, useSyncExternalStore } from 'react'
import { Appearance, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyNativeWindowAppearance } from '../platform/native-window-appearance'
import { applyMobileColorScheme } from './mobile-theme'
import {
  createMobileAppearanceController,
  type MobileAppearance
} from './mobile-appearance-controller'

const APPEARANCE_KEY = 'orca:appearance'
let nativePreference: MobileAppearance | null = null
const controller = createMobileAppearanceController({
  read: () => AsyncStorage.getItem(APPEARANCE_KEY),
  write: (value) => AsyncStorage.setItem(APPEARANCE_KEY, value),
  systemScheme: () => Appearance.getColorScheme(),
  setNativePreference: (preference) => {
    // The Android shell handles uiMode changes in place; native controls can follow too.
    if (Platform.OS !== 'web' && nativePreference !== preference) {
      nativePreference = preference
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
    }
  },
  onSystemChange: (listener) => {
    const subscription = Appearance.addChangeListener(listener)
    return () => subscription.remove()
  },
  apply: (scheme) => {
    applyMobileColorScheme(scheme)
    applyNativeWindowAppearance(scheme)
  }
})

export function useMobileAppearance() {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  )
  useEffect(() => {
    void controller.start()
  }, [])
  return { ...state, setPreference: controller.setPreference }
}
