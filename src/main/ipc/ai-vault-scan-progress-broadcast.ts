import { BrowserWindow, ipcMain } from 'electron'
import { AI_VAULT_SCAN_PROGRESS_CHANNEL } from '../../shared/ai-vault-scan-progress'
import {
  localAiVaultScanProgress,
  onLocalAiVaultScanProgress
} from '../ai-vault/ai-vault-local-scan-progress'

let unsubscribe: (() => void) | null = null

/** Every window follows this computer's scan; one that opens later asks for where it stands. */
export function registerAiVaultScanProgressBroadcast(): void {
  ipcMain.handle('aiVault:getScanProgress', () => localAiVaultScanProgress())
  unsubscribe?.()
  unsubscribe = onLocalAiVaultScanProgress((progress) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(AI_VAULT_SCAN_PROGRESS_CHANNEL, progress)
      }
    }
  })
}
