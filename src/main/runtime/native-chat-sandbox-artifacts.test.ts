import { describe, expect, it, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { nativeChatTranscriptIncludesPath } from '../native-chat/native-chat-file-provenance'
import {
  createRuntimeFileCommands,
  useRuntimeFileCommandsLifecycle
} from './orca-runtime-files-test-harness'
import {
  absoluteFileTarget,
  useTerminalArtifactTempFiles
} from './orca-runtime-files-terminal-artifact-fixtures'
import type { RuntimeNativeChatFileContext } from '../../shared/runtime-types'

vi.mock('fs', async () => (await import('./orca-runtime-files-mock-registry')).fsModuleMock())
vi.mock('fs/promises', async () =>
  (await import('./orca-runtime-files-mock-registry')).fsPromisesModuleMock()
)
vi.mock(
  './file-watcher-host',
  async () => (await import('./orca-runtime-files-mock-registry')).fileWatcherHostMock
)
vi.mock('../ipc/filesystem-auth', async () =>
  (await import('./orca-runtime-files-mock-registry')).filesystemAuthModuleMock()
)
vi.mock('../git/runner', async () =>
  (await import('./orca-runtime-files-mock-registry')).gitRunnerModuleMock()
)
vi.mock(
  '../ipc/local-worktree-runtime-options',
  async () => (await import('./orca-runtime-files-mock-registry')).localWorktreeRuntimeOptionsMock
)

describe('sandbox artifacts authorized by their actual chat Markdown', () => {
  useRuntimeFileCommandsLifecycle()
  const { tempFile } = useTerminalArtifactTempFiles()

  it.each([
    [
      'png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=',
        'base64'
      )
    ],
    ['pdf', Buffer.from('%PDF-1.4\n%%EOF')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ['csv', Buffer.from('round,score\n1,97.1\n')]
  ])('grants and reads the exact out-of-workspace %s file', async (extension, bytes) => {
    const file = await tempFile(`result.${extension}`, '')
    await writeFile(file, bytes)
    const context = { tabId: 'chat-tab', sessionId: 'session-1' }
    const { commands } = createRuntimeFileCommands({
      path: '/repo',
      hasRecentNativeChatOutputPath: vi.fn(
        (
          _worktree: string,
          requested: RuntimeNativeChatFileContext,
          pathText: string,
          absolutePath: string
        ) =>
          nativeChatTranscriptIncludesPath({
            tabs: [
              {
                type: 'agent-session',
                id: 'chat-tab',
                sessionId: 'session-1',
                agent: 'codex',
                title: 'Chat',
                isActive: true
              }
            ],
            context: requested,
            pathText,
            absolutePath,
            readStructuredMessages: async () => [
              {
                role: 'assistant',
                blocks: [{ type: 'text', text: `![Result](sandbox:${encodeURI(file)})` }]
              }
            ]
          })
      )
    })
    const resolved = await commands.resolveTerminalPath(
      'id:wt-1',
      file,
      null,
      'client-a',
      null,
      true,
      context
    )
    const target = absoluteFileTarget(resolved)
    const preview = await commands.readTerminalArtifactPreview(
      'id:wt-1',
      target.grantId,
      target.absolutePath,
      'client-a'
    )
    expect(Buffer.from(preview.content, preview.isBinary ? 'base64' : 'utf8')).toEqual(bytes)
    await expect(
      commands.readTerminalArtifactPreview(
        'id:wt-1',
        target.grantId,
        target.absolutePath,
        'client-b'
      )
    ).rejects.toThrow('terminal_file_grant_mismatch')
    const forged = await commands.resolveTerminalPath(
      'id:wt-1',
      file,
      null,
      'client-a',
      null,
      true,
      { tabId: 'chat-tab', sessionId: 'another-session' }
    )
    expect(forged.openTarget).toBeUndefined()
  })
})
