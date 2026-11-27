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
  /** Identifies the answer for attaching a later self-reported cause. */
  at?: number
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
    day, picked, correct, at: Math.max(Date.now(), (old?.at ?? 0) + 1),
    tries: (old?.tries ?? 0) + 1,
    misses: (old?.misses ?? 0) + (correct ? 0 : 1),
    ...(usedZh ? { zh: true } : {}),
    ...(old?.causes?.length ? { causes: old.causes } : {}),
  }
  return { ...notes, [quizRecordKey(item.id)]: JSON.stringify(rec) }
}

export function recordQuizCause(notes: Record<string, string>, id: string, cause: string, at: number) {
  const old = readQuizRecord(notes, id)
  if (!old || old.correct || old.at !== at) throw new Error('這題已有另一份作答，無法把這筆錯因加到那一次。')
  return { ...notes, [quizRecordKey(id)]: JSON.stringify({ ...old, causes: [...(old.causes ?? []), cause] }) }
}

export const quizPosition = (notes: Record<string, string>, s: QuizSection) => Math.max(0, Math.floor(Number(notes[quizPosKey(s)]) || 0))
/** Advance beyond the answered item, including any recently missed items skipped along the way. */
export function advanceQuiz(notes: Record<string, string>, s: QuizSection, index: number, listSize: number) {
  const pos = quizPosition(notes, s)
  const skipped = (index - pos % listSize + listSize) % listSize
  return { ...notes, [quizPosKey(s)]: String(pos + skipped + 1) }
}

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
  const start = quizPosition(notes, section) % list.length
  for (let offset = 0; offset < list.length; offset++) {
    const index = (start + offset) % list.length
    const item = list[index]
    const rec = readQuizRecord(notes, item.id)
    if (!rec || rec.correct || rec.day < today) return { item, retry: false, index, total: list.length }
  }
  return null
}

type SubjectItem = QuizItem & { subjects?: string[] }
/** One licensing-exam subject's nursing questions, in the bank's order. */
export const subjectQuizzes = <T extends SubjectItem>(items: readonly T[], subject: string) => items.filter(q => sectionOf(q) === 'nursing' && q.subjects?.includes(subject))
/** Questions of one licensing-exam subject (from the 國考科目 page): one answered wrong and due again first, then one
 *  never answered, then the one answered longest ago (in the bank's order among the same day). One already answered
 *  today does not come again today — a wrong one comes back tomorrow — so null also means: all done for today
 *  (`subjectDoneToday`). The shared order of the whole bank is not moved. */
export function nextSubjectQuiz(items: readonly SubjectItem[], subject: string, notes: Record<string, string>, today: string):
  { item: QuizItem; retry: boolean; index: number; total: number } | null {
  const list = subjectQuizzes(items, subject)
  if (!list.length) return null
  const yesterday = addDays(today, -1)
  const at = (item: QuizItem, retry = false) => ({ item, retry, index: list.indexOf(item), total: list.length })
  const retry = list.find(q => { const r = readQuizRecord(notes, q.id); return !!r && !r.correct && r.day <= yesterday })
  if (retry) return at(retry, true)
  const fresh = list.find(q => !readQuizRecord(notes, q.id))
  if (fresh) return at(fresh)
  const waiting = list.filter(q => readQuizRecord(notes, q.id)!.day < today)
  if (!waiting.length) return null
  return at([...waiting].sort((a, b) => readQuizRecord(notes, a.id)!.day.localeCompare(readQuizRecord(notes, b.id)!.day))[0])
}
/** Every question of the subject has been answered today (nothing is due again before tomorrow). */
export const subjectDoneToday = (items: readonly SubjectItem[], subject: string, notes: Record<string, string>, today: string) => {
  const list = subjectQuizzes(items, subject)
  return list.length > 0 && list.every(q => readQuizRecord(notes, q.id)?.day === today)
}
/** The counts shown above the questions; with `subject`, the same questions that are being asked. */
export function quizSummary(items: readonly SubjectItem[], section: QuizSection, notes: Record<string, string>, subject?: string) {
  const list = subject ? subjectQuizzes(items, subject) : items.filter(q => sectionOf(q) === section)
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
/** Questions answered on a day; pass `only` to count one section (e.g. nursing ids) and nothing else. */
export function answeredOn(notes: Record<string, string>, day: string, only?: ReadonlySet<string>) {
  let n = 0
  for (const [k, v] of Object.entries(notes)) {
    if (!k.startsWith('quiz.ans.')) continue
    if (only && !only.has(k.slice('quiz.ans.'.length))) continue
    try { if ((JSON.parse(v) as QuizRecord).day === day) n++ } catch { /* skip */ }
  }
  return n
}
