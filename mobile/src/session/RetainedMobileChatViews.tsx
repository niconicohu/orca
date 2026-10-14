import { useRef, type ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'

const MAX_RETAINED_VIEWS = 4
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
