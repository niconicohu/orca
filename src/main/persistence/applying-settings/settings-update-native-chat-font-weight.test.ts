import { expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import { updateSettings, type SettingsMutationOperations } from './settings-update'

function makeOperations(): SettingsMutationOperations {
  return {
    state: getDefaultPersistedState('/tmp'),
    bumpLocalWorktreeScanGeneration: vi.fn(),
    removeRetainedBlob: vi.fn(),
    scheduleSave: vi.fn(),
    notifySettingsChanged: vi.fn()
  }
}

it('clamps chat weight for every settings writer and preserves it across unrelated updates', () => {
  const operations = makeOperations()
  expect(updateSettings(operations, { nativeChatFontWeight: 900 }).nativeChatFontWeight).toBe(500)
  expect(updateSettings(operations, { terminalFontSize: 15 }).nativeChatFontWeight).toBe(500)
  expect(updateSettings(operations, { nativeChatFontWeight: undefined }).nativeChatFontWeight).toBe(
    400
  )
  expect(operations.scheduleSave).toHaveBeenCalled()
})
