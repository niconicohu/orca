import { CreateIntentParams } from '../../../src/shared/rpc-contract/structured-agent-session-params'
import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { markRpcDeliveryUnknown } from '../transport/rpc/rpc-delivery-ambiguity'
import { createMobileSideChat } from './mobile-side-chat-launch'
import { createMobileStructuredAgentSession } from './mobile-structured-agent-session-launch'
import './mobile-created-structured-sessions'

function clientReturning(
  ...responses: unknown[]
): RpcClient & { sendRequest: ReturnType<typeof vi.fn> } {
  let responseIndex = 0
  const sendRequest = vi.fn(async () => responses[responseIndex++])
  return { sendRequest } as unknown as RpcClient & { sendRequest: ReturnType<typeof vi.fn> }
}

const acceptedCreateResult = {
  ok: true,
  replayed: false,
  fence: 1,
  cursor: { epoch: 'epoch-1', sequence: 0 },
  value: {
    sessionId: 'codex_session_1',
    fence: 1,
    page: {
      sessionId: 'codex_session_1',
      epoch: 'epoch-1',
      direction: 'tail',
      items: [],
      removedItemIds: [],
      submissions: [],
      window: { oldest: null, newest: null, nextCursor: { epoch: 'epoch-1', sequence: 0 } },
      liveCursor: { epoch: 'epoch-1', sequence: 0 },
      hasOlder: false,
      hasNewer: false
    },
    unconfirmedClientMessageIds: []
  }
}
const acceptedCreate = { ok: true, result: acceptedCreateResult }

describe('mobile side chat launch', () => {
  it('preserves picked skill paths and distinguishes uncertain questions by those paths', async () => {
    const client = clientReturning()
    client.sendRequest.mockResolvedValue({
      ok: true,
      result: {
        ok: false,
        refusal: { code: 'agent_session_operation_unknown', message: 'Unconfirmed' }
      }
    })
    const one = [{ name: 'review', path: '/one/SKILL.md' }]
    const two = [{ name: 'review', path: '/two/SKILL.md' }]
    await createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'use $review', one)
    await createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'use $review', two)
    const first = CreateIntentParams.parse(client.sendRequest.mock.calls[0]?.[1])
    const second = CreateIntentParams.parse(client.sendRequest.mock.calls[1]?.[1])
    expect(first.firstMessage?.body.skills).toEqual(one)
    expect(second.firstMessage?.body.skills).toEqual(two)
    expect(second.envelope.clientOperationId).not.toBe(first.envelope.clientOperationId)
  })

  it('does not replay an uncertain create into a different client authority generation', async () => {
    const client = clientReturning()
    let generation = 0
    client.getGeneration = () => generation
    client.sendRequest.mockImplementation(async (method: string, raw: unknown) => {
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      const params = CreateIntentParams.parse(raw)
      return {
        ok: true,
        result: {
          ok: false,
          refusal: { code: 'agent_session_operation_unknown', message: params.envelope.sessionId }
        }
      }
    })
    const open = () =>
      createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'Question')
    const first = await open()
    generation += 1
    const second = await open()
    expect(first).toMatchObject({ kind: 'unknown', sessionId: expect.any(String) })
    expect(second).toMatchObject({ kind: 'unknown', sessionId: expect.any(String) })
    if (first.kind === 'unknown' && second.kind === 'unknown') {
      expect(second.sessionId).not.toBe(first.sessionId)
    }
  })

  it.each(['tabUnconfirmed', 'outcomeUnknown', 'transport'] as const)(
    'recovers a later retry from %s with the original child, operation and question',
    async (reason) => {
      const client = clientReturning()
      let attempts = 0
      const unknownAttempts = reason === 'transport' ? 2 : 1
      client.sendRequest.mockImplementation(async (method: string, raw: unknown) => {
        if (method === 'agentSession.createSupport') {
          return { ok: true, result: { supported: true } }
        }
        const params = CreateIntentParams.parse(raw)
        if (++attempts <= unknownAttempts) {
          if (reason === 'transport') {
            throw new Error('lost acknowledgement')
          }
          return {
            ok: true,
            result: {
              ok: false,
              refusal: {
                code: 'agent_session_operation_unknown',
                message: reason,
                details: { reason }
              }
            }
          }
        }
        return {
          ok: true,
          result: {
            ...acceptedCreateResult,
            value: {
              ...acceptedCreateResult.value,
              sessionId: params.envelope.sessionId,
              firstMessage: { clientMessageId: params.firstMessage?.clientMessageId }
            }
          }
        }
      })
      const open = () =>
        createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'Question')
      const first = await open()
      const creates = () =>
        client.sendRequest.mock.calls
          .filter(([method]) => method === 'agentSession.create')
          .map(([, params]) => CreateIntentParams.parse(params))
      const original = creates()[0]!
      expect(first).toMatchObject({ kind: 'unknown' })
      await expect(open()).resolves.toEqual({
        kind: 'created',
        sessionId: original.envelope.sessionId
      })
      expect(first).toMatchObject({ sessionId: original.envelope.sessionId })
      expect(creates()).toEqual(Array.from({ length: unknownAttempts + 1 }, () => original))
      await expect(open()).resolves.toMatchObject({ kind: 'created' })
      expect(creates().at(-1)?.envelope.sessionId).not.toBe(original.envelope.sessionId)
    }
  )

  it('replays the same child and question after a lost acknowledgement', async () => {
    const client = clientReturning()
    let lost = true
    client.sendRequest.mockImplementation(async (method: string, raw: unknown) => {
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      const params = CreateIntentParams.parse(raw)
      if (lost) {
        lost = false
        throw new Error('acknowledgement lost')
      }
      return {
        ok: true,
        result: {
          ...acceptedCreateResult,
          value: {
            ...acceptedCreateResult.value,
            sessionId: params.envelope.sessionId,
            firstMessage: { clientMessageId: params.firstMessage?.clientMessageId }
          }
        }
      }
    })
    await expect(
      createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'Why this design?')
    ).resolves.toMatchObject({ kind: 'created' })
    expect(client.sendRequest.mock.calls[0]?.[1]).toEqual(client.sendRequest.mock.calls[1]?.[1])
    expect(client.sendRequest.mock.calls[0]?.[1]).toMatchObject({
      sideChatOf: 'codex_parent_123',
      firstMessage: { body: { blocks: [{ type: 'text', text: 'Why this design?' }] } }
    })
  })

  it('keeps an unacknowledged question unknown instead of opening another child', async () => {
    const client = clientReturning(acceptedCreate)
    await expect(
      createMobileSideChat(client, 'folder-1', 'codex', 'codex_parent_123', 'Question')
    ).resolves.toMatchObject({ kind: 'unknown' })
    expect(client.sendRequest).toHaveBeenCalledTimes(1)
  })
})

describe('mobile structured agent-session launch', () => {
  it('keeps the outcome unknown when the idempotent retry cannot be sent', async () => {
    const client = clientReturning({ ok: true, result: { supported: true } })
    client.sendRequest.mockImplementationOnce(async () => ({
      ok: true,
      result: { supported: true }
    }))
    client.sendRequest.mockRejectedValueOnce(markRpcDeliveryUnknown(new Error('response lost')))
    client.sendRequest.mockRejectedValueOnce(new Error('connection interrupted'))

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
    ).resolves.toMatchObject({
      kind: 'unknown'
    })
  })
})

it('settles a proven missing-original fork refusal but keeps a lost earlier attempt unknown', async () => {
  const refusal = {
    ok: true,
    result: {
      ok: false,
      refusal: {
        code: 'agent_session_identity_required',
        details: { reason: 'recordMissing' },
        createAttemptRefusedBeforeCommit: true,
        message: 'Source chat unavailable'
      }
    }
  }
  const client = clientReturning({ ok: true, result: { supported: true } }, refusal)
  const forkFrom = { sessionId: 'copied-chat', throughItemId: 'legacy:opencode:source:reply-1' }
  expect(
    (await createMobileStructuredAgentSession(client, 'workspace-1', 'opencode', forkFrom)).kind
  ).toBe('failed')
  const lost = clientReturning({ ok: true, result: { supported: true } }, refusal)
  lost.sendRequest
    .mockImplementationOnce(async () => ({ ok: true, result: { supported: true } }))
    .mockRejectedValueOnce(markRpcDeliveryUnknown(new Error('reply lost')))
    .mockResolvedValueOnce(refusal)
  expect(
    (await createMobileStructuredAgentSession(lost, 'workspace-1', 'opencode', forkFrom)).kind
  ).toBe('unknown')
})
