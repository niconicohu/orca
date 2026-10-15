export const MOBILE_CHAT_FIRST_FRAME_GRACE_MS = 0
export const MOBILE_CHAT_FIRST_READ_TIMEOUT_MS = 8000

/** A bounded recent-history read runs alongside the live subscription. */
export function startMobileChatFirstRead<T>(args: {
  graceMs?: number
  read: () => Promise<T>
  apply: (value: T) => void
  fail: (error: Error) => void
}): () => void {
  let ended = false
  let deadline: ReturnType<typeof setTimeout> | null = null
  const fail = (error: unknown): void => {
    if (ended) {
      return
    }
    stop()
    args.fail(error instanceof Error ? error : new Error(String(error)))
  }
  const timer = setTimeout(() => {
    deadline = setTimeout(
      () => fail(new Error('Chat history timed out. Reopen the chat to retry.')),
      MOBILE_CHAT_FIRST_READ_TIMEOUT_MS
    )
    void Promise.resolve()
      .then(args.read)
      .then((value) => {
        if (ended) {
          return
        }
        try {
          args.apply(value)
          stop()
        } catch (error) {
          fail(error)
        }
      }, fail)
  }, args.graceMs ?? MOBILE_CHAT_FIRST_FRAME_GRACE_MS)
  function stop(): void {
    ended = true
    clearTimeout(timer)
    if (deadline !== null) {
      clearTimeout(deadline)
    }
  }
  return stop
}
