import { useEffect, useRef, useSyncExternalStore } from 'react'

/** What the learner is working on right now, so the floating Claude chat can help with this exact task. */
export interface TaskContext {
  /** Short line shown in the chat: 「正在協助：…」 */
  label: string
  /** Everything Claude needs: the task, the rule, the reference (for Claude only). */
  detail: string
  /** The current draft, read when a message is sent. */
  draft?: string
}

let current: TaskContext | null = null
let owner: symbol | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

export function currentTask() { return current }
export function useCurrentTask() {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => current, () => null)
}

/** Register the task shown on screen; it is cleared when the component goes away. */
export function useTaskContext(ctx: TaskContext | null) {
  const id = useRef(Symbol('task'))
  const label = ctx?.label, detail = ctx?.detail, draft = ctx?.draft
  useEffect(() => {
    if (!ctx) return
    const same = current && owner === id.current && current.label === ctx.label && current.detail === ctx.detail
    current = { label: ctx.label, detail: ctx.detail, draft: ctx.draft }
    owner = id.current
    // Typing changes only the draft; the label line does not need to re-render the chat.
    if (!same) emit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, detail, draft])
  useEffect(() => () => { if (owner === id.current) { current = null; owner = null; emit() } }, [])
}

/** The text appended to the chat's system prompt while a task is on screen. */
export function taskPrompt(t: TaskContext | null) {
  if (!t) return ''
  return [
    '',
    '【他現在畫面上的題目】' + t.label,
    t.detail,
    t.draft?.trim() ? '他目前寫到：「' + t.draft.trim() + '」' : '他還沒開始寫。',
    '他問的問題如果跟這題有關，就針對這題回答。他說「卡住了」時：先說他草稿裡做對的一點，再只給下一步最小的提示（一個字、一個規則或句子開頭），不要直接給整句答案；他明確說要看答案才給。',
  ].join('\n')
}

/** Ask the floating Claude chat to open and send a message (used by 「我卡住了」). */
export const askEvent = 'dream-blueprint:ask-claude'
export function askClaude(text: string) {
  window.dispatchEvent(new CustomEvent(askEvent, { detail: text }))
}
