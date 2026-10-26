import { commitStructuredAgentSessionCreate } from './structured-agent-session-create-commit'
export { commitStructuredAgentSessionCreate } from './structured-agent-session-create-commit'
// Resolve the host launch identity, then commit an at-rest create or the compatible acquired path.

import { AGENT_CHAT_PERMISSION_MODE_OPTION_ID } from '../../../../shared/agent-chat-permission-mode'
import { AgentSessionRefusalError } from '../../../../shared/agent-session-wire-refusals'
import { computeAgentSessionPayloadFingerprint } from '../../../../shared/agent-session-mutation-envelope'
import type {
  AgentSessionAttachResult,
  AgentSessionMutationEnvelope,
  AgentSessionMutationResult
} from '../../../../shared/agent-session-wire'
import {
  attachFingerprintFields,
  type AgentSessionAttachParams
} from '../../../native-chat/agent-session-wire/structured-agent-session-attach'
import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredAgentSessionCaller } from '../../../native-chat/agent-session-wire/structured-agent-session-host-types'
import type {
  StructuredAgentSessionResumeSource,
  StructuredAgentSessionFirstMessage
} from '../../../../shared/structured-agent-session-create'
import { structuredAgentSessionOptionOverridesRefusal } from '../../../native-chat/agent-session-wire/structured-agent-session-options-read'
import { savedAgentSessionCatalogModels } from '../../../native-chat/agent-session-wire/structured-agent-session-pick-reply'
import type { StructuredAgentSessionCreateOptions } from '../../../native-chat/agent-session-wire/structured-agent-session-create'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  captureStructuredAgentCliSource,
  type StructuredAgentCliSourceEvidence
} from '../../../native-chat/structured-agent-cli-source'
import type { StructuredAgentId } from '../../../../shared/agent-session-provider-handle'
import {
  resolveUncommittedStructuredCreate,
  type StructuredCreateRefused
} from './structured-agent-session-precommit-refusal'
import { structuredLaunchSeedOnSavedListing } from '../../session-tabs/structured-launch-seed-listing'
import { seedOptionsAdmittedOnSavedListing } from '../../agent-session-record-options'

export type PreparedStructuredAgentSessionCreate = {
  host: StructuredAgentSessionHost
  attachParams: AgentSessionAttachParams
  hostLaunchDirectory?: string
  catalogModels?: StructuredAgentSessionCreateOptions['catalogModels']
  /** Null when the caller supplied its own location; only a resolved worktree publishes a tab. */
  tab: { workspaceId: string; agent: StructuredAgentId } | null
  /** Absent for older clients and provider-dependent in-process callers. */
  atRest?: { firstMessage?: StructuredAgentSessionFirstMessage }
  firstMessage?: StructuredAgentSessionFirstMessage
}

/** New creates keep the immutable client intent in the ledger; legacy creates keep attach identity. */
export function structuredAgentSessionCreateIntentFingerprint(params: {
  envelope: AgentSessionMutationEnvelope
  worktree: string
  agent: string
  resumeFrom?: StructuredAgentSessionResumeSource
  sideChatOf?: string
  tabId?: string
  firstMessage?: StructuredAgentSessionFirstMessage
  options?: Readonly<Record<string, string>>
}): string {
  return computeAgentSessionPayloadFingerprint({
    method: 'agentSession.create',
    sessionId: params.envelope.sessionId,
    fields: {
      worktree: params.worktree,
      agent: params.agent,
      resumeFrom: params.resumeFrom,
      sideChatOf: params.sideChatOf,
      tabId: params.tabId,
      firstMessage: params.firstMessage,
      options: params.options
    }
  })
}

/** Run throwing pre-commit work inside resolveUncommittedStructuredCreate so clients receive a no-effects refusal. */
export async function prepareStructuredAgentSessionCreateForWorktree(args: {
  runtime: OrcaRuntimeService
  /** Installs the host lazily; called at the same point the RPC handler always installed it. */
  ensureHost: () => Promise<StructuredAgentSessionHost>
  envelope: AgentSessionMutationEnvelope
  worktree: string
  agent: StructuredAgentId
  caller: StructuredAgentSessionCaller
  resumeFrom?: StructuredAgentSessionResumeSource
  sideChatOf?: string
  structuredAgentCliSourceEvidence?: StructuredAgentCliSourceEvidence
  /** Explicit picks override seed keys at rest; acquired in-process launches replace the seed. */
  options?: Readonly<Record<string, string>>
  /** Use the caller-reserved tab id at publication; absent, derive the legacy id. Keep it outside launch fingerprints. */
  tabId?: string
  firstMessage?: StructuredAgentSessionFirstMessage
  atRest?: boolean
}): Promise<PreparedStructuredAgentSessionCreate> {
  const structuredAgentCliSourceEvidence =
    args.structuredAgentCliSourceEvidence ??
    (args.resumeFrom?.cliSource
      ? captureStructuredAgentCliSource(() => args.runtime.getAgentProviderSessionRows())
      : undefined)
  // Adoption replay may need the record loaded from disk before source discovery can be skipped.
  let host = args.resumeFrom || args.sideChatOf ? await args.ensureHost() : null
  const resolved = await args.runtime.resolveStructuredAgentSessionCreateIntent({
    envelope: args.envelope,
    worktree: args.worktree,
    agent: args.agent,
    callerKey: args.caller.callerKey,
    structuredAgentCliSourceEvidence,
    ...(args.resumeFrom ? { resumeFrom: args.resumeFrom } : {}),
    ...(args.sideChatOf ? { sideChatOf: args.sideChatOf } : {})
  })
  const attachFingerprint = computeAgentSessionPayloadFingerprint({
    method: 'agentSession.attach',
    sessionId: args.envelope.sessionId,
    fields: attachFingerprintFields({
      ...resolved,
      envelope: args.envelope,
      ...(args.sideChatOf && args.firstMessage ? { createMessage: args.firstMessage } : {})
    })
  })
  host ??= await args.ensureHost()
  const priorOperation =
    args.atRest === undefined
      ? null
      : host.deps.store.getOperationRow(args.caller.callerKey, args.envelope.clientOperationId)
  // A capability update cannot change the contract of an already-recorded create.
  const legacyReplay =
    args.firstMessage === undefined &&
    args.options === undefined &&
    priorOperation?.fingerprint === attachFingerprint
  const atRest =
    !args.sideChatOf &&
    args.atRest !== undefined &&
    (priorOperation?.fingerprint === args.envelope.payloadFingerprint ||
      (args.atRest === true && !legacyReplay))
  const hostFingerprint = atRest ? args.envelope.payloadFingerprint : attachFingerprint
  if (atRest && args.options) {
    const refusal = structuredAgentSessionOptionOverridesRefusal(
      host.deps.agents,
      args.agent,
      args.options
    )
    if (refusal) {
      throw new AgentSessionRefusalError(refusal)
    }
  }
  const {
    agent: _resolvedAgent,
    provider: _resolvedProvider,
    hostLaunchDirectory,
    ...resolvedAttach
  } = resolved
  // Fingerprint explicit picks, never replay-varying defaults; explicit options replace saved seeds, while permission default stays chat-owned.
  const picked = args.options
    ? atRest
      ? { ...resolved.options, ...args.options }
      : { ...seededPermissionMode(resolved.options), ...args.options }
    : resolved.options
  // Resolve picker cwd once so seed selection and host admission read the same catalog.
  let folder: Promise<string | null> | undefined
  const catalogFolder = () =>
    (folder ??= args.runtime
      .resolveStructuredAgentSessionLocalWorkspacePath(args.worktree)
      .catch(() => null))
  // After fingerprinting, remap stale remembered model/effort against saved listing; never remap an explicit model.
  const options = args.options?.model
    ? picked
    : await structuredLaunchSeedOnSavedListing(host, args.agent, picked, catalogFolder)
  const catalogModels =
    options && host.deps.modelCatalog
      ? await savedAgentSessionCatalogModels(
          host.deps,
          resolved.provider,
          args.envelope.sessionId,
          await catalogFolder()
        )
      : undefined
  // Fit remembered values to the saved row instead of refusing the create (#31493).
  const admittedSeed =
    options && catalogModels && !args.options?.model
      ? seedOptionsAdmittedOnSavedListing(
          resolved.provider,
          options,
          catalogModels,
          new Set(Object.keys(args.options ?? {}))
        )
      : options
  return {
    host,
    ...(catalogModels ? { catalogModels } : {}),
    ...(hostLaunchDirectory ? { hostLaunchDirectory } : {}),
    attachParams: {
      ...resolvedAttach,
      ...(args.sideChatOf && args.firstMessage ? { createMessage: args.firstMessage } : {}),
      ...(admittedSeed ? { options: admittedSeed } : {}),
      ...(args.tabId ? { surfaceTabId: args.tabId } : {}),
      provider: resolved.provider,
      agent: resolved.agent,
      envelope: { ...args.envelope, payloadFingerprint: hostFingerprint }
    },
    ...(atRest ? { atRest: args.firstMessage ? { firstMessage: args.firstMessage } : {} } : {}),
    ...(!atRest && args.sideChatOf && args.firstMessage ? { firstMessage: args.firstMessage } : {}),
    tab: {
      workspaceId: resolved.location.workspaceId,
      agent: resolved.agent
    }
  }
}

export async function createStructuredAgentSessionForWorktree(args: {
  runtime: OrcaRuntimeService
  ensureHost: () => Promise<StructuredAgentSessionHost>
  caller: StructuredAgentSessionCaller
  envelope: AgentSessionMutationEnvelope
  worktree: string
  agent: StructuredAgentId
  activate: boolean
  options?: Readonly<Record<string, string>>
  tabId?: string
  /** Create without starting the agent; its first message starts it. */
  atRest?: true
}): Promise<AgentSessionMutationResult<AgentSessionAttachResult>> {
  // An at-rest create's ledger row is keyed by its intent, as a client's create is.
  const envelope = args.atRest
    ? {
        ...args.envelope,
        payloadFingerprint: structuredAgentSessionCreateIntentFingerprint(args)
      }
    : args.envelope
  const prepared: PreparedStructuredAgentSessionCreate | StructuredCreateRefused =
    await resolveUncommittedStructuredCreate(() =>
      prepareStructuredAgentSessionCreateForWorktree({ ...args, envelope })
    )
  if ('refusal' in prepared) {
    return { ok: false, refusal: prepared.refusal }
  }
  return commitStructuredAgentSessionCreate({
    runtime: args.runtime,
    caller: args.caller,
    prepared,
    activate: args.activate
  })
}

function seededPermissionMode(
  options: Readonly<Record<string, string>> | undefined
): Record<string, string> {
  const mode = options?.[AGENT_CHAT_PERMISSION_MODE_OPTION_ID]
  return mode ? { [AGENT_CHAT_PERMISSION_MODE_OPTION_ID]: mode } : {}
}
