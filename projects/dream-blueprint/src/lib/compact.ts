import { addDays, daysBetween, reviewBonus, type ReviewEvent } from './progress'

/**
 * Keeps the saved progress small. The whole progress lives in one browser storage slot that holds about 5 MB, and
 * left alone it would grow by about 4 MB a year (mostly one line per card reviewed). Old details leave this device:
 *  - review lines older than a couple of months are folded into totals (the history page's recall numbers and the
 *    weekly race bonus stay exactly the same); the cards themselves keep their memory state, so scheduling is unchanged;
 *  - notes that only matter on their own day (today's words, today's plan ticks, today's hint use…) go after a few weeks;
 *  - finished lessons older than a few months keep what he wrote but drop the long correction texts.
 * Nothing else is touched: sessions, cards, evidence, weak points, memory and every record that has its own date stay.
 * Progress that is already big gets shorter windows, to make more space when old details can be removed.
 *
 * With Google Drive connected nothing is thrown away: the old details are first saved into the Drive archive folder
 * (cloud script v4, `archiveOld`), and only the items that arrived there are removed here (`applyBatch`).
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
  /** Each folded day's totals, also readable by older builds. */
  days?: Record<string, DayCount>
  /** What was folded before days were kept apart: one block for every day before its `before`. */
  base?: { before: string; total: number; delayed: number; recalled: number }
  /** Newer archives keep the identity of each folded review. Card IDs are dictionary-encoded across days. */
  rows?: ReviewRows
  /** Day totals from older archives, whose individual review identities cannot be recovered. */
  legacyDays?: Record<string, DayCount>
}
export type DayCount = [lines: number, delayed: number, recalled: number]
interface ReviewRows {
  cards: string[]
  /** Day → pairs of card index and gap with the two review flags in its low bits. */
  days: Record<string, number[]>
}
const empty: ReviewArchive = { before: '', total: 0, delayed: 0, recalled: 0, bonus: {} }
const isCount = (v: unknown): v is DayCount => Array.isArray(v) && v.length === 3 && v.every(n => Number.isInteger(n) && n >= 0)
const isDate = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day)
const readDays = (value: unknown): Record<string, DayCount> | undefined =>
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([day, count]) => isDate(day) && isCount(count))) : undefined

export function readArchive(notes: Record<string, string>): ReviewArchive {
  try {
    const a = JSON.parse(notes[archiveKey] || 'null') as Partial<ReviewArchive> | null
    if (!a || typeof a !== 'object') return empty
    const days = readDays(a.days)
    const legacyDays = readDays(a.legacyDays)
    const rows = a.rows && Array.isArray(a.rows.cards) && a.rows.days && typeof a.rows.days === 'object' ? a.rows : undefined
    const b = a.base && typeof a.base === 'object' ? a.base : undefined
    return {
      before: typeof a.before === 'string' ? a.before : '',
      total: Number(a.total) || 0, delayed: Number(a.delayed) || 0, recalled: Number(a.recalled) || 0,
      bonus: a.bonus && typeof a.bonus === 'object' ? a.bonus : {},
      ...(days ? { days } : {}),
      ...(b ? { base: { before: typeof b.before === 'string' ? b.before : '', total: Number(b.total) || 0, delayed: Number(b.delayed) || 0, recalled: Number(b.recalled) || 0 } } : {}),
      ...(rows ? { rows } : {}),
      ...(legacyDays ? { legacyDays } : {}),
    }
  } catch { return empty }
}
const countLines = (events: readonly ReviewEvent[]): DayCount => {
  const delayed = events.filter(e => e.gap >= 4 && !e.shownAnswer)
  return [events.length, delayed.length, delayed.filter(e => e.remembered).length]
}
/** Archives from before review identities were retained can only supply totals. */
function dayParts(a: ReviewArchive): { base?: ReviewArchive['base']; days: Record<string, DayCount> } {
  if (a.days) return { base: a.base, days: a.rows ? a.legacyDays ?? {} : a.days }
  return { base: a.total || a.delayed || a.recalled ? { before: a.before, total: a.total, delayed: a.delayed, recalled: a.recalled } : undefined, days: {} }
}
export const reviewEventKey = (event: ReviewEvent) =>
  JSON.stringify([event.day, event.id, event.gap, event.remembered, event.shownAnswer])

function* archivedEvents(day: string, rows?: ReviewRows): Generator<ReviewEvent> {
  if (!rows) return
  const row = rows.days[day]
  if (!Array.isArray(row)) return
  for (let i = 0; i + 1 < row.length; i += 2) {
    const id = rows.cards[row[i]]
    const code = row[i + 1]
    if (typeof id !== 'string' || !Number.isSafeInteger(code) || code < 0) continue
    yield { id, day, gap: Math.floor(code / 4), remembered: !!(code & 1), shownAnswer: !!(code & 2) }
  }
}

const fullerDay = (a: DayCount | undefined, b: DayCount): DayCount => !a ? b
  : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]

/** Folded reviews from the two archives and reviews still kept on either device, with duplicate reviews counted once. */
export function mergeArchives(x: ReviewArchive, y: ReviewArchive, events: readonly ReviewEvent[]): ReviewArchive {
  const px = dayParts(x), py = dayParts(y)
  const base = !px.base ? py.base : !py.base ? px.base
    : py.base.before > px.base.before || (py.base.before === px.base.before && py.base.total > px.base.total) ? py.base : px.base
  const before = x.before > y.before ? x.before : y.before
  const cut = base?.before ?? ''
  const legacyDays: Record<string, DayCount> = {}
  for (const [day, count] of [...Object.entries(px.days), ...Object.entries(py.days)]) {
    if (day >= cut) legacyDays[day] = fullerDay(legacyDays[day], count)
  }
  const days = { ...legacyDays }
  const bonus: Record<string, number> = { ...x.bonus }
  for (const [d, v] of Object.entries(y.bonus)) bonus[d] = Math.max(bonus[d] ?? 0, Number(v) || 0)
  const liveByDay = new Map<string, ReviewEvent[]>()
  for (const event of events) {
    if (event.day < cut || event.day >= before) continue
    const day = liveByDay.get(event.day)
    if (day) day.push(event)
    else liveByDay.set(event.day, [event])
  }
  const foldedDays = new Set([...Object.keys(x.rows?.days ?? {}), ...Object.keys(y.rows?.days ?? {}), ...liveByDay.keys()])
  const cards: string[] = []
  const cardIndex = new Map<string, number>()
  const rows: ReviewRows = { cards, days: {} }
  for (const day of [...foldedDays].sort()) {
    if (!isDate(day) || day < cut || day >= before) continue
    const byId = new Map<string, ReviewEvent>()
    for (const source of [archivedEvents(day, x.rows), archivedEvents(day, y.rows), liveByDay.get(day) ?? []]) {
      for (const event of source) byId.set(reviewEventKey(event), event)
    }
    if (!byId.size) continue
    const lines = [...byId.keys()].sort().map(key => byId.get(key)!)
    days[day] = fullerDay(days[day], countLines(lines))
    const points = reviewBonus(lines, day)
    if (points > (bonus[day] ?? 0)) bonus[day] = points
    const row: number[] = []
    for (const event of lines) {
      let index = cardIndex.get(event.id)
      if (index === undefined) {
        index = cards.length
        cardIndex.set(event.id, index)
        cards.push(event.id)
      }
      row.push(index, event.gap * 4 + Number(event.remembered) + 2 * Number(event.shownAnswer))
    }
    rows.days[day] = row
  }
  const totals: DayCount = [base?.total ?? 0, base?.delayed ?? 0, base?.recalled ?? 0]
  for (const count of Object.values(days)) {
    totals[0] += count[0]
    totals[1] += count[1]
    totals[2] += count[2]
  }
  return { before, total: totals[0], delayed: totals[1], recalled: totals[2], bonus, days, rows,
    ...(Object.keys(legacyDays).length ? { legacyDays } : {}), ...(base ? { base } : {}) }
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
  `^progress\\.(?:(?:review|checkpoint)\\.)?${DATE}$`,
].map(p => new RegExp(p))
const lessonRecord = new RegExp(`^lesson\\.${DATE}$`)

/** How long details are kept, in days. Big progress gets the short windows. */
const shortWindowSize = 3_000_000
export function windows(size: number) {
  return size > shortWindowSize ? { events: 30, dayNotes: 21, lessons: 45 } : { events: 60, dayNotes: 45, lessons: 120 }
}

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
    // His own sentences stay (another device's too); Claude's full feedback is what leaves.
    const others = Array.isArray(e?.others) ? (e.others as { first?: unknown; lastAnswer?: unknown }[]).map(o => ({ first: o?.first, lastAnswer: o?.lastAnswer })) : undefined
    const express = e ? { first: e.first, lastAnswer: e.lastAnswer, corrections: e.corrections ?? 0, help: e.help ?? [], fixed: e.fixed, revealed: e.revealed, ...(others ? { others } : {}) } : undefined
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
    for (const e of batch.events) { const k = reviewEventKey(e); left.set(k, (left.get(k) ?? 0) + 1) }
    const old: ReviewEvent[] = []
    reviewEvents = reviewEvents.filter(e => {
      const k = reviewEventKey(e), n = left.get(k)
      if (!n) return true
      left.set(k, n - 1); old.push(e); return false
    })
    if (old.length) {
      const a = readArchive(notes)
      const archive = mergeArchives(a, { ...empty, before: batch.upTo.events }, old)
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
export function compactState<S extends Compactable>(state: S, today: string, size?: number, keepUnarchived = false): S {
  if (keepUnarchived) return state
  return applyBatch(state, oldDetails(state, today, size))
}

/** Sends the old details to the Drive archive about once a week (sooner when the progress is big). Returns what
 *  arrived there, for `applyBatch`; null when nothing was due or the cloud did not confirm it kept them. */
export async function archiveOld(state: Compactable, today: string, send: (file: string) => Promise<boolean>,
  size = JSON.stringify(state).length, storageFull = false): Promise<Batch | null> {
  const last = state.notes[lastArchiveKey]
  if (!storageFull && last && last <= today && daysBetween(last, today) < 7 && size <= shortWindowSize) return null
  const batch = oldDetails(state, today, storageFull ? Math.max(size, shortWindowSize + 1) : size)
  if (!batchSize(batch)) return null
  const file = JSON.stringify({ app: '夢想藍圖', kind: '舊紀錄', note: '從手機整理掉之前先存在這裡的舊紀錄（複習紀錄、每天的小紀錄、舊課的批改全文）。', savedOn: today, ...batch })
  return (await send(file)) ? batch : null
}
