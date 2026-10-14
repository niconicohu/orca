import type { MobileSessionAttachmentsModel } from './use-mobile-session-attachments'
export function focusCreatedMobileAgentTerminal(
  scope: MobileSessionAttachmentsModel,
  handle: string
): void {
  const previous = scope.activeHandleRef.current
  if (previous && previous !== handle) {
    scope.unsubscribeTerminal(previous)
    scope.initializedHandlesRef.current.delete(previous)
  }
  const tab = scope.sessionTabsRef.current.find(
    (candidate) => candidate.type === 'terminal' && candidate.terminal === handle
  )
  scope.pendingActiveTerminalHandleRef.current = handle
  scope.pendingActiveSessionTabIdRef.current = tab?.id ?? null
  scope.activeSessionTabIdRef.current = tab?.id ?? null
  scope.setActiveSessionTabId(tab?.id ?? null)
  scope.activeHandleRef.current = handle
  scope.setActiveHandle(handle)
  scope.subscribeToTerminal(handle)
  void scope.fetchSessionTabs()
}
