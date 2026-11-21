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

/** What happened in today's lesson; also lets the plan tick 「今天這一堂」. */
export const lessonKey = (day: string) => 'lesson.' + day
export interface LessonRecord { unit: number; day: number; steps: LessonStep[]; corrected?: boolean; saved?: number }
export function readLessonRecord(notes: Record<string, string>, day: string): LessonRecord | null {
  try {
    const v = notes[lessonKey(day)]
    if (!v) return null
    const r = JSON.parse(v) as LessonRecord
    return Array.isArray(r.steps) ? r : null
  } catch { return null }
}
export function markLessonStep(notes: Record<string, string>, day: string, unit: number, lessonDay: number, step: LessonStep, extra: Partial<LessonRecord> = {}) {
  const old = readLessonRecord(notes, day)
  const base: LessonRecord = old && old.unit === unit && old.day === lessonDay ? old : { unit, day: lessonDay, steps: [] }
  const rec: LessonRecord = { ...base, ...extra, steps: base.steps.includes(step) ? base.steps : [...base.steps, step] }
  return { ...notes, [lessonKey(day)]: JSON.stringify(rec) }
}
export const lessonFinished = (notes: Record<string, string>, day: string) => !!readLessonRecord(notes, day)?.steps.includes('done')

/** Day 1–5 get one variation of the pattern; it alternates between the unit's two. */
export const variationFor = (lesson: Lesson, day: number) => lesson.variations[(Math.max(1, day) - 1) % lesson.variations.length]
