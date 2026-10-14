import { TextInput } from 'react-native'

export function focusedChatInput(): unknown {
  const state = TextInput?.State
  if (!state) {
    return null
  }
  if (typeof state.currentlyFocusedInput === 'function') {
    return state.currentlyFocusedInput()
  }
  if ('currentlyFocusedField' in state && typeof state.currentlyFocusedField === 'function') {
    return state.currentlyFocusedField()
  }
  return null
}

export function blurLeavingChatInput(previous: unknown): void {
  if (
    previous &&
    focusedChatInput() === previous &&
    typeof previous === 'object' &&
    'blur' in previous &&
    typeof previous.blur === 'function'
  ) {
    previous.blur()
  }
}
