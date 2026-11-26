/** The guided 30-minute lesson: recall → listen → pattern → express → fix → done.
 *  Content per unit lives in data/lessons.json (dialogue, questions, ten variations, an open task for each day). */
export interface LessonLine { who: string; en: string; zh: string }
export interface LessonQuestion { q: string; options: string[]; answer: number }
export interface LessonPrompt {
  en: string
  zh: string
  sample: string
  chart?: { title: string; points: { label: string; value: number }[] }
  scaffold?: string[]
}
export interface Lesson {
  unit: number
  cando: string
  scene: string
  dialogue: LessonLine[]
  questions: LessonQuestion[]
  /** Ten more sentences with the pattern, two for each of days 1–5, none repeated.
   *  alt: other answers that are just as right (I'll come earlier tomorrow / I will come early tomorrow). */
  variations: { zh: string; en: string; alt?: string[] }[]
  /** An open task for each of days 1–5. */
  prompts: LessonPrompt[]
}

export const lessonSteps = [
  ['recall', '回想'], ['listen', '聽懂'], ['pattern', '句型'], ['express', '表達'], ['fix', '訂正'], ['done', '完成'],
] as const
export type LessonStep = typeof lessonSteps[number][0]

/** First listen of a unit's dialogue (with questions) vs. later days (listen and read along). */
export const heardKey = (unit: number) => 'lesson.heard.' + unit
export interface HeardRecord { day: string; correct: number; total: number }
export function readHeard(notes: Record<string, string>, unit: number): HeardRecord | null {
  try { return notes[heardKey(unit)] ? JSON.parse(notes[heardKey(unit)]) as HeardRecord : null } catch { return null }
}

/** One guided lesson, kept under the day it was (last) worked on; it also lets the plan tick 「今天這一堂」.
 *  'lesson.active' points at an unfinished one, so closing the page or coming back tomorrow continues it. */
export const lessonKey = (day: string) => 'lesson.' + day
export const activeKey = 'lesson.active'
export type LessonPhase = 'recall' | 'listen' | 'write' | 'sound' | 'vary' | 'express' | 'done'
export interface Attempt { sentenceId: string; rating: 'correct' | 'minor' | 'again'; grammar: string[]; revealed: boolean }
/** h: how far the hints went (1 self-check, 2 clearer hint, 3 sentence frame, 4 the answer); r: an answer was shown. */
/** c: asked Claude for help with 「我卡住了」 before marking. */
/** h hint level, r answer seen, v Claude's verdict on the first try and vt the exact text it judged, c asked Claude for help. */
export interface HintUse { h: number; r: boolean; v?: 'good' | 'small' | 'again' | 'changed'; vt?: string; c?: boolean }

/** Help used on one sentence only ever grows: the hint level goes up, an answer seen or Claude asked stays seen or asked,
 *  and the first verdict (with the text it judged) stays the first. A reply that arrives late with older values can't
 *  take any of it back. */
export function raiseHelp(cur: HintUse, patch: Partial<HintUse>): HintUse {
  const v = cur.v ?? patch.v
  const vt = cur.v ? cur.vt : patch.vt ?? cur.vt
  const c = !!(cur.c || patch.c)
  return { h: Math.max(cur.h, patch.h ?? 0), r: cur.r || !!patch.r, ...(v ? { v } : {}), ...(v && vt !== undefined ? { vt } : {}), ...(c ? { c } : {}) }
}

/** Hints used outside the guided lesson (checkpoint, review, extra drills) live in "hints.<date>". */
export const hintsKey = (day: string) => 'hints.' + day
export function readHints(notes: Record<string, string>, day: string): Record<string, HintUse> {
  try { const v = JSON.parse(notes[hintsKey(day)] ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
export function writeHint(notes: Record<string, string>, day: string, id: string, use: HintUse): Record<string, string> {
  return { ...notes, [hintsKey(day)]: JSON.stringify({ ...readHints(notes, day), [id]: use }) }
}
export interface CorrectionResult { verdict: 'good' | 'small' | 'again' | 'changed'; corrected: string; fixes: { wrong: string; right: string; why: string; zh?: string; en?: string }[]; note?: string; resolved?: number[]; still?: number[] }
/** A rewrite counts as fixed when every issue from the round before is resolved, or nothing is left to fix.
 *  Sending the same answer again is a retry, not a fix. */
export function issuesFixed(r: CorrectionResult, previous?: CorrectionResult): boolean {
  if (r.verdict === 'good' || !r.fixes.length) return true
  if (!previous?.fixes.length) return false
  return (r.still?.length ?? 1) === 0 && (r.resolved?.length ?? 0) >= previous.fixes.length
}
/** The open task: first answer and its feedback are kept apart from the corrected try. */
export interface ExpressRecord {
  first?: string; firstResult?: CorrectionResult; lastAnswer?: string; last?: CorrectionResult; corrections: number; help: string[]
  /** Help layers already open when the first answer was submitted. */
  firstHelp?: string[]
  /** Saw the full correction before rewriting. */
  revealed?: boolean
  /** The last rewrite fixed every issue from the round before it (not just "sent again"). */
  fixed?: boolean
  /** The same task answered on another device the same day (kept by 「兩份合併」, so neither sentence is lost). */
  others?: ExpressAnswer[]
}
export type ExpressAnswer = Pick<ExpressRecord, 'first' | 'firstResult' | 'lastAnswer' | 'last'>

const stepOrder: readonly LessonStep[] = lessonSteps.map(s => s[0])
const phaseOrder: readonly LessonPhase[] = ['recall', 'listen', 'write', 'sound', 'vary', 'express', 'done']
const ratingRank: Record<Attempt['rating'], number> = { again: 0, minor: 1, correct: 2 }
const unique = <T>(xs: readonly T[]) => [...new Set(xs)]

/** One hint record from two devices: the most help either used, Claude's first verdict from the copy changed earlier. */
export function mergeHintUse(older: HintUse, newer: HintUse): HintUse {
  const judged = older.v ? older : newer
  return {
    h: Math.max(older.h ?? 0, newer.h ?? 0), r: !!(older.r || newer.r),
    ...(judged.v ? { v: judged.v } : {}), ...(judged.v && judged.vt !== undefined ? { vt: judged.vt } : {}),
    ...(older.c || newer.c ? { c: true } : {}),
  }
}
export function mergeHints(older: Record<string, HintUse>, newer: Record<string, HintUse>): Record<string, HintUse> {
  const out: Record<string, HintUse> = { ...older }
  for (const [id, use] of Object.entries(newer)) out[id] = older[id] ? mergeHintUse(older[id], use) : use
  return out
}
/** Answers in order (recall i answers recall item i). The same items on both: each counted as its more careful
 *  judgement; otherwise the copy that got further (on a tie, the one changed earlier). */
function mergeAttempts(older?: Attempt[], newer?: Attempt[]): Attempt[] | undefined {
  if (!older?.length) return newer
  if (!newer?.length) return older
  if (older.length !== newer.length || older.some((a, i) => a.sentenceId !== newer[i].sentenceId)) return newer.length > older.length ? newer : older
  return older.map((a, i) => {
    const b = newer[i]
    const careful = ratingRank[b.rating] < ratingRank[a.rating] ? b : a
    return { ...careful, revealed: !!(a.revealed || b.revealed), grammar: unique([...(a.grammar ?? []), ...(b.grammar ?? [])]) }
  })
}
const answerOf = (e: ExpressRecord): ExpressAnswer => ({
  ...(e.first !== undefined ? { first: e.first } : {}), ...(e.firstResult ? { firstResult: e.firstResult } : {}),
  ...(e.lastAnswer !== undefined ? { lastAnswer: e.lastAnswer } : {}), ...(e.last ? { last: e.last } : {}),
})
/** The open task from two devices: the one that got further goes on; the other device's sentences are kept beside it. */
function mergeExpress(older?: ExpressRecord, newer?: ExpressRecord): ExpressRecord | undefined {
  if (!older) return newer
  if (!newer) return older
  const further = (e: ExpressRecord) => (e.fixed ? 100 : 0) + (e.corrections ?? 0) * 10 + (e.last ? 2 : 0) + (e.firstResult ? 1 : 0)
  const [main, other] = further(newer) > further(older) ? [newer, older] : [older, newer]
  const kept = [...(main.others ?? []), ...(other.others ?? [])]
  const otherAnswer = answerOf(other)
  if ((other.first || other.lastAnswer) && (other.first !== main.first || other.lastAnswer !== main.lastAnswer)) kept.push(otherAnswer)
  const seen = new Set<string>()
  const others = kept.filter(o => { const k = JSON.stringify([o.first ?? '', o.lastAnswer ?? '']); if (seen.has(k)) return false; seen.add(k); return true })
  return {
    ...main,
    help: unique([...(main.help ?? []), ...(other.help ?? [])]),
    ...(main.revealed || other.revealed ? { revealed: true } : {}),
    ...(others.length ? { others } : {}),
  }
}
/** One day's lesson record from two devices (「兩份合併」): every step, answer and the open task's sentences from both,
 *  help counted as the most used. A different lesson saved under the same day: the one further along the course, as
 *  on one device the later lesson of a day replaces the earlier one. `older` is the copy changed earlier. */
export function mergeLessonRecords(older: LessonRecord, newer: LessonRecord): LessonRecord {
  if (older.unit !== newer.unit || older.day !== newer.day) return older.unit * 10 + older.day > newer.unit * 10 + newer.day ? older : newer
  const phases = [older.phase, newer.phase].filter((p): p is LessonPhase => !!p && phaseOrder.includes(p))
  const phase = phases.sort((a, b) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b)).at(-1)
  const recalls = mergeAttempts(older.recalls, newer.recalls)
  const records = mergeAttempts(older.records, newer.records)
  const hints = older.hints || newer.hints ? mergeHints(older.hints ?? {}, newer.hints ?? {}) : undefined
  const express = mergeExpress(older.express, newer.express)
  const peeked = unique([...(older.peeked ?? []), ...(newer.peeked ?? [])]).sort((a, b) => a - b)
  const varyChecks: Record<string, VariationCheck> = { ...(older.varyChecks ?? {}) }
  for (const [k, c] of Object.entries(newer.varyChecks ?? {})) varyChecks[k] = varyChecks[k] ? mergeVariationCheck(varyChecks[k], c) : c
  const full = !(older as { slim?: boolean }).slim || !(newer as { slim?: boolean }).slim
  const merged: LessonRecord & { slim?: boolean } = {
    ...older, ...newer,
    steps: stepOrder.filter(s => older.steps.includes(s) || newer.steps.includes(s)),
    ...(phase ? { phase } : {}),
    ...(older.corrected || newer.corrected ? { corrected: true } : {}),
    ...(older.saved !== undefined || newer.saved !== undefined ? { saved: Math.max(older.saved ?? 0, newer.saved ?? 0) } : {}),
    ...(older.varied !== undefined || newer.varied !== undefined ? { varied: Math.max(older.varied ?? 0, newer.varied ?? 0) } : {}),
    ...(recalls ? { recalls } : {}), ...(records ? { records } : {}), ...(hints ? { hints } : {}), ...(express ? { express } : {}),
    ...(peeked.length ? { peeked } : {}),
    ...(Object.keys(varyChecks).length ? { varyChecks } : {}),
  }
  // A slimmed copy (details sent to the Drive archive) and a full one: the full one's details stay.
  if (full) delete merged.slim
  return merged
}
export interface LessonRecord {
  unit: number; day: number; steps: LessonStep[]
  corrected?: boolean; saved?: number
  phase?: LessonPhase
  recalls?: Attempt[]; records?: Attempt[]
  hints?: Record<string, HintUse>
  express?: ExpressRecord
  /** How many of today's variations are done (the lesson continues at the next one). */
  varied?: number
  /** Today's variations whose answer was shown (by 看答案 or by Claude), so opening the page again cannot hide it. */
  peeked?: number[]
  /** Each variation's check so far (by its number today): Claude's first verdict and the text it judged, help seen.
   *  Kept as it happens, so leaving the page and coming back cannot turn an answer fixed with help into one done alone. */
  varyChecks?: Record<string, VariationCheck>
}
/** One variation's check. */
export interface VariationCheck {
  firstVerdict?: 'good' | 'small' | 'again' | 'changed'; checkedText?: string; revealed?: boolean
  /** What he had written when he pressed 看答案 himself: the answer is judged on this, not on what he copied afterwards. */
  before?: string
  /** Claude's latest verdict and the text it was about (for 「Claude 說對了，下一步」 after coming back). */
  last?: { v: string; text: string }
}
/** Two devices' checks of one variation: the first verdict and the text before looking from the copy changed earlier
 *  (when it has them), help seen on either. */
export function mergeVariationCheck(older: VariationCheck, newer: VariationCheck): VariationCheck {
  const judged = older.firstVerdict ? older : newer
  return {
    ...newer, ...older,
    ...(judged.firstVerdict ? { firstVerdict: judged.firstVerdict, checkedText: judged.checkedText } : {}),
    ...(older.before !== undefined ? { before: older.before } : newer.before !== undefined ? { before: newer.before } : {}),
    ...(older.revealed || newer.revealed ? { revealed: true } : {}),
    ...(newer.last ?? older.last ? { last: newer.last ?? older.last } : {}),
  }
}
/** A checkpoint or review day left halfway (a reload, another page): which sentence it was on and the answers so far,
 *  kept for that day only, so it goes on instead of asking the same sentences again. `levels` are the checkpoint's
 *  judgements so far ('assisted' | 'independent' | 'delayed' | 'pending', or null for not done). */
export interface RunProgress { unit: number; day: number; pos: number; records: (Attempt & { verified?: boolean })[]; levels: (string | null)[] }
export const runProgressKey = (date: string) => 'progress.' + date
export function readRunProgress(notes: Record<string, string>, date: string, unit: number, day: number): RunProgress | null {
  try {
    const v = JSON.parse(notes[runProgressKey(date)] || 'null') as RunProgress | null
    return v && v.unit === unit && v.day === day && Number.isInteger(v.pos) && Array.isArray(v.records) && Array.isArray(v.levels) ? v : null
  } catch { return null }
}
export function saveRunProgress(notes: Record<string, string>, date: string, p: RunProgress | null) {
  const next = { ...notes }
  if (p) next[runProgressKey(date)] = JSON.stringify(p); else delete next[runProgressKey(date)]
  return next
}
export function readLessonRecord(notes: Record<string, string>, day: string): LessonRecord | null {
  try {
    const v = notes[lessonKey(day)]
    if (!v) return null
    const r = JSON.parse(v) as LessonRecord
    return Array.isArray(r.steps) ? r : null
  } catch { return null }
}
export function updateLesson(notes: Record<string, string>, day: string, unit: number, lessonDay: number, patch: Partial<LessonRecord> = {}, step?: LessonStep) {
  const old = readLessonRecord(notes, day)
  const base: LessonRecord = old && old.unit === unit && old.day === lessonDay ? old : { unit, day: lessonDay, steps: [] }
  const steps = step && !base.steps.includes(step) ? [...base.steps, step] : base.steps
  const rec: LessonRecord = { ...base, ...patch, steps }
  const next = { ...notes, [lessonKey(day)]: JSON.stringify(rec) }
  if (!steps.includes('done')) next[activeKey] = day
  else if (next[activeKey] === day) delete next[activeKey]
  return next
}
export function markLessonStep(notes: Record<string, string>, day: string, unit: number, lessonDay: number, step: LessonStep, extra: Partial<LessonRecord> = {}) {
  return updateLesson(notes, day, unit, lessonDay, extra, step)
}
export const lessonFinished = (notes: Record<string, string>, day: string) => !!readLessonRecord(notes, day)?.steps.includes('done')
type DaySession = { day: string; energy: string; advanced?: boolean; sentenceId?: string }
/** A grammar session that moved the course on today. The unit checkpoint (day 6) is one, and it keeps no lesson record. */
export const courseMovedOn = (sessions: readonly DaySession[], day: string) =>
  sessions.some(s => s.day === day && (s.advanced ?? s.energy !== 'low') && !s.sentenceId?.startsWith('topic:'))
/** Today's main grammar lesson is done: a guided lesson that reached its end, or a checkpoint. A guided lesson whose
 *  last step (表達) is still open is not done yet, even though its sentences are saved. */
export const mainLessonDone = (state: { notes: Record<string, string>; sessions: readonly DaySession[] }, day: string) =>
  lessonFinished(state.notes, day) || (!readLessonRecord(state.notes, day) && courseMovedOn(state.sessions, day))
export function activeLesson(notes: Record<string, string>): { date: string; rec: LessonRecord } | null {
  const date = notes[activeKey]
  if (!date) return null
  const rec = readLessonRecord(notes, date)
  return rec && !rec.steps.includes('done') ? { date, rec } : null
}
/** The core (recall, listen, pattern) is saved and the curriculum has moved on; only 表達／訂正 can be left. */
export const coreSaved = (rec: LessonRecord) => rec.steps.includes('pattern')
/** Should opening a lesson continue an unfinished one? A lesson whose core is saved continues the same day,
 *  or later when asked for explicitly; one whose core isn't saved continues while the curriculum still points at it. */
export function resumeTarget(notes: Record<string, string>, cursor: { unit: number; day: number }, today: string, explicit = false, at?: string) {
  if (at) {
    const rec = readLessonRecord(notes, at)
    return rec && !rec.steps.includes('done') ? { date: at, rec } : null
  }
  const a = activeLesson(notes)
  if (!a) return null
  if (coreSaved(a.rec)) return a.date === today || explicit ? a : null
  return cursor.unit === a.rec.unit && cursor.day === a.rec.day ? a : null
}
export function resumePhase(rec: LessonRecord): LessonPhase | null {
  if (coreSaved(rec)) return 'express'
  if (rec.phase && rec.phase !== 'done' && rec.phase !== 'express') return rec.phase
  return rec.steps.includes('listen') ? 'write' : rec.steps.includes('recall') ? 'listen' : null
}
/** Every earlier lesson whose core is saved but whose 表達 is still open, newest first.
 *  The single "lesson.active" pointer moves on when a new lesson starts, so these would otherwise be lost. */
export function pendingLessons(notes: Record<string, string>): { date: string; rec: LessonRecord }[] {
  const out: { date: string; rec: LessonRecord }[] = []
  for (const k of Object.keys(notes)) {
    const m = /^lesson\.(\d{4}-\d{2}-\d{2})$/.exec(k)
    if (!m) continue
    const rec = readLessonRecord(notes, m[1])
    if (rec && coreSaved(rec) && !rec.steps.includes('done')) out.push({ date: m[1], rec })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
/** Continuing on a later day moves the lesson to today, unless today already has a lesson of its own. */
export function moveLesson(notes: Record<string, string>, from: string, to: string) {
  if (from === to || readLessonRecord(notes, to)) return { notes, date: from }
  const rec = readLessonRecord(notes, from)
  if (!rec) return { notes, date: from }
  const next = { ...notes, [lessonKey(to)]: JSON.stringify(rec), [activeKey]: to }
  delete next[lessonKey(from)]
  return { notes: next, date: to }
}
export const stepLabel: Record<LessonPhase, string> = { recall: '回想', listen: '聽懂', write: '句型', sound: '句型', vary: '句型', express: '表達', done: '完成' }

/** Days 1–5 each write two new sentences with the pattern after today's sentence: day 1 the unit's first two, day 2 the
 *  next two, and so on, so none of the ten comes back within the week. */
export const VARIATIONS_PER_DAY = 2
const lessonDay = (day: number) => Math.min(5, Math.max(1, day))
export function variationsFor(lesson: Lesson, day: number) {
  const n = lesson.variations.length
  return Array.from({ length: VARIATIONS_PER_DAY }, (_, i) => lesson.variations[((lessonDay(day) - 1) * VARIATIONS_PER_DAY + i) % n])
}
/** Days 1–5 each have their own open task (表達). */
export const promptFor = (lesson: Lesson, day: number) => lesson.prompts[(lessonDay(day) - 1) % lesson.prompts.length]

/** A partial frame of the model sentence: word order and first letters, the rest left to you. "I a_ a n______ s______." */
export function sentenceFrame(en: string) {
  return en.replace(/[A-Za-z][A-Za-z']*/g, w => w.length < 2 ? w : w[0] + '_'.repeat(w.length - 1))
}
