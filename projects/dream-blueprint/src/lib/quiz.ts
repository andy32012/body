import { addDays } from './progress'

export interface QuizItem {
  id: string
  kind: string
  en: string
  zh: string
  options: string[]
  answerIndex: number
  explanation: string
  source?: string
}
export type QuizSection = 'english' | 'nursing'
export const sectionOf = (q: Pick<QuizItem, 'kind'>): QuizSection => q.kind === 'nursing' ? 'nursing' : 'english'
export const sectionNames: Record<QuizSection, string> = { english: '英文', nursing: '護理英文' }

/** Why a question went wrong. English understanding and nursing knowledge are kept apart on purpose. */
export const causeOptions: Record<QuizSection, string[]> = {
  english: ['單字不認得', '看不懂整句', '看太快', '用猜的'],
  nursing: ['看不懂英文', '護理觀念不熟', '看漏條件', '用猜的'],
}

export interface QuizRecord {
  day: string
  picked: number
  correct: boolean
  tries: number
  misses: number
  /** Opened the Chinese version of the question on the last try. */
  zh?: boolean
  causes?: string[]
}
export const quizRecordKey = (id: string) => 'quiz.ans.' + id
export const quizPosKey = (s: QuizSection) => 'quiz.pos.' + s
export const quizSectionKey = 'quiz.section'

export function readQuizRecord(notes: Record<string, string>, id: string): QuizRecord | null {
  try {
    const v = notes[quizRecordKey(id)]
    return v ? JSON.parse(v) as QuizRecord : null
  } catch { return null }
}

export function recordQuizAnswer(notes: Record<string, string>, item: QuizItem, picked: number, day: string, usedZh = false) {
  const old = readQuizRecord(notes, item.id)
  const correct = picked === item.answerIndex
  const rec: QuizRecord = {
    day, picked, correct,
    tries: (old?.tries ?? 0) + 1,
    misses: (old?.misses ?? 0) + (correct ? 0 : 1),
    ...(usedZh ? { zh: true } : {}),
    ...(old?.causes?.length ? { causes: old.causes } : {}),
  }
  return { ...notes, [quizRecordKey(item.id)]: JSON.stringify(rec) }
}

export function recordQuizCause(notes: Record<string, string>, id: string, cause: string) {
  const old = readQuizRecord(notes, id)
  if (!old || old.correct) return notes
  return { ...notes, [quizRecordKey(id)]: JSON.stringify({ ...old, causes: [...(old.causes ?? []), cause] }) }
}

export const quizPosition = (notes: Record<string, string>, s: QuizSection) => Math.max(0, Math.floor(Number(notes[quizPosKey(s)]) || 0))
export const advanceQuiz = (notes: Record<string, string>, s: QuizSection) => ({ ...notes, [quizPosKey(s)]: String(quizPosition(notes, s) + 1) })

/** Questions answered wrong come back after a day, before the next one in order. */
export function nextQuizItem(items: readonly QuizItem[], section: QuizSection, notes: Record<string, string>, today: string):
  { item: QuizItem; retry: boolean; index: number; total: number } | null {
  const list = items.filter(q => sectionOf(q) === section)
  if (!list.length) return null
  const yesterday = addDays(today, -1)
  const retry = list.find(q => {
    const r = readQuizRecord(notes, q.id)
    return !!r && !r.correct && r.day <= yesterday
  })
  if (retry) return { item: retry, retry: true, index: list.indexOf(retry), total: list.length }
  const index = quizPosition(notes, section) % list.length
  return { item: list[index], retry: false, index, total: list.length }
}

export function quizSummary(items: readonly QuizItem[], section: QuizSection, notes: Record<string, string>) {
  const list = items.filter(q => sectionOf(q) === section)
  const recs = list.map(q => readQuizRecord(notes, q.id)).filter((r): r is QuizRecord => !!r)
  const causes: Record<string, number> = {}
  for (const r of recs) for (const c of r.causes ?? []) causes[c] = (causes[c] ?? 0) + 1
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]
  return {
    total: list.length,
    answered: recs.length,
    wrongNow: recs.filter(r => !r.correct).length,
    usedZh: recs.filter(r => r.zh).length,
    topCause: top ? { cause: top[0], count: top[1] } : null,
  }
}

/** How many quiz questions were answered on a day. */
export function answeredOn(notes: Record<string, string>, day: string) {
  let n = 0
  for (const [k, v] of Object.entries(notes)) {
    if (!k.startsWith('quiz.ans.')) continue
    try { if ((JSON.parse(v) as QuizRecord).day === day) n++ } catch { /* skip */ }
  }
  return n
}
