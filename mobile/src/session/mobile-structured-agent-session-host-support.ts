import {
  AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY,
  AGENT_SESSION_SNAPSHOT_LIMIT_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'

/** Structured-session features the connected host advertised; null until the status probe answers. */
export type StructuredAgentSessionHostSupport = {
  snapshotLimit?: boolean
  promptCancel: boolean
  questionAnswers: boolean
}

export function structuredAgentSessionHostSupport(
  capabilities: readonly string[]
): StructuredAgentSessionHostSupport {
  return {
    ...(capabilities.includes(AGENT_SESSION_SNAPSHOT_LIMIT_RUNTIME_CAPABILITY)
      ? { snapshotLimit: true }
      : {}),
    promptCancel: capabilities.includes(AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY),
    questionAnswers: capabilities.includes(AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY)
  }
}
