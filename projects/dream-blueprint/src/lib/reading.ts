import { levelTarget, openSteps } from './unlock'
import { unfinishedItems, writeUnfinished } from './unfinished'
import { firstOfDay, isDatedGrade, mergeDailyGrades } from './firstDailyGrade'
export { levelTarget } from './unlock'

/** Graded reading from A1 up to IELTS-style passages. Each wrong answer asks why, so word, sentence,
 *  locating and question-type problems can be told apart. */
export type ReadLevel = 'A1' | 'A2' | 'B1' | 'B2'
export type ReadBand = 'easy' | 'mid' | 'hard'
export interface ReadStep { level: ReadLevel; band: ReadBand }
export type ReadStepKey = `${ReadLevel}-${ReadBand}`
export type QType = 'main' | 'detail' | 'reference' | 'vocab' | 'evidence' | 'tfng' | 'heading'
export interface ReadQuestion { type: QType; q: string; options: string[]; answer: number; why: string; evidence?: string; additional?: true; revision?: number }
export interface ReadPassage { id: string; level: ReadLevel; band: ReadBand; title: string; topic: string; words: number; paras: string[]; zh: string; qs: ReadQuestion[]; ielts?: boolean
  /** Bridge-unit passages: the unit they belong to; held = the unseen test passage, never shown for browsing. */
  unit?: number; held?: boolean }

export const readLevels: { id: ReadLevel; name: string; note: string }[] = [
  { id: 'A1', name: 'A1 入門', note: '40–100 字，從短短的現在式，慢慢讀到日常小短文' },
  { id: 'A2', name: 'A2 基礎', note: '100–160 字，從過去的事情，讀到計畫、比較和條件' },
  { id: 'B1', name: 'B1 進階', note: '160–260 字，練習推論、找證據和比較不同意見' },
  { id: 'B2', name: 'B2 雅思題型', note: '250–600 字，練習段落標題、細節和是非沒提到（T/F/NG）' },
]
export const readBands: { id: ReadBand; name: string; note: string }[] = [
  { id: 'easy', name: '簡單', note: '短一點，先抓主題和明確的線索' },
  { id: 'mid', name: '中等', note: '句子多一點，練習連起前後的意思' },
  { id: 'hard', name: '難', note: '文章更完整，練習整合線索再作答' },
]
export const readSteps: ReadStep[] = readLevels.flatMap(l => readBands.map(b => ({ level: l.id, band: b.id })))
export const readStepKey = (s: ReadStep): ReadStepKey => `${s.level}-${s.band}`
export const readStepName = (s: ReadStep) => s.level + ' ' + readBands.find(b => b.id === s.band)!.name
const atStep = (p: ReadStep, s: ReadStep) => p.level === s.level && p.band === s.band
export const typeNames: Record<QType, string> = {
  main: '主旨', detail: '細節', reference: '代名詞指什麼', vocab: '猜字義', evidence: '找證據', tfng: '是／非／沒提到', heading: '段落標題',
}
export const readCauses = ['單字不認得', '句子看不懂', '找不到答案在哪', '題型不熟', '看太快']

/** The latest attempt, plus `best`: the best attempt that counts. A redo on the same day comes right after seeing the
 *  answers, so it is practice and never replaces the record; a lower score on a later day never erases a pass. */
export interface ReadAttempt { day: string; correct: number; total: number; zh?: boolean; at?: number }
export interface ReadRecord { day: string; at?: number; picks: number[]; correct: number; total: number; causes?: Record<number, string>; zh?: boolean; tries: number; best?: ReadAttempt; practice?: boolean
  firstByDay?: ReadAttempt[]; priorBest?: ReadAttempt; questionRevisions?: Record<number, number>
  /** New attempts identify the band edition. Retakes keep the earlier edition's best grade as evidence of access
   *  already earned; original records remain readable without converting or replacing any storage keys. */
  bandVersion?: 1; legacyBest?: ReadAttempt }
export const readKey = (id: string) => 'read.' + id
/** The general passages below B2 that come with comprehension questions (A1, A2, B1 in reading.json; a test keeps this number true).
 *  Today's list sends reading there until they have all been read, then to the graded passages. */
export const QUESTION_PASSAGES = 105
/** How many of those have been read: their ids start with the level (read.a1-…, read.a2-…, read.b1-…). */
export const plainReadCount = (notes: Record<string, string>) => Object.keys(notes).filter(k => /^read\.(a1|a2|b1)-/.test(k)).length

export function readRecord(notes: Record<string, string>, id: string): ReadRecord | null {
  try { const v = notes[readKey(id)]; return v ? JSON.parse(v) as ReadRecord : null } catch { return null }
}
const clean = (a: ReadAttempt) => !a.zh && a.correct / Math.max(1, a.total) >= 0.7
/** Whether attempt `a` beats `b`: passing (70%+, Chinese not opened) beats not passing, then the higher score. */
export const betterRead = (a: ReadAttempt, b?: ReadAttempt) => !b || (clean(a) && !clean(b)) || (clean(a) === clean(b) && a.correct / Math.max(1, a.total) > b.correct / Math.max(1, b.total))
const readGrade = ({ day, at, correct, total, zh }: ReadAttempt): ReadAttempt => ({ day, at, correct, total, ...(zh ? { zh: true } : {}) })
const firstReadGrades = (record: ReadRecord) => Array.isArray(record.firstByDay)
  ? record.firstByDay.filter(isDatedGrade) : record.practice ? [] : [readGrade(record)]
const priorReadGrade = (record: ReadRecord) => {
  if (record.firstByDay) return record.priorBest
  return record.practice || record.best?.day !== record.day ? record.best : undefined
}
export const hasReadSubmission = (record: ReadRecord | null, day: string) =>
  !!record && (record.day === day || firstReadGrades(record).some(grade => grade.day === day))
const bestReadFrom = (grades: readonly ReadAttempt[], prior?: ReadAttempt) =>
  grades.reduce<ReadAttempt | undefined>((best, grade) => betterRead(grade, best) ? grade : best, prior)
export function mergeReadRecords(a: ReadRecord, b: ReadRecord): ReadRecord {
  const formal = mergeDailyGrades(firstReadGrades(a), firstReadGrades(b))
  const olderBest = priorReadGrade(a)
  const newerBest = priorReadGrade(b)
  const priorBest = olderBest && betterRead(olderBest, newerBest) ? olderBest : newerBest
  const latest = a.day > b.day ? a : b.day > a.day ? b
    : !!a.practice !== !!b.practice ? a.practice ? b : a
    : a.at === b.at && JSON.stringify(a.picks) === JSON.stringify(b.picks) ? { ...a, ...b, causes: { ...a.causes, ...b.causes } }
    : firstOfDay(a, b)
  return { ...latest, firstByDay: formal, priorBest,
    best: bestReadFrom(formal, priorBest), legacyBest: b.legacyBest ?? a.legacyBest, tries: Math.max(a.tries ?? 0, b.tries ?? 0) }
}
export function saveRead(notes: Record<string, string>, id: string,
  rec: Omit<ReadRecord, 'at' | 'tries' | 'best' | 'practice' | 'bandVersion' | 'legacyBest' | 'firstByDay' | 'priorBest'>) {
  const old = readRecord(notes, id)
  if (old && hasReadSubmission(old, rec.day)) {
    return { ...notes, [readKey(id)]: JSON.stringify({ ...old, tries: (old.tries ?? 0) + 1 }) }
  }
  const at = Math.max(Date.now(), (old?.at ?? 0) + 1)
  const grade = readGrade({ ...rec, at })
  const legacyBest = old?.bandVersion === 1 ? old.legacyBest : old && (old.best ?? readGrade(old))
  const next: ReadRecord = { ...rec, at, tries: (old?.tries ?? 0) + 1, best: grade, firstByDay: [grade], bandVersion: 1, legacyBest: legacyBest ?? undefined }
  return { ...notes, [readKey(id)]: JSON.stringify(old ? mergeReadRecords(old, next) : next) }
}
/** A passage is passed at 70% or better without opening the Chinese, on an attempt that counts. */
export const passed = (r: ReadRecord | null) => !!r && clean(r.best ?? r)

/** Frozen pre-band passage IDs: only grades from that edition can preserve the old level thresholds. Newly earned
 *  grades never qualify for this shortcut, even when they belong to an old passage. */
const legacyGroups: { level: ReadLevel; ids: readonly string[] }[][] = [
  [
    { level: 'A1', ids: ['a1-lin', 'a1-clinic', 'a1-water', 'a1-grandma', 'a1-hospital', 'a1-family', 'a1-weekend', 'a1-room', 'a1-breakfast', 'a1-weather', 'a1-dog', 'a1-note', 'a1-market', 'a1-library', 'a1-teeth'] },
    { level: 'A2', ids: ['a2-first-shift', 'a2-sleep', 'a2-handwash', 'a2-walk', 'a2-message', 'a2-tainan', 'a2-wallet', 'a2-cafe', 'a2-class-ad', 'a2-typhoon', 'a2-cooking', 'a2-eyes', 'a2-grandpa', 'a2-plans', 'a2-flu-notice'] },
    { level: 'B1', ids: ['b1-night', 'b1-sugar', 'b1-interpreter', 'b1-falls'] },
    { level: 'B2', ids: ['b2-semmelweis', 'b2-telehealth', 'b2-shortage', 'br43-r1', 'br43-r2', 'br43-held', 'br44-r1', 'br44-r2', 'br44-held', 'br45-r1', 'br45-r2', 'br45-held', 'br46-r1', 'br46-r2', 'br46-held', 'br47-r1', 'br47-r2', 'br47-held', 'br48-r1', 'br48-r2', 'br48-held'] }
  ],
  [
    { level: 'A2', ids: ['n-a2-clean-hands', 'n-a2-falls', 'n-a2-visiting', 'n-a2-pain', 'n-a2-fasting', 'n-a2-night-shift', 'n-a2-patient-id', 'n-a2-sleep'] },
    { level: 'B1', ids: ['n-b1-isolation', 'n-b1-heart-failure', 'n-b1-hypoglycemia', 'n-b1-pressure-injury', 'n-b1-sbar', 'n-b1-delirium', 'n-b1-iv-line', 'n-b1-wound-home', 'n-b1-med-rights', 'n-b1-stroke', 'n-b1-cpr', 'n-b1-chemo-food', 'n-b1-bedside-handoff', 'n-b1-job-interview', 'n-b1-patient-rights'] },
    { level: 'B2', ids: ['n-b2-nclex'] }
  ]
]
function preservedLevel(all: readonly ReadPassage[], notes: Record<string, string>): ReadLevel | undefined {
  const ids = new Set(all.map(p => p.id))
  const groups = legacyGroups.find(gs => gs.some(g => g.ids.some(id => ids.has(id))))
  if (!groups) return undefined
  const earlier = (id: string) => {
    const r = readRecord(notes, id)
    return r?.bandVersion === 1 ? r.legacyBest : r?.best ?? r ?? undefined
  }
  const recorded = groups.map(g => g.ids.some(id => earlier(id)))
  if (!recorded.some(Boolean)) return undefined
  const open = openSteps(groups.map(g => g.ids.filter(id => { const a = earlier(id); return !!a && clean(a) }).length >= levelTarget(g.ids.length)))
  return groups.filter((_, i) => open[i] || recorded[i]).at(-1)?.level
}
/** Passages read in the same levels with records of their own (閱讀測驗 puts the past-exam passages here): they count
 *  toward a band's passes and keep a band they were read in open, but a band's target stays the graded passages' own,
 *  so more passages never mean more to read before the next band opens. */
export interface ReadExtra { id: string; level: ReadLevel; band: ReadBand; recorded: boolean; passed: boolean; day?: string }
export function readStepProgress(all: readonly ReadPassage[], step: ReadStep, notes: Record<string, string>, extra: readonly ReadExtra[] = []) {
  const here = all.filter(p => atStep(p, step))
  const more = extra.filter(e => atStep(e, step))
  return { total: here.length + more.length, ok: here.filter(p => passed(readRecord(notes, p.id))).length + more.filter(e => e.passed).length, target: levelTarget(here.length) }
}
function readingPosition(all: readonly ReadPassage[], notes: Record<string, string>, extra: readonly ReadExtra[] = []) {
  const level = preservedLevel(all, notes)
  let recorded = -1, firstPreserved = -1, lastPreserved = -1
  for (const [i, s] of readSteps.entries()) {
    const here = all.filter(p => atStep(p, s))
    if (here.some(p => readRecord(notes, p.id) !== null) || extra.some(e => e.recorded && atStep(e, s))) recorded = i
    if (here.length && s.level === level) {
      if (firstPreserved < 0) firstPreserved = i
      lastPreserved = i
    }
  }
  // The suggestion starts at the first band not yet passed (step by step from the easiest), skipping only levels the
  // previous edition had already unlocked. Bands he has read stay open either way (frontier).
  return { frontier: Math.max(recorded, lastPreserved), suggestedFrom: Math.max(firstPreserved, 0) }
}
/** The first band not yet passed, from the easiest, or from the first band of a level unlocked in the previous edition. */
export function suggestedLevel(all: readonly ReadPassage[], notes: Record<string, string>, extra: readonly ReadExtra[] = []): ReadStep {
  const { suggestedFrom } = readingPosition(all, notes, extra)
  for (const s of readSteps.slice(suggestedFrom)) {
    const progress = readStepProgress(all, s, notes, extra)
    if (progress.total && progress.ok < progress.target) return s
  }
  return readSteps.filter(s => all.some(p => atStep(p, s))).at(-1) ?? readSteps[0]
}
/** Open one band at a time. Empty bands do not block the next one. Recorded or previously unlocked bands keep their
 *  whole prefix open, and completing that position can open the next band without repeating the new earlier work. */
export function readLevelsOpen(all: readonly ReadPassage[], notes: Record<string, string>, extra: readonly ReadExtra[] = []): Record<ReadStepKey, boolean> {
  const { frontier } = readingPosition(all, notes, extra)
  const open = openSteps(readSteps.map((s, i) => {
    const { ok, target } = readStepProgress(all, s, notes, extra)
    return i < frontier || ok >= target
  }))
  return Object.fromEntries(readSteps.map((s, i) => [readStepKey(s), open[i]])) as Record<ReadStepKey, boolean>
}
/** Said when 下一篇 moves to the suggested band: up when the band before it is passed, or back to the first band not passed
 *  yet (after a passage read in a later band, for example one left halfway). */
export function moveNote(from: ReadStep, to: ReadStep) {
  const up = readSteps.findIndex(s => readStepKey(s) === readStepKey(to)) > readSteps.findIndex(s => readStepKey(s) === readStepKey(from))
  return up ? '前面這一小級過關的篇數夠了，升到 ' + readStepName(to) + '。想留在原本的小級多讀幾篇，按上面的按鈕就好。'
    : '接下來從還沒過關的 ' + readStepName(to) + '讀起，一小級一小級往上。想留在 ' + readStepName(from) + '，按上面的按鈕就好。'
}
/** The preceding nonempty band, for the lock's concrete requirement. */
export function previousReadStep(all: readonly ReadPassage[], step: ReadStep) {
  return readSteps.slice(0, readSteps.findIndex(s => readStepKey(s) === readStepKey(step))).filter(s => all.some(p => atStep(p, s))).at(-1)
}
/** Unread passages first, then ones not yet passed (oldest first), then the rest. */
export function nextReading(all: readonly ReadPassage[], step: ReadStep | null, notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = all.filter(p => (!step || atStep(p, step)) && !skip.includes(p.id))
  const fresh = pool.find(p => !readRecord(notes, p.id))
  if (fresh) return fresh
  const redo = pool.filter(p => !passed(readRecord(notes, p.id))).sort((a, b) => readRecord(notes, a.id)!.day.localeCompare(readRecord(notes, b.id)!.day))
  return redo[0] ?? pool[0] ?? null
}
/** A fixed shuffle for one passage: the same order every time it opens (a reload does not change it). */
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
function shuffled<T>(xs: readonly T[], rnd: () => number) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
/** A question as shown: options in their shown order, `answer` in that order; `from` is its place in the data and
 *  `optionFrom[i]` the data index of shown option i. */
export interface ShownQuestion extends ReadQuestion { from: number; optionFrom: number[] }
/** Options are shuffled except for True / False / Not Given. Those statements swap places among themselves.
 *  Additional statements stay at the end and out of the original shuffle, so existing in-progress answers
 *  keep the same question and option positions. Completed answers are saved in the data's own order. */
export function shownPassage(p: ReadPassage): Omit<ReadPassage, 'qs'> & { qs: ShownQuestion[] } {
  const rnd = seeded(p.id)
  const tf = p.qs.flatMap((q, i) => q.type === 'tfng' && !q.additional ? [i] : [])
  const tfOrder = shuffled(tf, rnd)
  return { ...p, qs: p.qs.map((q0, i) => {
    const from = q0.type === 'tfng' && !q0.additional ? tfOrder[tf.indexOf(i)] : i
    const q = p.qs[from]
    const optionFrom = q.type === 'tfng' ? q.options.map((_, j) => j) : shuffled(q.options.map((_, j) => j), rnd)
    return { ...q, options: optionFrom.map(j => q.options[j]), answer: optionFrom.indexOf(q.answer), from, optionFrom }
  }) }
}
/** Shown answers (and the causes picked for wrong ones) back in the data's order, for saving. */
export function savedPicks(shown: readonly ShownQuestion[], picks: readonly number[]) {
  const out: number[] = new Array(shown.length).fill(-1)
  picks.forEach((pick, k) => { if (shown[k]) out[shown[k].from] = shown[k].optionFrom[pick] ?? -1 })
  return out
}
/** Saved answers (data order) as shown, to show an earlier attempt again. */
export function shownPicks(shown: readonly ShownQuestion[], saved: readonly number[], revisions?: Record<number, number>) {
  return shown.map(q => {
    if (!usesCurrentQuestion(q, q.from, revisions)) return undefined
    const index = q.optionFrom.indexOf(saved[q.from])
    return index < 0 ? undefined : index
  }) as number[]
}
export function savedCauses(shown: readonly ShownQuestion[], causes: Record<number, string>) {
  return Object.fromEntries(Object.entries(causes).map(([k, c]) => [String(shown[Number(k)]?.from ?? k), c]))
}
/** Question versions are indexed in the data order even when the learner saw them shuffled. */
export function savedQuestionRevisions(questions: readonly (ReadQuestion & { from?: number })[]) {
  const stamps = questions.flatMap((q, i) => q.revision ? [[q.from ?? i, q.revision] as const] : [])
  return stamps.length ? Object.fromEntries(stamps) : undefined
}
export function usesCurrentQuestion(question: ReadQuestion, from: number, revisions?: Record<number, number>) {
  return (question.revision ?? 0) === (revisions?.[from] ?? 0)
}
/** Resume to the first revised question that had a displayed answer, keeping the unaffected prefix and its causes. */
export function prepareReadingDraft(p: ReadingProgress, questions: readonly ShownQuestion[]): ReadingProgress {
  const first = questions.findIndex((q, i) => i < p.picks.length && !usesCurrentQuestion(q, q.from, p.questionRevisions))
  if (first < 0) return p
  return { ...p, picks: p.picks.slice(0, first), causes: Object.fromEntries(Object.entries(p.causes ?? {}).filter(([index]) => Number(index) < first)) }
}
/** The answers so far, in display order, saved separately for every passage. */
export interface ReadingProgress { id: string; picks: number[]; causes?: Record<number, string>; zh?: boolean; updatedAt?: number; questionRevisions?: Record<number, number> }
export const readingProgressKey = (set: string) => 'reading.progress.' + set
export function listReadingProgress(notes: Record<string, string>, set: string): ReadingProgress[] {
  return unfinishedItems(notes, readingProgressKey(set), (value): value is ReadingProgress => {
    const p = value as ReadingProgress
    return Array.isArray(p.picks) && p.picks.every(n => Number.isInteger(n))
  })
}
export function readReadingProgress(notes: Record<string, string>, set: string, id?: string): ReadingProgress | null {
  return listReadingProgress(notes, set).find(p => id === undefined || p.id === id) ?? null
}
export function saveReadingProgress(notes: Record<string, string>, set: string, p: ReadingProgress | null, id = p?.id ?? readReadingProgress(notes, set)?.id) {
  return id ? writeUnfinished(notes, readingProgressKey(set), id, p) : notes
}
/** Match the draft and completed record seen by the question that is still on screen. */
export function readingVersion(notes: Record<string, string>, set: string, id: string, recordKey: string) {
  return JSON.stringify([readReadingProgress(notes, set, id), notes[recordKey]])
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
    if (r.practice) continue // Older releases kept the practice answers but could no longer recover their formal choices.
    p.qs.forEach((q, i) => {
      if (i >= r.picks.length || !usesCurrentQuestion(q, i, r.questionRevisions)) return
      const t = types[q.type] ??= { right: 0, total: 0 }
      t.total++
      if (r.picks[i] === q.answer) t.right++
      const c = r.causes?.[i]
      if (c) causes[c] = (causes[c] ?? 0) + 1
    })
  }
  const weakest = (Object.entries(types) as [QType, { right: number; total: number }][])
    .filter(([, v]) => v.total >= 2).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)[0]
  const topCause = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]
  return { done, total: all.length, types, weakest: weakest && weakest[1].right < weakest[1].total ? weakest[0] : undefined, topCause: topCause?.[0] }
}
