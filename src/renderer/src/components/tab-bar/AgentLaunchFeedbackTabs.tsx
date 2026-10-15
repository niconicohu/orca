import { useEffect, useRef } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  desktopAgentLaunchFeedback,
  useDesktopAgentLaunchFeedback
} from '@/lib/agent-launch-feedback'

export function AgentLaunchFeedbackTabs({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}) {
  const feedback = useDesktopAgentLaunchFeedback(worktreeId, groupId)
  const selectedTab = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    selectedTab.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [feedback.selected?.id])
  return (
    <>
      {feedback.entries.map((entry) => (
        <button
          ref={feedback.selected?.id === entry.id ? selectedTab : undefined}
          type="button"
          role="tab"
          data-agent-launch-feedback
          key={entry.id}
          aria-selected={feedback.selected?.id === entry.id}
          aria-label={`Creating ${entry.title}`}
          className={cn(
            'flex h-full shrink-0 items-center gap-2 border-r border-border px-3 text-sm text-muted-foreground hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
            feedback.selected?.id === entry.id && 'bg-background text-foreground'
          )}
          onClick={() =>
            desktopAgentLaunchFeedback.select(feedback.scope, entry.id, feedback.marker)
          }
        >
          {entry.error ? null : <LoaderCircle className="size-3.5 animate-spin" />}
          <span>{entry.title}</span>
        </button>
      ))}
    </>
  )
}
