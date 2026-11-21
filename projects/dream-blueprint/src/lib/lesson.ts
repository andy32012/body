/** The guided 30-minute lesson: recall → listen → pattern → express → fix → done.
 *  Content per unit lives in data/lessons.json (dialogue, questions, variations, an open task). */
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
  variations: { zh: string; en: string }[]
  prompt: LessonPrompt
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
export interface HintUse { h: number; r: boolean; v?: 'good' | 'small' | 'again' }
export interface CorrectionResult { verdict: 'good' | 'small' | 'again'; corrected: string; fixes: { wrong: string; right: string; why: string; zh?: string; en?: string }[]; note?: string }
/** The open task: first answer and its feedback are kept apart from the corrected try. */
export interface ExpressRecord { first?: string; firstResult?: CorrectionResult; lastAnswer?: string; last?: CorrectionResult; corrections: number; help: string[] }
export interface LessonRecord {
  unit: number; day: number; steps: LessonStep[]
  corrected?: boolean; saved?: number
  phase?: LessonPhase
  recalls?: Attempt[]; records?: Attempt[]
  hints?: Record<string, HintUse>
  express?: ExpressRecord
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
export function resumeTarget(notes: Record<string, string>, cursor: { unit: number; day: number }, today: string, explicit = false) {
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
/** Continuing on a later day moves the lesson to today, unless today already has a finished lesson. */
export function moveLesson(notes: Record<string, string>, from: string, to: string) {
  if (from === to || lessonFinished(notes, to)) return { notes, date: from }
  const rec = readLessonRecord(notes, from)
  if (!rec) return { notes, date: from }
  const next = { ...notes, [lessonKey(to)]: JSON.stringify(rec), [activeKey]: to }
  delete next[lessonKey(from)]
  return { notes: next, date: to }
}
export const stepLabel: Record<LessonPhase, string> = { recall: '回想', listen: '聽懂', write: '句型', sound: '句型', vary: '句型', express: '表達', done: '完成' }

/** Day 1–5 get one variation of the pattern; it alternates between the unit's two. */
export const variationFor = (lesson: Lesson, day: number) => lesson.variations[(Math.max(1, day) - 1) % lesson.variations.length]

/** A partial frame of the model sentence: word order and first letters, the rest left to you. "I a_ a n______ s______." */
export function sentenceFrame(en: string) {
  return en.replace(/[A-Za-z][A-Za-z']*/g, w => w.length < 2 ? w : w[0] + '_'.repeat(w.length - 1))
}
