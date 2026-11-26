import data from '../data/topics.json'
import { addDays, applyAnswer, daysBetween, newCard, type Energy, type Period } from './progress'
import type { AppState } from './store'
import { judgeCheckpoint, judgeExpress, levelNames, sameEnglish, type Level, type Verdict } from './evidence'
import { courseMovedOn, readLessonRecord } from './lesson'
import { isKnownWord, levelEntry, wordKey } from './vocab'

/** Life topics: each one is three short sessions on different days.
 *  A 理解 — words in context, the pattern, listening (gist → details → transcript → shadow → retell) and reading;
 *  B 輸出 — a speaking task and a 3–5 sentence message; C 換情境 — at least three days after B, new sentences and a new
 *  speaking situation. They take turns with the grammar lessons in the daily main line. */
export interface TopicLine { who: string; en: string; zh: string }
export interface TopicChoice { q: string; options: string[]; answer: number }
export type ReadSkill = '主旨' | '細節' | '指涉' | '推論' | '有沒有提供'
export interface TopicSentence { id: string; zh: string; grammar: string[]; hints: string[]; reference: string[]; why: string; newWords: { en: string; zh: string }[] }
export interface SpeakTask { situation: string; conditions: string[]; followUps?: string[]; sample: string }
export interface Topic {
  id: string; n: number; after: number; title: string; titleEn: string; goal: string; scene: string
  grammar: { title: string; points: string[]; examples: { en: string; zh: string }[] }
  words: { en: string; zh: string; use: string; example: string; exampleZh: string }[]
  chunks: { en: string; zh: string }[]
  wordCheck: (TopicChoice & { sentence: string })[]
  practice: TopicSentence[]
  listen: { scene: string; dialogue: TopicLine[]; gist: TopicChoice; details: TopicChoice[]; shadow: number[]; retell: string; retellSample: string }
  read: { kind: string; title: string; lines: { en: string; zh: string }[]; questions: (TopicChoice & { skill: ReadSkill })[] }
  speak: SpeakTask
  write: { task: string; conditions: string[]; minSentences: number; sample: string }
  review: { situation: string; practice: TopicSentence[]; speak: SpeakTask }
}
export const topics = data as Topic[]
export const topicById = (id: string) => topics.find(t => t.id === id)

export type TopicPart = 'A' | 'B' | 'C'
export const partNames: Record<TopicPart, string> = { A: '理解', B: '說和寫', C: '換情境複習' }
export const partSteps = {
  A: [['goal', '目標'], ['words', '單字'], ['pattern', '句型'], ['listen', '聽'], ['read', '讀']],
  B: [['speak', '說'], ['write', '寫訊息']],
  C: [['review', '換情境'], ['speak', '說']],
} as const satisfies Record<TopicPart, readonly (readonly [string, string])[]>
/** Session C waits this many days after B, so it checks what stayed, not what was just seen. */
export const REVIEW_GAP = 3

export type Rating = 'correct' | 'minor' | 'again'
export interface ItemResult { level: Level | null; rating: Rating; revealed: boolean }
export interface SpeakRecord {
  /** Speaking itself: null when it was only typed (typing is not speech) or skipped. */
  level: Level | null
  /** The transcript's content and grammar, judged like any open answer. */
  textLevel?: Level | null
  mode?: 'recorded' | 'spoken' | 'typed'
  help: string[]
  firstVerdict?: Verdict
  recorded?: boolean
  /** One or two things to work on next time. Pronunciation is never judged from a transcript. */
  goals: string[]
}
export interface ListenRecord {
  /** First time, before the text: gist and details answered from listening alone. */
  gist?: boolean
  details?: number
  total?: number
  /** Plays before the questions were checked, and plays after (with or without the text). */
  plays?: number
  replays?: number
  transcript?: boolean
  shadowed?: boolean
  retell?: Level | null
  noVoice?: boolean
  /** The device never reported a finished play; answers are kept but not counted as understood by ear. */
  unsure?: boolean
}
export interface TopicRecord {
  /** The day each part was finished. */
  done: Partial<Record<TopicPart, string>>
  /** A part that was started and not finished: where to continue. */
  cur?: { part: TopicPart; step: number; day: string }
  words?: { correct: number; total: number }
  items?: Record<string, ItemResult>
  listen?: ListenRecord
  read?: { correct: number; total: number; missed: ReadSkill[] }
  speak?: SpeakRecord
  write?: { level: Level | null; sentences: number; covered?: number; help: string[]; firstVerdict?: Verdict }
  review?: { level: Level | null; speak?: SpeakRecord }
  /** Help and Claude's first check while a speaking or writing task is still open (kept across a reload). */
  open?: Record<string, OpenCheck>
}
/** An open task's help and checks: the first check (with the text it saw) and the latest one (with its text). */
export interface OpenCheck { help: string[]; firstVerdict?: Verdict; checkedText?: string; latestVerdict?: Verdict; latestText?: string }
/** The verdict that counts for the text in the box now. The first check stays the first (a wrong first try is fixed with
 *  help, however good the rewrite). After a first 「good」, an edited text counts only once Claude has checked that very
 *  text: then its own verdict counts; an edit nobody checked is unchecked (待確認). */
export function openVerdict(o: OpenCheck, text: string): Verdict | undefined {
  if (o.firstVerdict !== 'good' || o.checkedText === undefined || sameEnglish(o.checkedText, text)) return o.firstVerdict
  return o.latestVerdict && o.latestText !== undefined && sameEnglish(o.latestText, text) ? o.latestVerdict : undefined
}
/** A new check of `text`: the first one stays the first, the latest one belongs to the text it saw. */
export function withCheck(o: OpenCheck, v: Verdict, text: string): OpenCheck {
  return { ...o, ...(o.firstVerdict ? {} : { firstVerdict: v, checkedText: text }), latestVerdict: v, latestText: text }
}

export const topicKey = (id: string) => 'topic.' + id
export const skipKey = (day: string) => 'topic.skip.' + day

export function readTopic(notes: Record<string, string>, id: string): TopicRecord {
  try {
    const raw = notes[topicKey(id)]
    const rec = raw ? JSON.parse(raw) as TopicRecord : null
    return rec && typeof rec === 'object' && rec.done && typeof rec.done === 'object' ? rec : { done: {} }
  } catch { return { done: {} } }
}
export function writeTopic(notes: Record<string, string>, id: string, patch: Partial<TopicRecord>): Record<string, string> {
  return { ...notes, [topicKey(id)]: JSON.stringify({ ...readTopic(notes, id), ...patch }) }
}

export function nextPart(rec: TopicRecord): TopicPart | null {
  return !rec.done.A ? 'A' : !rec.done.B ? 'B' : !rec.done.C ? 'C' : null
}
/** B never on the day of A; C only REVIEW_GAP days after B. */
export function partReady(rec: TopicRecord, part: TopicPart, today: string) {
  if (part === 'A') return true
  if (part === 'B') return !!rec.done.A && rec.done.A < today
  return !!rec.done.B && daysBetween(rec.done.B, today) >= REVIEW_GAP
}

export interface DueTopic { topic: Topic; part: TopicPart; step: number }
type TopicState = { notes: Record<string, string>; curriculum: { unit: number }; sessions: readonly { day: string; energy: string; sentenceId: string; advanced?: boolean }[] }

/** Whether today's main lesson is a life-topic session, and which one.
 *  One main lesson a day; topics unlock in order as grammar units are finished, and take turns with grammar lessons:
 *  after a practice day whose main lesson was a topic, the next one is a grammar lesson.
 *  The caller leaves out tired (2-minute) days and exam / internship weeks. */
export function dueTopic(state: TopicState, today: string): DueTopic | null {
  if (state.notes[skipKey(today)]) return null
  // A grammar lesson already started today keeps today's slot.
  if (readLessonRecord(state.notes, today)) return null
  // So does a unit checkpoint done today: it keeps no lesson record, but one main lesson a day is the rule.
  if (courseMovedOn(state.sessions, today)) return null
  const records = topics.map(t => [t, readTopic(state.notes, t.id)] as const)
  if (records.some(([, r]) => Object.values(r.done).includes(today))) return null
  // A part that was started and left open continues first.
  for (const [topic, r] of records)
    if (r.cur && !r.done[r.cur.part]) return { topic, part: r.cur.part, step: Math.max(0, r.cur.step) }
  const last = state.sessions.filter(s => s.day < today && s.energy !== 'low').at(-1)
  if (last?.sentenceId.startsWith('topic:')) return null
  for (const [topic, r] of records) {
    if (state.curriculum.unit <= topic.after) break
    const part = nextPart(r)
    if (part && partReady(r, part, today)) return { topic, part, step: 0 }
  }
  return null
}
export const topicDoneToday = (notes: Record<string, string>, today: string) =>
  topics.some(t => Object.values(readTopic(notes, t.id).done).includes(today))
/** The first day the topic's C part can come, once B is done. */
export const reviewFrom = (rec: TopicRecord) => rec.done.B ? addDays(rec.done.B, REVIEW_GAP) : undefined

/** Speaking: the help that counts and Claude's first check decide the level, as for any open task.
 *  Saying it without typing anything can only be self-marked (自評完成・待確認). */
export function judgeSpeak(r: { said: boolean; transcript: string; help: readonly string[]; firstVerdict?: Verdict }): Level | null {
  return judgeExpress({ answered: r.said || !!r.transcript.trim(), help: r.help, firstVerdict: r.transcript.trim() ? r.firstVerdict : undefined })
}
/** C counts as 「延後換題仍能完成」 only with two of the new sentences written alone and checked. */
export const judgeReview = (items: readonly (Level | null)[]) => judgeCheckpoint(items)

/** One or two things to work on: Claude's fixes first, then conditions the answer left out. */
export function speakGoals(fixes: readonly { why?: string }[], unmet: readonly string[]): string[] {
  const goals = [...fixes.map(f => f.why?.trim() ?? '').filter(Boolean), ...unmet.map(c => '下次記得：' + c)]
  if (!goals.length) goals.push('下次不看條件清單，直接說完', '說完再多加一句細節（時間、地點或原因）')
  return goals.slice(0, 2)
}

/** Sentences in a short message: a.m. / p.m. and titles do not end a sentence; a line break does; a piece needs at least
 *  two words to count ("Hi!" alone does not). This only measures length — it says nothing about grammar or meaning. */
export function countSentences(text: string) {
  const plain = text.replace(/\b(a\.m|p\.m|mr|mrs|ms|dr|e\.g|i\.e)\./gi, m => m.replace(/\./g, ''))
  return plain.split(/[.!?]+(?=\s|$)|\n+/).filter(s => (s.match(/[a-z]+(?:['’][a-z]+)?/gi) ?? []).length >= 2).length
}

/** The overall line shown in the record. */
export function topicStatus(rec: TopicRecord): string {
  if (rec.done.C) return '換情境筆答：' + (rec.review?.level ? levelNames[rec.review.level] : '未作答')
  if (rec.done.B) return '說和寫完成，等換情境複習'
  if (rec.done.A) return '理解完成，下次說和寫'
  return rec.cur ? '進行中' : '還沒開始'
}

/** Saves a finished part: the day, a session (so the day counts as practised), review cards for the sentences
 *  written, and — after A — the topic's dictionary words that are not known yet. */
export function completePart(prev: AppState, topic: Topic, part: TopicPart, today: string, energy: Energy, period: Period, sessionId: string): AppState {
  if (prev.sessions.some(s => s.id === sessionId)) return prev
  const rec = readTopic(prev.notes, topic.id)
  const sentences = part === 'A' ? topic.practice : part === 'C' ? topic.review.practice : []
  const translations = sentences.flatMap(s => {
    const r = rec.items?.[s.id]
    return r ? [{ sentenceId: s.id, rating: r.rating, grammar: s.grammar, revealed: r.revealed, verified: r.level === 'independent' }] : []
  })
  const cards = [...prev.cards]
  const events = [...prev.reviewEvents]
  for (const t of translations) {
    const i = cards.findIndex(c => c.id === t.sentenceId)
    if (i === -1) cards.push(newCard(t.sentenceId, today))
    else {
      const { card, event } = applyAnswer(cards[i], today, t)
      cards[i] = card
      if (event) events.push(event)
    }
  }
  const words = part !== 'A' ? [] : topic.words.map(w => w.en)
    .filter(en => levelEntry(en) && !isKnownWord(en, prev.knownWords))
    .map(wordKey)
  for (const key of words) if (!cards.some(c => c.id === 'word:' + key)) cards.push(newCard('word:' + key, today))
  const { cur: _cur, ...kept } = rec
  void _cur
  return {
    ...prev,
    cards,
    reviewEvents: events,
    sessions: [...prev.sessions, { id: sessionId, day: today, energy, period, sentenceId: 'topic:' + topic.id + ':' + part, words, advanced: false, translations }],
    notes: { ...prev.notes, [topicKey(topic.id)]: JSON.stringify({ ...kept, done: { ...rec.done, [part]: today } }) },
  }
}

/** For Emma: play the other person in the topic's speaking situation. */
export function topicInstructions(topic: Topic, part: TopicPart) {
  const task = part === 'C' ? topic.review.speak : topic.speak
  return [
    `Today you are also helping him practise a real-life speaking task from his English lesson, inside a friendly chat (still be his friend, not a teacher).`,
    `Topic: "${topic.titleEn}". Situation (in Chinese): ${part === 'C' ? topic.review.situation + ' ' : ''}${task.situation}`,
    `Play the other person in this situation. He should: ${task.conditions.join('; ')}.`,
    task.followUps?.length ? `Questions you can ask him along the way: ${task.followUps.join(' / ')}` : '',
    `Useful phrases from his lesson: ${topic.chunks.map(c => c.en).join(' / ')}.`,
    'Start the role-play yourself in one or two short sentences. Keep every turn short, and ask one question at a time.',
    'When a mistake changes the meaning or breaks the pattern, say the correct sentence once and ask him to say it again. Other small mistakes: just recast them naturally.',
    'You hear him through speech recognition, so do not comment on his pronunciation.',
    'After about six of his turns, wrap up in one or two sentences: what he did well and one sentence to remember.',
  ].filter(Boolean).join('\n')
}

/** What each part does, in one line (home card and today's plan). */
export const partPlan: Record<TopicPart, string> = { A: '單字 → 句型 → 聽 → 讀', B: '說一個情境 → 寫一則 3–5 句的訊息', C: '換情境寫三句 → 換情境說' }
export const partNumber = (part: TopicPart) => 'ABC'.indexOf(part) + 1
export function topicGoal(due: DueTopic) {
  if (due.part === 'A') return due.topic.goal
  if (due.part === 'B') return '用英文完成「' + due.topic.title + '」的情境，再寫一則短訊息'
  return '隔了幾天，換個情境再用一次：' + due.topic.review.situation.replace(/^換個情境：/, '')
}

/** What the retell check is told: the retell task and the whole dialogue he heard. Content is judged against the
 *  dialogue — a different way of saying it, or a right detail the sample leaves out, is fine; a detail that does not
 *  match the dialogue is wrong, and the reply quotes the line it comes from. */
export function retellTask(topic: Topic): string {
  return '重述對話重點：' + topic.listen.retell
    + '。原對話（他聽過的，內容以這段為準）：' + topic.listen.dialogue.map(l => l.who + ': ' + l.en).join(' / ')
    + '。用不一樣的說法、或提到參考說法沒寫但原對話有的正確細節，都算對；跟原對話不符的細節（例如人、地方、時間換了），要引原對話那一句指出來，算內容錯。'
}
