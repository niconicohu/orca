import { useEffect } from 'react'
import { recordChatDiagnostic, type ChatDiagnosticFacts } from './chat-runtime-diagnostics'

export function useChatRuntimeSnapshot(
  hostId: string,
  scope: string,
  facts: ChatDiagnosticFacts,
  event = 'chat-state'
): void {
  const signature = JSON.stringify(facts)
  useEffect(() => {
    recordChatDiagnostic(hostId, scope, event, facts)
  }, [hostId, scope, signature, event])
}
