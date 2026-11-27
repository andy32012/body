import { MessageCircle } from 'lucide-react'
import { wordChatHash, type WordChat } from '../lib/wordChat'

/** 「跟 Emma 聊這個字」: opens a voice chat with Emma that knows the word on the card and the drill he is doing. */
export default function EmmaWordLink({ beforeOpen, ...chat }: WordChat & { beforeOpen?: () => void }) {
  return <a className="emma-word" href={'#' + wordChatHash(chat)} onClick={event => {
    if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) beforeOpen?.()
  }}><MessageCircle size={14} aria-hidden="true" />跟 Emma 聊這個字</a>
}
