import { useRef, useState, type ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import type { MobileNativeChatViewProps } from './mobile-native-chat-view-props'

type Props = MobileNativeChatViewProps & { onPresentationReady?: () => void }
const styles = StyleSheet.create({
  fill: { flex: 1 },
  preparing: { ...StyleSheet.absoluteFillObject, opacity: 0 }
})

/** Keep the readable cached surface until the new tail has native layout + scroll acknowledgement. */
export function MobileChatSyncPresentation({
  props,
  render
}: {
  props: MobileNativeChatViewProps
  render: (props: Props) => ReactElement
}) {
  const [shownRevision, setShownRevision] = useState(props.initialSyncRevision ?? 0)
  const previous = useRef<{ revision: number; props: MobileNativeChatViewProps }>({
    revision: shownRevision,
    props
  })
  const incoming = props.initialSyncRevision ?? 0
  const expected = useRef(incoming)
  expected.current = incoming
  const staging = incoming !== shownRevision && previous.current.props.messages.length > 0
  if (!staging) {
    previous.current = { revision: incoming, props }
    if (incoming !== shownRevision) {
      setShownRevision(incoming)
    }
  }
  const displayed = staging ? previous.current.props : props
  const revision = staging ? shownRevision : incoming
  return (
    <View style={styles.fill}>
      <View key={revision} style={styles.fill} pointerEvents={staging ? 'none' : 'auto'}>
        {render(displayed)}
      </View>
      {staging ? (
        <View
          key={incoming}
          style={styles.preparing}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {render({
            ...props,
            onPresentationReady: () => {
              if (expected.current !== incoming) {
                return
              }
              previous.current = { revision: incoming, props }
              setShownRevision(incoming)
            }
          })}
        </View>
      ) : null}
    </View>
  )
}
