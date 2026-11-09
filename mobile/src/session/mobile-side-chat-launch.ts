import type { SideChatPermission } from '../../../src/shared/agent-session-side-chat'
import type { AgentJournalSkillRef } from '../../../src/shared/agent-session/journal/agent-session-journal-types'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams,
  type StructuredAgentSessionCreateParams
} from '../../../src/shared/agent-session/structured-agent-session-create'
import { structuredAgentSessionSendBody } from '../../../src/shared/agent-session/requests/structured-agent-session-send-mutation'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { randomV4Uuid } from '../platform/random-v4-uuid'
import { structuredSessionOperationId } from './structured-session-operation-id'
import {
  requestMobileStructuredCreate,
  type MobileStructuredAgentLaunchResult
} from './mobile-structured-agent-session-launch'

const pendingSideChatCreates = new WeakMap<
  RpcClient,
  Map<string, StructuredAgentSessionCreateParams>
>()

function sideChatOpeningMessage(
  question: string | undefined,
  skills: readonly AgentJournalSkillRef[]
): StructuredAgentSessionCreateParams['firstMessage'] {
  return question?.trim()
    ? {
        clientMessageId: structuredSessionOperationId(),
        body: structuredAgentSessionSendBody(question, [], skills)
      }
    : undefined
}

export async function createMobileSideChat(
  client: RpcClient,
  worktreeId: string,
  agent: string,
  sideChatOf: string,
  question?: string,
  skills: readonly AgentJournalSkillRef[] = [],
  permission: SideChatPermission = 'inherit'
): Promise<MobileStructuredAgentLaunchResult> {
  const worktree = `id:${worktreeId}`
  const key = JSON.stringify([
    client.getGeneration?.() ?? 0,
    worktree,
    agent,
    sideChatOf,
    question ?? '',
    skills,
    permission
  ])
  let pending = pendingSideChatCreates.get(client)
  if (!pending) {
    pending = new Map()
    pendingSideChatCreates.set(client, pending)
  }
  const params =
    pending.get(key) ??
    structuredAgentSessionCreateParams({
      sessionId: createStructuredAgentSessionId(agent, randomV4Uuid),
      worktree,
      agent,
      sideChatOf,
      ...(permission === 'read-only' ? { options: { permissionMode: 'read-only' } } : {}),
      firstMessage: sideChatOpeningMessage(question, skills),
      randomUuid: randomV4Uuid
    })
  pending.set(key, params)
  const result = await requestMobileStructuredCreate(client, params)
  if (result.kind === 'unknown') {
    return { ...result, sessionId: params.envelope.sessionId }
  }
  if (pending.get(key) === params) {
    pending.delete(key)
  }
  return result
}
