import { MessageCircle } from 'lucide-react'
import { wordChatHash, type WordChat } from '../lib/wordChat'

/** 「跟 Emma 聊這個字」: opens a voice chat with Emma that knows the word on the card and the drill he is doing. */
export default function EmmaWordLink(chat: WordChat) {
  return <a className="emma-word" href={'#' + wordChatHash(chat)}><MessageCircle size={14} aria-hidden="true" />跟 Emma 聊這個字</a>
}
