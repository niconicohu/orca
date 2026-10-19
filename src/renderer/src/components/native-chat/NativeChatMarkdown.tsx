import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { withoutPendingNativeChatVisualDirectiveTail } from '../../../../shared/native-chat-visual-directive'
import { NativeChatMarkdownRowKeyContext } from './native-chat-disclosure-store'
import { useNativeChatVisualMarkdownExtension } from './native-chat-visual-markdown-extension'
import { useNativeChatFileLinkExists } from './use-native-chat-file-link-existence'
import './native-chat-markdown.css'
import {
  NativeChatResourceRenderContext,
  useNativeChatResourceMarkdownExtension
} from './native-chat-resource-markdown'
import { selectCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'

/** Existing words stay opaque when a reply first starts growing. */
function useWordFadeArmed(fadeWords: boolean): boolean {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!fadeWords) {
      setArmed(false)
      return
    }
    const frame = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(frame)
  }, [fadeWords])
  return armed && fadeWords
}

type NativeChatMarkdownProps = Omit<ComponentProps<typeof CommentMarkdown>, 'fileLinkExists'> & {
  /** Underline file paths in the text that exist in the chat's workspace. */
  linkifyFilePaths?: boolean
  visualMessageId?: string
  streaming?: boolean
  /** The transcript row's identity, so reader choices inside the text outlive the row's mount. */
  rowKey?: string
}

export function NativeChatMarkdown({
  className,
  linkifyFilePaths = false,
  fadeWords = false,
  visualMessageId,
  streaming = false,
  rowKey,
  content,
  ...props
}: NativeChatMarkdownProps): React.JSX.Element {
  const wordFadeArmed = useWordFadeArmed(fadeWords)
  const visualExtension = useNativeChatVisualMarkdownExtension(visualMessageId)
  const extension = useNativeChatResourceMarkdownExtension(visualExtension)
  const { variant = 'compact', expandImages = false, onLinkClick, renderCodeBlock } = props
  const resourceRenderContext = useMemo(
    () => ({
      onLinkClick,
      Image:
        visualExtension?.components.img ??
        selectCommentMarkdownComponents({
          variant,
          expandImages,
          onLinkClick,
          renderCodeBlock
        }).img
    }),
    [visualExtension, variant, expandImages, onLinkClick, renderCodeBlock]
  )
  const fileLinkExists = useNativeChatFileLinkExists(linkifyFilePaths, streaming)
  return (
    <NativeChatMarkdownRowKeyContext.Provider value={rowKey}>
      <NativeChatResourceRenderContext.Provider value={resourceRenderContext}>
        <CommentMarkdown
          {...props}
          content={
            visualExtension && streaming
              ? withoutPendingNativeChatVisualDirectiveTail(content)
              : content
          }
          extension={extension}
          fileLinkExists={fileLinkExists}
          fadeWords={fadeWords}
          renderMermaid={!streaming}
          keepMermaidSourceWhilePending
          data-word-fade={wordFadeArmed ? '' : undefined}
          data-block-fade={wordFadeArmed && streaming ? '' : undefined}
          className={cn('native-chat-markdown', className)}
        />
      </NativeChatResourceRenderContext.Provider>
    </NativeChatMarkdownRowKeyContext.Provider>
  )
}
