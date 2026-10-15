import { useMemo, useState } from 'react'
import { isRootAgentJournalItem } from '../../../src/shared/agent-session-journal-producer'
import type { AgentSessionLatestTurn } from '../../../src/shared/agent-session-wire'
import { agentJournalTurnBody } from '../../../src/shared/agent-session-turn-record'
import { MOBILE_UNANCHORED_TURN_KEY } from './use-mobile-native-chat-turn-status'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../src/shared/agent-session-journal-types'
import type { NativeChatSettledTurns } from '../../../src/shared/native-chat-turn-status'
import type { StructuredAgentHostClock } from '../../../src/shared/structured-agent-session-reducer'
import {
  selectStructuredAgentRunningTurnTiming,
  selectStructuredAgentSettledTurns,
  readStructuredAgentTurnTiming,
  completedStructuredAgentTurnSeconds
} from '../../../src/shared/structured-agent-session-turn-timing'
import {
  stepStructuredAgentTurnClock,
  type StructuredAgentTurnClockLatch
} from '../../../src/shared/structured-agent-turn-clock-anchor'

/** Host-recorded turn timing for the structured lane: settled durations straight
 *  off the journal, and a skew-free start for the live counter whose host-to-local
 *  conversion is latched once per turn. */
export function useMobileStructuredAgentTurnTiming(
  {
    items,
    submissions,
    hostClock,
    latestTurn
  }: {
    items: readonly AgentJournalRenderItem[]
    submissions: readonly AgentJournalSubmission[]
    latestTurn?: AgentSessionLatestTurn | null
    hostClock?: StructuredAgentHostClock | null
  },
  turnId: string | null
): { settledTurns: NativeChatSettledTurns; workingStartedAt: number | null } {
  const checkpointTiming = useMemo(
    () =>
      latestTurn
        ? readStructuredAgentTurnTiming({
            body: agentJournalTurnBody(latestTurn.turn),
            observedAt: latestTurn.observedAt
          })
        : null,
    [latestTurn]
  )
  const settledTurns = useMemo(() => {
    const settled = new Map(selectStructuredAgentSettledTurns(items, submissions))
    if (latestTurn && latestTurn.turn.state !== 'running') {
      const users = items.filter(
        (item) =>
          item.body.kind === 'message' && item.body.role === 'user' && isRootAgentJournalItem(item)
      )
      const owner = latestTurn.turn.userItemId
      const key =
        users.find((item) => item.itemId === owner)?.itemId ??
        users.at(-1)?.itemId ??
        MOBILE_UNANCHORED_TURN_KEY
      const timing = readStructuredAgentTurnTiming({
        body: agentJournalTurnBody(latestTurn.turn),
        observedAt: latestTurn.observedAt
      })
      const seconds = completedStructuredAgentTurnSeconds(timing)
      settled.set(
        key,
        seconds !== null && timing ? { startedAt: timing.startedAt, workedSeconds: seconds } : null
      )
    }
    return settled
  }, [items, submissions, latestTurn])
  const [latch, setLatch] = useState<StructuredAgentTurnClockLatch | null>(null)
  const runningTiming = useMemo(
    () =>
      turnId === null
        ? null
        : latestTurn?.turn.turnId === turnId
          ? checkpointTiming
          : selectStructuredAgentRunningTurnTiming(items, turnId),
    [items, turnId, latestTurn, checkpointTiming]
  )
  // Stamp during render (React's derive-from-props pattern) so the first paint of
  // a new turn already counts from the right instant.
  const step = stepStructuredAgentTurnClock({
    timing: runningTiming,
    turnId,
    now: Date.now,
    hostClock,
    latch
  })
  if (step.latch !== latch) {
    setLatch(step.latch)
  }
  return { settledTurns, workingStartedAt: step.workingStartedAt }
}
