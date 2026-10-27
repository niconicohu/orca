import { z } from 'zod'

export const AGENT_SESSION_SIDE_CHAT_RUNTIME_CAPABILITY = 'agent-session.side-chat.v1' as const

export const AgentSessionSideChatSchema = z.strictObject({
  sourceSessionId: z.string().min(8).max(128),
  sourceProviderSessionId: z.string().min(1).max(512)
})

export type AgentSessionSideChat = z.infer<typeof AgentSessionSideChatSchema>
