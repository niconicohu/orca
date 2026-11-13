import type { RuntimeMobileTerminalTheme } from '../../../../src/shared/runtime-mobile-session-tab-contracts'

export function mobileTerminalThemesEqual(
  left: RuntimeMobileTerminalTheme | null | undefined,
  right: RuntimeMobileTerminalTheme | null | undefined
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right || left.mode !== right.mode) {
    return false
  }
  const leftColors = left.theme as Readonly<Record<string, unknown>>
  const rightColors = right.theme as Readonly<Record<string, unknown>>
  for (const color in leftColors) {
    if (
      Object.hasOwn(leftColors, color) &&
      (!Object.hasOwn(rightColors, color) || leftColors[color] !== rightColors[color])
    ) {
      return false
    }
  }
  for (const color in rightColors) {
    if (Object.hasOwn(rightColors, color) && !Object.hasOwn(leftColors, color)) {
      return false
    }
  }
  return true
}
