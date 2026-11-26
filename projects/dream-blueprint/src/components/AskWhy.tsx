import { MessageCircleQuestion } from 'lucide-react'
import { tutorKey } from '../lib/tutor'
import { askClaude, whyQuestion, type WhyQuestion } from '../lib/taskContext'

/** 「問 Claude 為什麼」 under an answered question: Claude explains his own answer from the question itself, and he can
 *  ask on in the chat. It comes after the answer, so the first result stays as it was recorded; while the answer is not
 *  right yet, the right one goes to Claude only, for a hint. */
export default function AskWhy({ q, label = '問 Claude 為什麼' }: { q: WhyQuestion; label?: string }) {
  if (!tutorKey()) return null
  return <button type="button" className="pr-link ask-why" onClick={() => { const w = whyQuestion(q); askClaude(w.text, { general: true, hidden: w.hidden }) }}>
    <MessageCircleQuestion size={14} aria-hidden="true" />{label}
  </button>
}
