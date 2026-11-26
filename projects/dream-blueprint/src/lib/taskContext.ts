import { useEffect, useRef, useSyncExternalStore } from 'react'

/** What the learner is working on right now, so the floating Claude chat can help with this exact task. */
export interface TaskContext {
  /** Short line shown in the chat: 「正在協助：…」 */
  label: string
  /** Everything Claude needs: the task, the rule, the reference (for Claude only). */
  detail: string
  /** The current draft, read when a message is sent. */
  draft?: string
  /** Records that he asked Claude about this task (as 「我卡住了」 does), so the answer is not counted as done alone. */
  onHelp?: () => void
}

// Every task on screen, newest opened last: a box opened inside a page (用它寫一句 inside a reading) is the task until it
// is closed, and then the page's own task is the task again.
const open = new Map<symbol, { ctx: TaskContext; at: number }>()
let opened = 0
let current: TaskContext | null = null
let owner: symbol | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
function settle() {
  let top: [symbol, { ctx: TaskContext; at: number }] | null = null
  for (const e of open) if (!top || e[1].at > top[1].at) top = e
  const next = top?.[1].ctx ?? null
  // Typing changes only the draft; the label line does not need to re-render the chat.
  const same = owner === (top?.[0] ?? null) && current?.label === next?.label && current?.detail === next?.detail && !current?.onHelp === !next?.onHelp
  current = next ? { ...next } : null
  owner = top?.[0] ?? null
  if (!same) emit()
}

export function currentTask() { return current }
export function useCurrentTask() {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => current, () => null)
}

/** Register the task shown on screen. Passing null (a box folded away) or leaving the screen takes it out again, and
 *  the task under it (the page it was opened in) comes back. */
export function useTaskContext(ctx: TaskContext | null) {
  const id = useRef(Symbol('task'))
  // The latest callback is called, through one stable function, so a new render does not count as a new task.
  const help = useRef(ctx?.onHelp)
  help.current = ctx?.onHelp
  const label = ctx?.label, detail = ctx?.detail, draft = ctx?.draft, helps = !!ctx?.onHelp
  useEffect(() => {
    if (ctx) showTask(id.current, { ...ctx, onHelp: helps ? () => help.current?.() : undefined }); else hideTask(id.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, detail, draft, !ctx, helps])
  useEffect(() => () => hideTask(id.current), [])
}
/** The hook's two moves, as plain functions: a task shown (or its draft changed; it keeps its place), and taken out. */
export function showTask(id: symbol, ctx: TaskContext) {
  const had = open.get(id)
  open.set(id, { ctx: { label: ctx.label, detail: ctx.detail, draft: ctx.draft, ...(ctx.onHelp ? { onHelp: ctx.onHelp } : {}) }, at: had?.at ?? ++opened })
  settle()
}
export function hideTask(id: symbol) { if (open.delete(id)) settle() }

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

/** A message sent from the floating chat: about the task on screen (the task goes along and records the help), or —
 *  when he chose 「只問單字或別的」 — a general question that leaves the task and its record alone. */
export function askedAbout(t: TaskContext | null, general: boolean) {
  if (general || !t) return { prompt: general ? '' : taskPrompt(null) }
  t.onHelp?.()
  return { prompt: taskPrompt(t) }
}

/** Ask the floating Claude chat to open and send a message (used by 「我卡住了」). `general`: the message carries what
 *  Claude needs by itself and is not help on the task on screen (「問 Claude 為什麼」 after answering). */
export const askEvent = 'dream-blueprint:ask-claude'
export interface AskDetail { text: string; general?: boolean; hidden?: string }
export function askClaude(text: string, opts: { general?: boolean; hidden?: string } = {}) {
  window.dispatchEvent(new CustomEvent<AskDetail>(askEvent, { detail: { text, ...(opts.general ? { general: true } : {}), ...(opts.hidden ? { hidden: opts.hidden } : {}) } }))
}
/** The event's message (older callers sent the text alone). */
export const askDetail = (d: unknown): AskDetail => typeof d === 'string' ? { text: d }
  : d && typeof d === 'object' && typeof (d as AskDetail).text === 'string' ? d as AskDetail : { text: '' }

/** One answered question, for 「問 Claude 為什麼」: the question, his answer and the right one. */
export interface WhyQuestion { source?: string; stem: string; options?: readonly string[]; picked?: string; answer: string; right: boolean; passage?: string }
/** What 「問 Claude 為什麼」 sends after a question was answered (the first result is already kept). `text` is what he
 *  sees in the chat; `hidden` goes to Claude only. Answered right: Claude explains why. Not right yet: the right answer
 *  stays out of his view, and Claude says what went wrong and gives one hint so he can find it himself. */
export function whyQuestion(q: WhyQuestion): { text: string; hidden: string } {
  const text = [
    (q.source ? q.source + '：' : '') + (q.right ? '我答對了這一題，想知道為什麼。' : '我這題還沒答對。'),
    q.passage ? '原文：' + q.passage : '',
    '題目：' + q.stem,
    q.options?.length ? '選項：' + q.options.join(' / ') : '',
    q.picked === undefined ? '' : q.picked.trim() ? '我的答案：' + q.picked : '我沒有作答',
    q.right ? '正確答案：' + q.answer : '',
    q.right ? '請用中文說明為什麼這個對、其他的為什麼不對（有原文就指出線索），短短的就好。'
      : '請用中文說我錯在哪裡，再給我一個提示讓我自己再試一次（先不要給答案）。',
  ].filter(Boolean).join('\n')
  const hidden = q.right ? '' : '【只給你看】這一題的正確答案：' + q.answer + '。他還沒答對：不要說出這個答案，也不要說到只差照抄；說他錯在哪、給一個提示，等他再試。他答對了才完整說明。'
  return { text, hidden }
}
/** What 「問 Claude 老師」 on a tapped word sends: the teacher asks first whether he knows what it means here, then explains. */
export const wordQuestion = (form: string) => '我想問這篇文章裡的「' + form + '」。你先問我知不知道它在這裡是什麼意思，等我回答了再跟我說對不對、怎麼用。'
/** Open the floating Claude chat on the task on screen, without sending anything (「問問 Claude」). */
export const openClaude = () => askClaude('')
