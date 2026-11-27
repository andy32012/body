import { mergeCorrectionFollowUps, type CorrectionFollowUp } from './correctionHistory'
import { legacyRecordId } from './recordId'
import type { Sentence } from './todayLesson'

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
export interface HeardRecord {
  day: string
  correct: number
  total: number
  counted?: boolean
  plays?: number
  at?: number
  lessonDate?: string
  lessonTarget?: string
  picks?: number[]
}
export function readHeard(notes: Record<string, string>, unit: number): HeardRecord | null {
  try { return notes[heardKey(unit)] ? JSON.parse(notes[heardKey(unit)]) as HeardRecord : null } catch { return null }
}

/** One guided lesson, kept under the day it was started; it also lets the plan tick 「今天這一堂」.
 *  'lesson.active' points at an unfinished one, so closing the page or coming back tomorrow continues it. */
export const lessonKey = (day: string) => 'lesson.' + day
export const activeKey = 'lesson.active'
export type LessonPhase = 'recall' | 'listen' | 'write' | 'sound' | 'vary' | 'express' | 'done'
export interface Attempt { sentenceId: string; rating: 'correct' | 'minor' | 'again'; grammar: string[]; revealed: boolean; answer?: string; verified?: boolean; attempted?: boolean }
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
  /** The text left in the box when the learner completed the lesson. */
  finalAnswer?: string
  /** Identifies the latest graded submission even if an identical answer has been graded more than once. */
  lastGradeId?: string
  /** Help layers already open when the first answer was submitted. */
  firstHelp?: string[]
  /** Saw the full correction before rewriting. */
  revealed?: boolean
  /** The last rewrite fixed every issue from the round before it (not just "sent again"). */
  fixed?: boolean
  /** The same task answered on another device the same day (kept by 「兩份合併」, so neither sentence is lost). */
  others?: ExpressAnswer[]
  /** Each question and answer is tied to the specific correction it discusses. */
  discussion?: CorrectionFollowUp[]
}
export type ExpressAnswer = Pick<ExpressRecord, 'first' | 'firstResult' | 'lastAnswer' | 'last' | 'finalAnswer'>

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
  if (older.length !== newer.length || older.some((a, i) => a.sentenceId !== newer[i].sentenceId)) {
    const [further, other] = newer.length > older.length ? [newer, older] : [older, newer]
    return further.map(a => a.attempted !== false ? a
      : other.find(b => b.sentenceId === a.sentenceId && b.attempted === true) ?? a)
  }
  return older.map((a, i) => {
    const b = newer[i]
    if ((a.attempted === false) !== (b.attempted === false)) return a.attempted === false ? b : a
    const careful = ratingRank[b.rating] < ratingRank[a.rating] ? b : a
    return { ...careful, revealed: !!(a.revealed || b.revealed), grammar: unique([...(a.grammar ?? []), ...(b.grammar ?? [])]) }
  })
}
const answerOf = (e: ExpressRecord): ExpressAnswer => ({
  ...(e.first !== undefined ? { first: e.first } : {}), ...(e.firstResult ? { firstResult: e.firstResult } : {}),
  ...(e.lastAnswer !== undefined ? { lastAnswer: e.lastAnswer } : {}), ...(e.last ? { last: e.last } : {}),
  ...(e.finalAnswer !== undefined ? { finalAnswer: e.finalAnswer } : {}),
})
/** The open task from two devices: the one that got further goes on; the other device's sentences are kept beside it. */
export function mergeExpress(older: ExpressRecord, newer: ExpressRecord): ExpressRecord
export function mergeExpress(older?: ExpressRecord, newer?: ExpressRecord): ExpressRecord | undefined
export function mergeExpress(older?: ExpressRecord, newer?: ExpressRecord): ExpressRecord | undefined {
  if (!older) return newer
  if (!newer) return older
  const further = (e: ExpressRecord) => (e.fixed ? 100 : 0) + (e.corrections ?? 0) * 10 + (e.last ? 2 : 0) + (e.firstResult ? 1 : 0)
  const [main, other] = further(newer) > further(older) ? [newer, older] : [older, newer]
  const kept = [...(main.others ?? []), ...(other.others ?? [])]
  const otherAnswer = answerOf(other)
  if ((other.first || other.lastAnswer || other.finalAnswer) &&
      (other.first !== main.first || other.lastAnswer !== main.lastAnswer || other.finalAnswer !== main.finalAnswer)) kept.push(otherAnswer)
  const seen = new Set<string>()
  const others = kept.filter(o => { const k = JSON.stringify([o.first ?? '', o.lastAnswer ?? '', o.finalAnswer ?? '']); if (seen.has(k)) return false; seen.add(k); return true })
  const discussion = mergeCorrectionFollowUps(main.discussion ?? [], other.discussion ?? [])
  return {
    ...main,
    finalAnswer: main.finalAnswer ?? other.finalAnswer,
    help: unique([...(main.help ?? []), ...(other.help ?? [])]),
    ...(main.revealed || other.revealed ? { revealed: true } : {}),
    ...(others.length ? { others } : {}),
    ...(discussion.length ? { discussion } : {}),
  }
}
/** Merge copies of the same lesson. Keep the greatest progress and the help seen on either device. */
function mergeLesson(older: LessonRecord, newer: LessonRecord): LessonRecord {
  const phases = [older.phase, newer.phase].filter((p): p is LessonPhase => !!p && phaseOrder.includes(p))
  const phase = phases.sort((a, b) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b)).at(-1)
  const recalls = mergeAttempts(older.recalls, newer.recalls)
  const records = mergeAttempts(older.records, newer.records)
  const hints = older.hints || newer.hints ? mergeHints(older.hints ?? {}, newer.hints ?? {}) : undefined
  const express = mergeExpress(older.express, newer.express)
  const peeked = unique([...(older.peeked ?? []), ...(newer.peeked ?? [])]).sort((a, b) => a - b)
  const varyChecks: Record<string, VariationCheck> = { ...(older.varyChecks ?? {}) }
  for (const [k, c] of Object.entries(newer.varyChecks ?? {})) varyChecks[k] = varyChecks[k] ? mergeVariationCheck(varyChecks[k], c) : c
  const heard = older.heard && (!newer.heard || (older.heard.at ?? 0) <= (newer.heard.at ?? 0)) ? older.heard : newer.heard
  const spoken = unique([...(older.spoken ?? []), ...(newer.spoken ?? [])])
  const voiceExpression = older.voiceExpression && (!newer.voiceExpression || older.voiceExpression.date > newer.voiceExpression.date)
    ? older.voiceExpression : newer.voiceExpression
  const full = !older.slim || !newer.slim
  const merged: LessonRecord = {
    ...older, ...newer,
    steps: stepOrder.filter(s => older.steps.includes(s) || newer.steps.includes(s)),
    ...(phase ? { phase } : {}),
    ...(heard ? { heard } : {}),
    ...(spoken.length ? { spoken } : {}),
    ...(voiceExpression ? { voiceExpression } : {}),
    retry: newer.retry ?? older.retry,
    sentenceId: newer.sentenceId ?? older.sentenceId,
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
  retry?: number
  sentenceId?: string
  slim?: boolean
  corrected?: boolean; saved?: number
  phase?: LessonPhase
  heard?: HeardRecord
  spoken?: string[]
  /** An Emma session for this lesson that collected enough learner speech to count as expression. */
  voiceExpression?: { date: string; turns: number; words: number }
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

type LessonPosition = Pick<LessonRecord, 'unit' | 'day' | 'sentenceId' | 'retry'>
type DayLessons = LessonRecord & { otherLessons?: LessonRecord[] }

function isLessonRecord(value: unknown): value is LessonRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<LessonRecord>
  return Number.isInteger(record.unit) && Number.isInteger(record.day) && Array.isArray(record.steps) &&
    (record.sentenceId === undefined || typeof record.sentenceId === 'string')
}

/** Keep the primary record readable by older clients while storing the same day's other lessons alongside it. */
export function unpackDayLessons(value: unknown): LessonRecord[] {
  if (!isLessonRecord(value)) return []
  const { otherLessons, ...main } = value as DayLessons
  return [main, ...(Array.isArray(otherLessons) ? otherLessons.filter(isLessonRecord) : [])]
}

export function packDayLessons(records: readonly LessonRecord[]): DayLessons {
  const [main, ...otherLessons] = records
  return { ...main, ...(otherLessons.length ? { otherLessons } : {}) }
}

function lessonMatches(record: LessonRecord, position: LessonPosition) {
  return record.unit === position.unit && record.day === position.day &&
    (record.retry === undefined || position.retry === undefined || record.retry === position.retry) &&
    (!record.sentenceId || !position.sentenceId || record.sentenceId === position.sentenceId)
}

function lessonIndex(records: readonly LessonRecord[], position: LessonPosition) {
  const exact = records.findIndex(record => record.unit === position.unit && record.day === position.day &&
    record.sentenceId === position.sentenceId && record.retry === position.retry)
  if (exact >= 0) return exact
  const candidates = records.map((record, index) => lessonMatches(record, position) ? index : -1).filter(index => index >= 0)
  return candidates.length === 1 ? candidates[0] : -1
}

export function mergeLessonRecords(older: LessonRecord, newer: LessonRecord): LessonRecord {
  const records = unpackDayLessons(older)
  for (const record of unpackDayLessons(newer)) {
    const index = lessonIndex(records, record)
    if (index < 0) records.push(record)
    else records[index] = mergeLesson(records[index], record)
  }
  records.sort((a, b) => b.unit - a.unit || b.day - a.day || (b.retry ?? 0) - (a.retry ?? 0) ||
    (a.sentenceId ?? '').localeCompare(b.sentenceId ?? ''))
  return records.length ? packDayLessons(records) : newer
}

/** A precise link for one lesson. Older date-only links remain valid. */
export function lessonTarget(date: string, record: LessonPosition) {
  const retry = record.retry === undefined ? '' : `.r${record.retry}`
  return `${date}~${record.unit}.${record.day}.${record.sentenceId ?? 'legacy'}${retry}`
}

export function parseLessonTarget(target: string) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:~(\d+)\.(\d+)\.([a-z0-9.-]+))?$/.exec(target)
  if (!match) return null
  const [, date, unit, day, id] = match
  const calendarDate = new Date(date + 'T00:00:00Z')
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) return null
  const retry = /\.r(\d+)$/.exec(id ?? '')
  const sentenceId = retry ? id.slice(0, retry.index) : id
  const position: LessonPosition | undefined = id ? {
    unit: Number(unit), day: Number(day), ...(retry ? { retry: Number(retry[1]) } : {}),
    ...(sentenceId !== 'legacy' ? { sentenceId } : {}),
  } : undefined
  return { date, position }
}
/** One variation's check. */
export interface VariationCheck {
  firstVerdict?: 'good' | 'small' | 'again' | 'changed'; checkedText?: string; revealed?: boolean
  /** The submission shown when the learner returns to an already-recorded sentence. */
  answer?: string
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
export interface RunProgress {
  unit: number
  day: number
  pos: number
  records: (Attempt & { verified?: boolean })[]
  levels: (string | null)[]
  retry?: number
  review?: boolean
  items?: string[]
  phase?: 'write' | 'sound'
  answers?: Record<string, string>
  spoken?: string[]
  updatedAt?: number
  /** New runs store hints by activity. Older saved runs may still need their original hint history. */
  scopedHints?: boolean
  /** The short review's selected prompt belongs to this opening, even if the review queue changes later. */
  reviewId?: string
  reviewItem?: Sentence
  freshReview?: boolean
}
export const runProgressKey = (date: string, review?: boolean) =>
  review === undefined ? 'progress.' + date : 'progress.' + (review ? 'review.' : 'checkpoint.') + date
type ClosedRun = { closed: true; updatedAt: number }
type ReviewSlot = (RunProgress | ClosedRun) & { reviewAlternatives?: RunProgress[]; finishedReviewIds?: string[] }
export const isClosedRun = (value: unknown): value is ClosedRun =>
  !!value && typeof value === 'object' && 'closed' in value && value.closed === true &&
  'updatedAt' in value && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
function parseRun(value: unknown, review: boolean, unit?: number, day?: number): RunProgress | null {
    if (!value || typeof value !== 'object') return null
    const v = value as RunProgress | ClosedRun
    if (!v || isClosedRun(v) || !Number.isInteger(v.unit) || !Number.isInteger(v.day)
        || (!review && (v.unit !== unit || v.day !== day)) || !Number.isInteger(v.pos) || v.pos < 0
        || !Array.isArray(v.records) || !v.records.every(r => typeof r?.sentenceId === 'string') || !Array.isArray(v.levels)) return null
    const activity = v.review ?? (v.day !== 6 || v.items?.length === 1)
    if (activity !== review) return null
    const answers = Object.fromEntries(Object.entries(v.answers ?? {}).filter(([, value]) => typeof value === 'string'))
    const items = Array.isArray(v.items) ? v.items.filter(id => typeof id === 'string') : undefined
    const spoken = Array.isArray(v.spoken) ? v.spoken.filter(id => typeof id === 'string') : undefined
    const phase = v.phase === 'sound' || v.phase === 'write' ? v.phase : undefined
    const reviewItem = v.reviewItem
    const validItem = reviewItem && items?.length === 1 && reviewItem.id === items[0] &&
      [reviewItem.zh, reviewItem.why].every(x => typeof x === 'string') &&
      [reviewItem.grammar, reviewItem.hints, reviewItem.reference].every(list =>
        Array.isArray(list) && list.every(x => typeof x === 'string')) && Array.isArray(reviewItem.newWords)
    const records = v.records.map(record => record.attempted === undefined && answers[record.sentenceId]?.trim() === ''
      ? { ...record, attempted: false } : record)
    return { ...v, records, review: activity, answers, items, spoken, phase, reviewItem: validItem ? reviewItem : undefined,
      reviewId: typeof v.reviewId === 'string' ? v.reviewId : undefined }
}

export const reviewRunId = (run: RunProgress) => run.reviewId ?? legacyRecordId(JSON.stringify(
  run.items?.length ? run.items : run.records.map(r => r.sentenceId)))

function readReviewSlot(value: unknown) {
  if (!value || typeof value !== 'object') return { rows: [], finished: [], updatedAt: 0 };
  const { reviewAlternatives, finishedReviewIds, ...main } = value as ReviewSlot
  const rows = [main, ...(Array.isArray(reviewAlternatives) ? reviewAlternatives : [])]
    .map(row => parseRun(row, true)).filter((row): row is RunProgress => !!row)
  const finished = Array.isArray(finishedReviewIds) ? finishedReviewIds.filter(id => typeof id === 'string') : []
  const updatedAt = typeof main.updatedAt === 'number' && Number.isFinite(main.updatedAt) ? main.updatedAt : 0
  return { rows, finished, updatedAt }
}

function writeReviewSlot(rows: RunProgress[], finished: string[], updatedAt: number): ReviewSlot {
  const [main, ...reviewAlternatives] = rows
  return { ...(main ?? { closed: true as const }), updatedAt, ...(reviewAlternatives.length ? { reviewAlternatives } : {}), finishedReviewIds: finished }
}

/** Devices can both open today's review while offline. Keep each selection under its own ID and retire only the finished one. */
export function mergeReviewSlots(older: unknown, newer: unknown): ReviewSlot {
  const a = readReviewSlot(older), b = readReviewSlot(newer)
  const finished = unique([...a.finished, ...b.finished]).sort()
  const used = new Map<string, RunProgress>()
  for (const run of [...a.rows, ...b.rows]) {
    const id = reviewRunId(run)
    if (finished.includes(id)) continue
    if ((!run.reviewId && isClosedRun(older) && !a.finished.length && a.updatedAt >= (run.updatedAt ?? 0)) ||
        (!run.reviewId && isClosedRun(newer) && !b.finished.length && b.updatedAt >= (run.updatedAt ?? 0))) continue
    const previous = used.get(id)
    used.set(id, previous ? mergeRunProgress(previous, run) : run)
  }
  const rows = [...used.values()].sort((left, right) => right.records.length - left.records.length ||
    (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || reviewRunId(left).localeCompare(reviewRunId(right)))
  return writeReviewSlot(rows, finished, Math.max(a.updatedAt, b.updatedAt))
}

export function readReviewRuns(notes: Record<string, string>, date: string): RunProgress[] {
  try {
    const raw = notes[runProgressKey(date, true)] ?? notes[runProgressKey(date)]
    const { rows, finished } = readReviewSlot(JSON.parse(raw ?? 'null'))
    return rows.filter(row => !finished.includes(reviewRunId(row)))
  } catch { return [] }
}

export function readRunProgress(notes: Record<string, string>, date: string, review: boolean, unit: number, day: number, reviewId?: string): RunProgress | null {
  if (review) return readReviewRuns(notes, date).find(row => !reviewId || reviewRunId(row) === reviewId) ?? null
  try {
    const raw = notes[runProgressKey(date, false)] ?? notes[runProgressKey(date)]
    return parseRun(JSON.parse(raw ?? 'null'), false, unit, day)
  } catch { return null }
}
export function saveRunProgress(notes: Record<string, string>, date: string, review: boolean, progress: RunProgress | null, previousReviewId?: string) {
  const key = runProgressKey(date, review)
  if (review) {
    const old = readReviewRuns(notes, date)
    let receipts: ReturnType<typeof readReviewSlot> = { rows: [], finished: [], updatedAt: 0 }
    try { receipts = readReviewSlot(JSON.parse(notes[key] ?? 'null')) } catch { /* unreadable data has no usable receipts */ }
    const { finished } = receipts
    const updatedAt = Math.max(Date.now(), receipts.updatedAt + 1)
    const id = progress ? reviewRunId(progress) : previousReviewId
    const rows = old.filter(row => {
      const key = reviewRunId(row)
      return key !== id && key !== previousReviewId
    })
    if (progress && !finished.includes(reviewRunId(progress))) rows.unshift({ ...progress, updatedAt })
    if (!progress && id && !finished.includes(id)) finished.push(id)
    return { ...notes, [key]: JSON.stringify(writeReviewSlot(rows, finished, updatedAt)) }
  }
  let previous = 0
  try {
    const value = JSON.parse(notes[key] ?? 'null')
    if (typeof value?.updatedAt === 'number' && Number.isFinite(value.updatedAt)) previous = value.updatedAt
  } catch { /* replace an unreadable slot */ }
  const updatedAt = Math.max(Date.now(), previous + 1)
  const next = progress ? { ...progress, updatedAt } : { closed: true, updatedAt }
  return { ...notes, [key]: JSON.stringify(next) }
}
/** Keep the first result and its evidence together, even when another device went back to a previous prompt. */
export function mergeRunProgress(older: RunProgress, newer: RunProgress): RunProgress {
  if (older.reviewId && newer.reviewId && older.reviewId !== newer.reviewId) {
    if (!!older.records.length !== !!newer.records.length) return older.records.length ? older : newer
    return (older.updatedAt ?? 0) > (newer.updatedAt ?? 0) ? older : newer
  }
  if (older.unit !== newer.unit || older.day !== newer.day
      || (older.review !== undefined && newer.review !== undefined && older.review !== newer.review)
      || (older.retry !== undefined && newer.retry !== undefined && older.retry !== newer.retry)
      || (older.items && newer.items && older.items.join('|') !== newer.items.join('|')))
    return (older.updatedAt ?? 0) > (newer.updatedAt ?? 0) ? older : newer
  const further = older.pos > newer.pos ? older : newer
  const records = [...older.records]
  const levels = records.map((_, i) => older.levels[i] ?? null)
  const answers = { ...older.answers }
  newer.records.forEach((record, i) => {
    const index = records.findIndex(r => r.sentenceId === record.sentenceId)
    if (index < 0) {
      records.push(record)
      levels.push(newer.levels[i] ?? null)
      if (newer.answers && record.sentenceId in newer.answers) answers[record.sentenceId] = newer.answers[record.sentenceId]
    } else if (records[index].attempted === false && record.attempted !== false) {
      records[index] = record
      levels[index] = newer.levels[i] ?? null
      if (newer.answers && record.sentenceId in newer.answers) answers[record.sentenceId] = newer.answers[record.sentenceId]
      else delete answers[record.sentenceId]
    } else if (!(record.sentenceId in answers) && newer.answers && record.sentenceId in newer.answers
      && records[index].rating === record.rating && records[index].revealed === record.revealed
      && levels[index] === (newer.levels[i] ?? null)) {
      answers[record.sentenceId] = newer.answers[record.sentenceId]
    }
  })
  return { ...older, ...newer, pos: further.pos, phase: further.phase, records, levels, answers,
    reviewId: newer.reviewId ?? older.reviewId, reviewItem: newer.reviewItem ?? older.reviewItem,
    updatedAt: Math.max(older.updatedAt ?? 0, newer.updatedAt ?? 0),
    spoken: unique([...(older.spoken ?? []), ...(newer.spoken ?? [])]) }
}
export function readDayLessons(notes: Record<string, string>, day: string): LessonRecord[] {
  try {
    const v = notes[lessonKey(day)]
    return v ? unpackDayLessons(JSON.parse(v)) : []
  } catch { return [] }
}

export function readLessonRecord(notes: Record<string, string>, day: string, position?: LessonPosition): LessonRecord | null {
  const records = readDayLessons(notes, day)
  return records[position ? lessonIndex(records, position) : 0] ?? null
}

export function selectLessonRecord(notes: Record<string, string>, target: string) {
  const parsed = parseLessonTarget(target)
  if (!parsed) return null
  const rec = readLessonRecord(notes, parsed.date, parsed.position)
  return rec ? { date: parsed.date, rec } : null
}

function writeLesson(notes: Record<string, string>, date: string, records: LessonRecord[], index: number, record: LessonRecord) {
  if (index < 0) records.unshift(record)
  else records[index] = record
  return { ...notes, [lessonKey(date)]: JSON.stringify(packDayLessons(records)) }
}

export function saveLessonExpression(notes: Record<string, string>, date: string, lesson: LessonPosition,
  apply: (rec: ExpressRecord) => ExpressRecord, graded: boolean) {
  const records = readDayLessons(notes, date)
  const index = lessonIndex(records, lesson)
  const record = records[index]
  if (!record) return notes
  const express = apply(record.express ?? { corrections: 0, help: [] })
  if (express === record.express && (!graded || record.corrected)) return notes
  if (!graded) return writeLesson(notes, date, records, index, { ...record, express })
  const step = express.fixed ? 'fix' : 'express'
  const steps = stepOrder.filter(s => s === step || record.steps.includes(s))
  return writeLesson(notes, date, records, index, { ...record, express, corrected: true, steps })
}
export function updateLesson(notes: Record<string, string>, day: string, unit: number, lessonDay: number, patch: Partial<LessonRecord> = {}, step?: LessonStep) {
  const records = readDayLessons(notes, day)
  const index = lessonIndex(records, { unit, day: lessonDay, sentenceId: patch.sentenceId, retry: patch.retry })
  const base = records[index] ?? { unit, day: lessonDay, steps: [] }
  const steps = step && !base.steps.includes(step) ? [...base.steps, step] : base.steps
  const rec: LessonRecord = { ...base, ...patch, steps }
  const next = writeLesson(notes, day, records, index, rec)
  const active = notes[activeKey] ? selectLessonRecord(notes, notes[activeKey]) : null
  if (!steps.includes('done')) next[activeKey] = lessonTarget(day, rec)
  else if (active?.date === day && lessonMatches(active.rec, rec)) {
    const other = records.find(candidate => !candidate.steps.includes('done'))
    if (other) next[activeKey] = lessonTarget(day, other)
    else delete next[activeKey]
  }
  return next
}
export function markLessonStep(notes: Record<string, string>, day: string, unit: number, lessonDay: number, step: LessonStep, extra: Partial<LessonRecord> = {}) {
  return updateLesson(notes, day, unit, lessonDay, extra, step)
}
export const lessonFinished = (notes: Record<string, string>, day: string) => readDayLessons(notes, day).some(rec => rec.steps.includes('done'))
type DaySession = { day: string; energy: string; advanced?: boolean; sentenceId?: string }
/** A grammar session that moved the course on today. The unit checkpoint (day 6) is one, and it keeps no lesson record. */
export const courseMovedOn = (sessions: readonly DaySession[], day: string) =>
  sessions.some(s => s.day === day && (s.advanced ?? s.energy !== 'low') && !s.sentenceId?.startsWith('topic:'))
/** Today's main grammar lesson is done: a guided lesson that reached its end, or a checkpoint. A guided lesson whose
 *  last step (表達) is still open is not done yet, even though its sentences are saved. */
export const mainLessonDone = (state: { notes: Record<string, string>; sessions: readonly DaySession[] }, day: string) =>
  lessonFinished(state.notes, day) || (!readLessonRecord(state.notes, day) && courseMovedOn(state.sessions, day))
export function activeLesson(notes: Record<string, string>): { date: string; rec: LessonRecord } | null {
  const active = selectLessonRecord(notes, notes[activeKey] ?? '')
  return active && !active.rec.steps.includes('done') ? active : null
}
/** The core (recall, listen, pattern) is saved and the curriculum has moved on; only 表達／訂正 can be left. */
export const coreSaved = (rec: LessonRecord) => rec.steps.includes('pattern')
/** Should opening a lesson continue an unfinished one? A lesson whose core is saved continues the same day,
 *  or later when asked for explicitly; one whose core isn't saved continues while the curriculum still points at it. */
export function resumeTarget(notes: Record<string, string>, cursor: LessonPosition, today: string, explicit = false, at?: string) {
  if (at) {
    const target = selectLessonRecord(notes, at)
    return target && !target.rec.steps.includes('done') ? target : null
  }
  const a = activeLesson(notes)
  const resumable = (entry: { date: string; rec: LessonRecord }) => coreSaved(entry.rec)
    ? entry.date === today || explicit : lessonMatches(entry.rec, cursor)
  return (a && resumable(a) ? a : unfinishedLessons(notes).find(resumable)) ?? null
}
export function resumePhase(rec: LessonRecord): LessonPhase | null {
  if (coreSaved(rec)) return 'express'
  if (rec.phase && rec.phase !== 'done' && rec.phase !== 'express') return rec.phase
  return rec.steps.includes('listen') ? 'write' : rec.steps.includes('recall') ? 'listen' : null
}
/** Every earlier lesson whose core is saved but whose 表達 is still open, newest first.
 *  The single "lesson.active" pointer moves on when a new lesson starts, so these would otherwise be lost. */
export function unfinishedLessons(notes: Record<string, string>): { date: string; rec: LessonRecord }[] {
  const out: { date: string; rec: LessonRecord }[] = []
  for (const k of Object.keys(notes)) {
    const m = /^lesson\.(\d{4}-\d{2}-\d{2})$/.exec(k)
    if (!m) continue
    for (const rec of readDayLessons(notes, m[1])) if (!rec.steps.includes('done')) out.push({ date: m[1], rec })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export const pendingLessons = (notes: Record<string, string>) => unfinishedLessons(notes).filter(({ rec }) => coreSaved(rec))
/** Continuing on a later day moves the lesson to today, unless today already has a lesson of its own. */
export function moveLesson(notes: Record<string, string>, from: string, to: string) {
  if (from === to || readLessonRecord(notes, to)) return { notes, date: from }
  const active = activeLesson(notes)
  const records = readDayLessons(notes, from)
  const index = active?.date === from ? lessonIndex(records, active.rec) : 0
  const rec = records[index]
  if (!rec) return { notes, date: from }
  const next = { ...notes, [lessonKey(to)]: JSON.stringify(rec), [activeKey]: lessonTarget(to, rec) }
  const remaining = records.filter((_, i) => i !== index)
  if (remaining.length) next[lessonKey(from)] = JSON.stringify(packDayLessons(remaining))
  else delete next[lessonKey(from)]
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
