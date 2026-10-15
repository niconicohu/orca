import { useEffect, useRef } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from './ui/button'
import { RetainedPaneHost } from './tab-group/RetainedPaneHost'
import { useAppStore } from '@/store'
import type { TabGroup } from '../../../shared/tab-types'
import {
  desktopAgentLaunchFeedback,
  useDesktopAgentLaunchFeedback
} from '@/lib/agent-launch-feedback'

const EMPTY_GROUPS: readonly TabGroup[] = []
function PendingPane({
  worktreeId,
  groupId,
  visible,
  unanchored = false
}: {
  worktreeId: string
  groupId: string
  visible: boolean
  unanchored?: boolean
}) {
  const feedback = useDesktopAgentLaunchFeedback(worktreeId, groupId)
  const entry = feedback.selected
  const pane = useRef<HTMLDivElement | null>(null)
  const entryId = entry?.id
  useEffect(() => {
    if (entryId && visible) {
      pane.current?.focus({ preventScroll: true })
    }
  }, [entryId, visible])
  if (!entry) {
    return null
  }
  const body = (
    <div
      ref={pane}
      tabIndex={-1}
      className="flex size-full flex-col items-center justify-center gap-3 bg-background p-6 text-sm text-foreground"
      role="status"
    >
      {entry.error ? null : <LoaderCircle className="size-5 animate-spin text-muted-foreground" />}
      <p>{entry.error ? `Could not open ${entry.title}` : `Creating ${entry.title}…`}</p>
      <p className="text-muted-foreground">
        {entry.error ?? 'Waiting for the host to prepare the session.'}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => desktopAgentLaunchFeedback.remove(feedback.scope, entry.id)}
      >
        Hide progress
      </Button>
    </div>
  )
  return unanchored ? (
    visible ? (
      <div className="absolute inset-0 z-10">{body}</div>
    ) : null
  ) : (
    <RetainedPaneHost groupId={groupId} isVisible={visible}>
      {body}
    </RetainedPaneHost>
  )
}
export function AgentLaunchFeedbackOverlays({
  worktreeId,
  visible
}: {
  worktreeId: string
  visible: boolean
}) {
  const groups = useAppStore((state) => state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS)
  return groups.length === 0 ? (
    <PendingPane worktreeId={worktreeId} groupId={worktreeId} visible={visible} unanchored />
  ) : (
    <>
      {groups.map((group) => (
        <PendingPane key={group.id} worktreeId={worktreeId} groupId={group.id} visible={visible} />
      ))}
    </>
  )
}
