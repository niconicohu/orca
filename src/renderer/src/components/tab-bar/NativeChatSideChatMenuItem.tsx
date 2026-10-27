import { CornerDownRight } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import type { structuredAgentSessionTargetForTab } from '@/runtime/structured-agent-session-owner'
import { useNativeChatSideChat } from '../native-chat/use-native-chat-side-chat'
import type { NativeChatTabSession } from './tab-session-history-switch'
import { translate } from '@/i18n/i18n'
import { useMemo } from 'react'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'

export function NativeChatSideChatMenuItem({
  tab,
  nativeChat,
  onComplete
}: {
  tab: { id: string; worktreeId: string }
  nativeChat: NativeChatTabSession
  onComplete?: () => void
}) {
  const host = useAppStore((state) => {
    const source = state.unifiedTabsByWorktree[tab.worktreeId]?.find((entry) => entry.id === tab.id)
    return source ? structuredAgentSessionOwnerForTab(state, source) : null
  })
  const target = useMemo(() => structuredAgentSessionTargetForHost(host), [host])
  return target ? (
    <SideChatItem target={target} tab={tab} nativeChat={nativeChat} onComplete={onComplete} />
  ) : null
}

function SideChatItem({
  target,
  tab,
  nativeChat,
  onComplete
}: Parameters<typeof NativeChatSideChatMenuItem>[0] & {
  target: NonNullable<ReturnType<typeof structuredAgentSessionTargetForTab>>
}) {
  const open = useNativeChatSideChat({
    target,
    agent: nativeChat.agent ?? '',
    sessionId: nativeChat.sessionId,
    tabId: tab.id,
    worktreeId: tab.worktreeId
  })
  return open ? (
    <DropdownMenuItem
      onSelect={() => {
        onComplete?.()
        void open('')
      }}
    >
      <CornerDownRight />
      {translate('components.native-chat.sideChat.new', 'New side chat')}
    </DropdownMenuItem>
  ) : null
}
