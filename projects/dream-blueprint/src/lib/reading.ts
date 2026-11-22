/** Graded reading from A1 up to IELTS-style passages. Each wrong answer asks why, so word, sentence,
 *  locating and question-type problems can be told apart. */
export type ReadLevel = 'A1' | 'A2' | 'B1' | 'B2'
export type QType = 'main' | 'detail' | 'reference' | 'vocab' | 'evidence' | 'tfng' | 'heading'
export interface ReadQuestion { type: QType; q: string; options: string[]; answer: number; why: string; evidence?: string }
export interface ReadPassage { id: string; level: ReadLevel; title: string; topic: string; words: number; paras: string[]; zh: string; qs: ReadQuestion[]; ielts?: boolean
  /** Bridge-unit passages: the unit they belong to; held = the unseen test passage, never shown for browsing. */
  unit?: number; held?: boolean }

export const readLevels: { id: ReadLevel; name: string; note: string }[] = [
  { id: 'A1', name: 'A1 入門', note: '短文 70 字左右，現在式、日常和看診' },
  { id: 'A2', name: 'A2 基礎', note: '120 字左右，過去式、訊息和衛教' },
  { id: 'B1', name: 'B1 進階', note: '150–200 字，需要推論和找證據' },
  { id: 'B2', name: 'B2 雅思題型', note: '200 字以上，段落標題、是非不知（T/F/NG）' },
]
export const typeNames: Record<QType, string> = {
  main: '主旨', detail: '細節', reference: '代名詞指什麼', vocab: '猜字義', evidence: '找證據', tfng: '是／非／沒提到', heading: '段落標題',
}
export const readCauses = ['單字不認得', '句子看不懂', '找不到答案在哪', '題型不熟', '看太快']

/** The latest attempt, plus `best`: the best attempt that counts. A redo on the same day comes right after seeing the
 *  answers, so it is practice and never replaces the record; a lower score later never erases a pass. */
export interface ReadAttempt { day: string; correct: number; total: number; zh?: boolean }
export interface ReadRecord { day: string; picks: number[]; correct: number; total: number; causes?: Record<number, string>; zh?: boolean; tries: number; best?: ReadAttempt; practice?: boolean }
export const readKey = (id: string) => 'read.' + id
/** The general passages below B2 that come with comprehension questions (A1, A2, B1 in reading.json; a test keeps this number true).
 *  Today's list sends reading there until they have all been read, then to the graded passages. */
export const QUESTION_PASSAGES = 14
/** How many of those have been read: their ids start with the level (read.a1-…, read.a2-…, read.b1-…). */
export const plainReadCount = (notes: Record<string, string>) => Object.keys(notes).filter(k => /^read\.(a1|a2|b1)-/.test(k)).length

export function readRecord(notes: Record<string, string>, id: string): ReadRecord | null {
  try { const v = notes[readKey(id)]; return v ? JSON.parse(v) as ReadRecord : null } catch { return null }
}
const clean = (a: ReadAttempt) => !a.zh && a.correct / Math.max(1, a.total) >= 0.7
const better = (a: ReadAttempt, b?: ReadAttempt) => !b || (clean(a) && !clean(b)) || (clean(a) === clean(b) && a.correct / Math.max(1, a.total) > b.correct / Math.max(1, b.total))
export function saveRead(notes: Record<string, string>, id: string, rec: Omit<ReadRecord, 'tries' | 'best' | 'practice'>) {
  const old = readRecord(notes, id)
  const oldBest: ReadAttempt | undefined = old?.best ?? (old ? { day: old.day, correct: old.correct, total: old.total, ...(old.zh ? { zh: true } : {}) } : undefined)
  const practice = !!old && old.day === rec.day
  const attempt: ReadAttempt = { day: rec.day, correct: rec.correct, total: rec.total, ...(rec.zh ? { zh: true } : {}) }
  const best = !practice && better(attempt, oldBest) ? attempt : oldBest ?? attempt
  return { ...notes, [readKey(id)]: JSON.stringify({ ...rec, tries: (old?.tries ?? 0) + 1, best, ...(practice ? { practice: true } : {}) }) }
}
/** A passage is passed at 70% or better without opening the Chinese, on an attempt that counts. */
export const passed = (r: ReadRecord | null) => !!r && clean(r.best ?? r)

/** The level to work on: the lowest one with fewer than three passed passages. */
export function suggestedLevel(all: readonly ReadPassage[], notes: Record<string, string>): ReadLevel {
  for (const l of readLevels) {
    const here = all.filter(p => p.level === l.id)
    if (here.filter(p => passed(readRecord(notes, p.id))).length < Math.min(3, here.length)) return l.id
  }
  return 'B2'
}
/** Unread passages first, then ones not yet passed (oldest first), then the rest. */
export function nextReading(all: readonly ReadPassage[], level: ReadLevel, notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = all.filter(p => p.level === level && !skip.includes(p.id))
  const fresh = pool.find(p => !readRecord(notes, p.id))
  if (fresh) return fresh
  const redo = pool.filter(p => !passed(readRecord(notes, p.id))).sort((a, b) => readRecord(notes, a.id)!.day.localeCompare(readRecord(notes, b.id)!.day))
  return redo[0] ?? pool[0] ?? null
}
/** Which question types and causes go wrong most, across everything read. */
export function readSummary(all: readonly ReadPassage[], notes: Record<string, string>) {
  const types: Partial<Record<QType, { right: number; total: number }>> = {}
  const causes: Record<string, number> = {}
  let done = 0
  for (const p of all) {
    const r = readRecord(notes, p.id)
    if (!r) continue
    done++
    p.qs.forEach((q, i) => {
      const t = types[q.type] ??= { right: 0, total: 0 }
      t.total++
      if (r.picks[i] === q.answer) t.right++
    })
    for (const c of Object.values(r.causes ?? {})) causes[c] = (causes[c] ?? 0) + 1
  }
  const weakest = (Object.entries(types) as [QType, { right: number; total: number }][])
    .filter(([, v]) => v.total >= 2).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)[0]
  const topCause = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]
  return { done, total: all.length, types, weakest: weakest && weakest[1].right < weakest[1].total ? weakest[0] : undefined, topCause: topCause?.[0] }
}
