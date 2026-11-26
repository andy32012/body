import { addDays, daysBetween, reviewBonus, type ReviewEvent } from './progress'

/**
 * Keeps the saved progress small. The whole progress lives in one browser storage slot that holds about 5 MB, and
 * left alone it would grow by about 4 MB a year (mostly one line per card reviewed). Old details leave this device:
 *  - review lines older than a couple of months are folded into totals (the history page's recall numbers and the
 *    weekly race bonus stay exactly the same); the cards themselves keep their memory state, so scheduling is unchanged;
 *  - notes that only matter on their own day (today's words, today's plan ticks, today's hint use…) go after a few weeks;
 *  - finished lessons older than a few months keep what he wrote but drop the long correction texts.
 * Nothing else is touched: sessions, cards, evidence, weak points, memory and every record that has its own date stay.
 * Progress that is already big gets shorter windows, so the slot never fills up.
 *
 * With Google Drive connected nothing is thrown away: the old details are first saved into the Drive archive folder
 * (cloud script v4, `archiveOld`), and only the items that arrived there are removed here (`applyBatch`). Until then
 * they stay on the device — unless the progress passes 3.5 MB, when it is tidied anyway so saving keeps working.
 */
export const archiveKey = 'review.archive'
/** The day old records were last sent to the Drive archive. */
export const lastArchiveKey = 'archive.last'
export interface ReviewArchive {
  /** Review lines from before this day have been folded in. */
  before: string
  total: number
  /** Reviews after a gap of four days or more without seeing the answer, and how many of them were recalled. */
  delayed: number
  recalled: number
  /** The weekly race's review bonus of each folded day that had one. */
  bonus: Record<string, number>
}
const empty: ReviewArchive = { before: '', total: 0, delayed: 0, recalled: 0, bonus: {} }

export function readArchive(notes: Record<string, string>): ReviewArchive {
  try {
    const a = JSON.parse(notes[archiveKey] || 'null') as Partial<ReviewArchive> | null
    if (!a || typeof a !== 'object') return empty
    return {
      before: typeof a.before === 'string' ? a.before : '',
      total: Number(a.total) || 0, delayed: Number(a.delayed) || 0, recalled: Number(a.recalled) || 0,
      bonus: a.bonus && typeof a.bonus === 'object' ? a.bonus : {},
    }
  } catch { return empty }
}

/** The race bonus of a day, from the review lines or, once they are folded, from the archive. */
export function bonusOn(s: { reviewEvents: readonly ReviewEvent[]; notes: Record<string, string> }, day: string) {
  const archived = readArchive(s.notes).bonus[day]
  return archived !== undefined ? archived : reviewBonus(s.reviewEvents, day)
}

/** All-time delayed-recall totals (history page): archived ones plus the lines still kept. */
export function delayedRecall(s: { reviewEvents: readonly ReviewEvent[]; notes: Record<string, string> }) {
  const a = readArchive(s.notes)
  const delayed = s.reviewEvents.filter(e => e.gap >= 4 && !e.shownAnswer)
  return { delayed: a.delayed + delayed.length, recalled: a.recalled + delayed.filter(e => e.remembered).length }
}

const DATE = '(\\d{4}-\\d{2}-\\d{2})'
/** Notes read only on their own day (checked against every reader when this list was made). */
const dayOnly = [
  `^daily-word\\.(?:done|seen|more|sorted)\\.${DATE}$`,
  `^topic\\.skip\\.${DATE}$`,
  `^nurse\\.words\\.${DATE}$`,
  `^word-part\\.(?:day|more)\\.${DATE}$`,
  `^hints\\.${DATE}$`,
  `^review\\.sentences\\.${DATE}$`,
  `^plan\\.${DATE}\\..+$`,
  `^vocab-screen\\.${DATE}$`,
  `^progress\\.${DATE}$`,
].map(p => new RegExp(p))
const lessonRecord = new RegExp(`^lesson\\.${DATE}$`)

/** How long details are kept, in days. Big progress gets the short windows. */
export function windows(size: number) {
  return size > 3_000_000 ? { events: 30, dayNotes: 21, lessons: 45 } : { events: 60, dayNotes: 45, lessons: 120 }
}
/** Above this size old details are tidied even when they could not reach the Drive archive yet. */
export const EMERGENCY = 3_500_000

type Compactable = { reviewEvents: ReviewEvent[]; notes: Record<string, string> }
/** The old details that would leave this device: what goes into the Drive archive, and what `applyBatch` removes. */
export interface Batch {
  /** Each kind is older than this day. */
  upTo: { events: string; dayNotes: string; lessons: string }
  events: ReviewEvent[]
  /** Day-only notes, key → value. */
  notes: Record<string, string>
  /** Finished old lessons, key → the whole record before its long texts are dropped. */
  lessons: Record<string, string>
}

/** A finished lesson without the long correction texts and per-sentence details, or null if it stays as it is. */
function slim(value: string): string | null {
  try {
    const rec = JSON.parse(value) as { steps?: string[]; express?: Record<string, unknown>; slim?: boolean } & Record<string, unknown>
    if (!Array.isArray(rec.steps) || !rec.steps.includes('done') || rec.slim) return null
    const { recalls: _r, records: _s, hints: _h, ...rest } = rec
    const e = rec.express
    const express = e ? { first: e.first, lastAnswer: e.lastAnswer, corrections: e.corrections ?? 0, help: e.help ?? [], fixed: e.fixed, revealed: e.revealed } : undefined
    return JSON.stringify({ ...rest, ...(express ? { express } : {}), slim: true })
  } catch { return null /* an unreadable record is left as it is */ }
}

export function oldDetails(state: Compactable, today: string, size = JSON.stringify(state).length): Batch {
  const w = windows(size)
  const upTo = { events: addDays(today, -w.events), dayNotes: addDays(today, -w.dayNotes), lessons: addDays(today, -w.lessons) }
  const notes: Record<string, string> = {}
  const lessons: Record<string, string> = {}
  const active = state.notes['lesson.active']
  for (const [k, v] of Object.entries(state.notes)) {
    const day = dayOnly.map(rx => rx.exec(k)?.[1]).find(Boolean)
    if (day) { if (day < upTo.dayNotes) notes[k] = v; continue }
    const m = lessonRecord.exec(k)
    if (m && m[1] < upTo.lessons && m[1] !== active && slim(v) !== null) lessons[k] = v
  }
  return { upTo, events: state.reviewEvents.filter(e => e.day < upTo.events), notes, lessons }
}
export const batchSize = (b: Batch) => b.events.length + Object.keys(b.notes).length + Object.keys(b.lessons).length

/** Removes exactly the batch's items, as long as they are still the same (review lines are folded into the totals).
 *  `archivedOn` records the day they reached the Drive archive. */
export function applyBatch<S extends Compactable>(state: S, batch: Batch, archivedOn?: string): S {
  let reviewEvents = state.reviewEvents
  let notes = state.notes
  if (batch.events.length) {
    const left = new Map<string, number>()
    for (const e of batch.events) { const k = JSON.stringify(e); left.set(k, (left.get(k) ?? 0) + 1) }
    const old: ReviewEvent[] = []
    reviewEvents = reviewEvents.filter(e => {
      const k = JSON.stringify(e), n = left.get(k)
      if (!n) return true
      left.set(k, n - 1); old.push(e); return false
    })
    if (old.length) {
      const a = readArchive(notes)
      const bonus = { ...a.bonus }
      for (const day of new Set(old.map(e => e.day))) { const b = reviewBonus(old, day); if (b > 0) bonus[day] = b }
      const delayed = old.filter(e => e.gap >= 4 && !e.shownAnswer)
      const archive: ReviewArchive = {
        before: batch.upTo.events > a.before ? batch.upTo.events : a.before,
        total: a.total + old.length,
        delayed: a.delayed + delayed.length,
        recalled: a.recalled + delayed.filter(e => e.remembered).length,
        bonus,
      }
      notes = { ...notes, [archiveKey]: JSON.stringify(archive) }
    } else reviewEvents = state.reviewEvents
  }
  let changed: Record<string, string> | null = null
  const edit = () => (changed ??= { ...notes })
  for (const [k, v] of Object.entries(batch.notes)) if (notes[k] === v) delete edit()[k]
  for (const [k, v] of Object.entries(batch.lessons)) {
    const s = notes[k] === v ? slim(v) : null
    if (s !== null) edit()[k] = s
  }
  if (changed) notes = changed
  if (archivedOn && notes[lastArchiveKey] !== archivedOn) notes = { ...notes, [lastArchiveKey]: archivedOn }
  return notes === state.notes && reviewEvents === state.reviewEvents ? state : { ...state, notes, reviewEvents }
}

/** Run when progress is loaded. `keepUnarchived` (Drive connected): leave old details for the Drive archive. */
export function compactState<S extends Compactable>(state: S, today: string, size = JSON.stringify(state).length, keepUnarchived = false): S {
  if (keepUnarchived && size <= EMERGENCY) return state
  return applyBatch(state, oldDetails(state, today, size))
}

/** Sends the old details to the Drive archive about once a week (sooner when the progress is big). Returns what
 *  arrived there, for `applyBatch`; null when nothing was due or the cloud did not confirm it kept them. */
export async function archiveOld(state: Compactable, today: string, send: (file: string) => Promise<boolean>, size = JSON.stringify(state).length): Promise<Batch | null> {
  const last = state.notes[lastArchiveKey]
  if (last && last <= today && daysBetween(last, today) < 7 && size <= 3_000_000) return null
  const batch = oldDetails(state, today, size)
  if (!batchSize(batch)) return null
  const file = JSON.stringify({ app: '夢想藍圖', kind: '舊紀錄', note: '從手機整理掉之前先存在這裡的舊紀錄（複習紀錄、每天的小紀錄、舊課的批改全文）。', savedOn: today, ...batch })
  return (await send(file)) ? batch : null
}
