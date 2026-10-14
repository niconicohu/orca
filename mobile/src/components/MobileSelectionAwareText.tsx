import { useContext } from 'react'
import { Text, type TextProps } from 'react-native'
import { MobileTextSelectionContext } from './mobile-text-selection-context'
export function MobileSelectionAwareText(props: TextProps): React.JSX.Element {
  const enabled = useContext(MobileTextSelectionContext)
  return <Text {...props} selectable={props.selectable && enabled} />
}
