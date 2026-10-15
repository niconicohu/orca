import { requireOptionalNativeModule } from 'expo-modules-core'
import { colors, getMobileColorScheme, type MobileColorScheme } from '../theme/mobile-theme'
const appearance = requireOptionalNativeModule<{
  getSystemColorScheme?: () => MobileColorScheme
  setColorScheme: (scheme: MobileColorScheme, surface: string) => Promise<void>
}>('OrcaMobileAppearance')
export function applyNativeWindowAppearance(scheme: MobileColorScheme): void {
  void appearance?.setColorScheme(scheme, colors.bgBase).catch(() => {})
}

export function refreshNativeWindowAppearance(): void {
  applyNativeWindowAppearance(getMobileColorScheme())
}

export function getNativeSystemColorScheme(): MobileColorScheme | null {
  return appearance?.getSystemColorScheme?.() ?? null
}
