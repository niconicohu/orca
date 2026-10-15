import { focusedChatInput, blurLeavingChatInput } from './retained-chat-input-focus'
import { isValidElement, useLayoutEffect, useRef, type ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'

const MAX_RETAINED_VIEWS = 4
const MAX_INACTIVE_BYTES = 8 * 1024 * 1024
const transcriptSizes = new WeakMap<object, number>()
function transcriptBytes(element: ReactElement): number {
  const props = element.props
  if (
    !props ||
    typeof props !== 'object' ||
    !('messages' in props) ||
    !Array.isArray(props.messages)
  ) {
    if (
      props &&
      typeof props === 'object' &&
      'children' in props &&
      isValidElement(props.children)
    ) {
      return transcriptBytes(props.children)
    }
    return 0
  }
  let size = transcriptSizes.get(props.messages)
  if (size === undefined) {
    size = JSON.stringify(props.messages).length * 2
    transcriptSizes.set(props.messages, size)
  }
  return size
}
const styles = StyleSheet.create({ fill: StyleSheet.absoluteFillObject, hidden: { opacity: 0 } })

/** Retain native list instances, not only messages, so a tab return needs no initial layout gate. */
export function RetainedMobileChatViews({
  activeKey,
  view,
  liveKeys
}: {
  activeKey: string | null
  view: ReactElement
  liveKeys?: readonly string[]
}) {
  const views = useRef(new Map<string, ReactElement>())
  const leavingInput = useRef<unknown>(null)
  useLayoutEffect(() => {
    const previous = leavingInput.current
    leavingInput.current = null
    blurLeavingChatInput(previous)
    return () => {
      leavingInput.current = focusedChatInput()
    }
  }, [activeKey])
  if (liveKeys) {
    const live = new Set(liveKeys)
    for (const key of views.current.keys()) {
      if (!live.has(key)) {
        views.current.delete(key)
      }
    }
  }
  if (activeKey) {
    views.current.delete(activeKey)
    views.current.set(activeKey, view)
    let bytes = 0
    for (const [key, element] of [...views.current].toReversed()) {
      if (key === activeKey) {
        continue
      }
      const size = transcriptBytes(element)
      if (bytes + size > MAX_INACTIVE_BYTES) {
        views.current.delete(key)
      } else {
        bytes += size
      }
    }
    while (views.current.size > MAX_RETAINED_VIEWS) {
      const oldest = views.current.keys().next().value
      if (oldest !== undefined) {
        views.current.delete(oldest)
      }
    }
  }
  return (
    <View
      style={[styles.fill, !activeKey && styles.hidden]}
      pointerEvents={activeKey ? 'auto' : 'none'}
    >
      {[...views.current].map(([key, element]) => (
        <View
          key={key}
          style={[styles.fill, key !== activeKey && styles.hidden]}
          pointerEvents={key === activeKey ? 'auto' : 'none'}
          accessibilityElementsHidden={key !== activeKey}
          importantForAccessibility={key === activeKey ? 'auto' : 'no-hide-descendants'}
        >
          {element}
        </View>
      ))}
    </View>
  )
}
