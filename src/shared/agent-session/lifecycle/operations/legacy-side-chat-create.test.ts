import { expect, it } from 'vitest'
import { structuredAgentSessionCreateParams } from './structured-agent-session-create'
import { legacySideChatCreateParams } from './legacy-side-chat-create'

// Digests independently calculated against the deployed host's canonical wire contract.
const cases = [
  {
    permission: 'inherit',
    expected: {
      envelope: {
        sessionId: '69f52f6b-fd2f-49fb-8b24-e2c2e35cba72',
        clientOperationId: '1795032000000-11111111111141118111111111111111',
        expectedRuntimeFence: null,
        payloadFingerprint: '6692adf8aa236c803d5c97bb6b43f7ab5f4d1d19df87034d58978aa2f92b7dfc'
      },
      worktree: 'id:workspace',
      agent: 'codex',
      sideChatOf: 'codex_parent_session',
      tabId: 'structured-agent-session-69f52f6b-fd2f-49fb-8b24-e2c2e35cba72',
      tabPlacement: {
        groupId: 'side-group',
        afterTabId: 'source-tab'
      }
    }
  }
] as const

it.each(cases)(
  'preserves the deployed host create/replay contract for $permission',
  ({ permission, expected }) => {
    const params = structuredAgentSessionCreateParams({
      sessionId: '69f52f6b-fd2f-49fb-8b24-e2c2e35cba72',
      randomUuid: () => '11111111-1111-4111-8111-111111111111',
      now: 1795032000000,
      worktree: 'id:workspace',
      agent: 'codex',
      forkFrom: { sessionId: 'codex_parent_session', current: true, permission },
      tabId: 'structured-agent-session-69f52f6b-fd2f-49fb-8b24-e2c2e35cba72',
      tabPlacement: {
        groupId: 'side-group',
        afterTabId: 'source-tab',
        index: 0,
        split: { besideGroupId: 'source-group', direction: 'right' }
      }
    })
    expect(JSON.parse(JSON.stringify(legacySideChatCreateParams(params)))).toEqual(expected)
  }
)
