import { addDays, reviewBonus, type ReviewEvent } from './progress'

/**
 * Keeps the saved progress small. The whole progress lives in one browser storage slot that holds about 5 MB, and
 * left alone it would grow by about 4 MB a year (mostly one line per card reviewed). So, when progress is loaded:
 *  - review lines older than a couple of months are folded into totals (the history page's recall numbers and the
 *    weekly race bonus stay exactly the same); the cards themselves keep their memory state, so scheduling is unchanged;
 *  - notes that only matter on their own day (today's words, today's plan ticks, today's hint use…) are removed after
 *    a few weeks;
 *  - finished lessons older than a few months keep what he wrote but drop the long correction texts.
 * Nothing else is touched: sessions, cards, evidence, weak points, memory and every record that has its own date stay.
 * Progress that is already big gets shorter windows, so the slot never fills up.
 */
export const archiveKey = 'review.archive'
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
].map(p => new RegExp(p))
const lessonRecord = new RegExp(`^lesson\\.${DATE}$`)

/** How long details are kept, in days. Big progress gets the short windows. */
export function windows(size: number) {
  return size > 3_000_000 ? { events: 30, dayNotes: 21, lessons: 45 } : { events: 60, dayNotes: 45, lessons: 120 }
}

export function compactState<S extends { reviewEvents: ReviewEvent[]; notes: Record<string, string> }>(state: S, today: string, size = JSON.stringify(state).length): S {
  const w = windows(size)
  let notes = state.notes
  let reviewEvents = state.reviewEvents

  // 1. Old review lines → totals.
  const cut = addDays(today, -w.events)
  const old = reviewEvents.filter(e => e.day < cut)
  if (old.length) {
    const a = readArchive(notes)
    const bonus = { ...a.bonus }
    for (const day of new Set(old.map(e => e.day))) { const b = reviewBonus(old, day); if (b > 0) bonus[day] = b }
    const delayed = old.filter(e => e.gap >= 4 && !e.shownAnswer)
    const archive: ReviewArchive = {
      before: cut > a.before ? cut : a.before,
      total: a.total + old.length,
      delayed: a.delayed + delayed.length,
      recalled: a.recalled + delayed.filter(e => e.remembered).length,
      bonus,
    }
    reviewEvents = reviewEvents.filter(e => e.day >= cut)
    notes = { ...notes, [archiveKey]: JSON.stringify(archive) }
  }

  // 2. Day-only notes → removed after a few weeks.
  const noteCut = addDays(today, -w.dayNotes)
  const lessonCut = addDays(today, -w.lessons)
  const active = notes['lesson.active']
  let changed: Record<string, string> | null = null
  const edit = () => (changed ??= { ...notes })
  for (const k of Object.keys(notes)) {
    const day = dayOnly.map(rx => rx.exec(k)?.[1]).find(Boolean)
    if (day) { if (day < noteCut) delete edit()[k]; continue }
    // 3. Finished, old lessons keep what he wrote, without the long correction texts and per-sentence details.
    const m = lessonRecord.exec(k)
    if (!m || m[1] >= lessonCut || m[1] === active) continue
    try {
      const rec = JSON.parse(notes[k]) as { steps?: string[]; express?: Record<string, unknown>; slim?: boolean } & Record<string, unknown>
      if (!Array.isArray(rec.steps) || !rec.steps.includes('done') || rec.slim) continue
      const { recalls: _r, records: _s, hints: _h, ...rest } = rec
      const e = rec.express
      const express = e ? { first: e.first, lastAnswer: e.lastAnswer, corrections: e.corrections ?? 0, help: e.help ?? [], fixed: e.fixed, revealed: e.revealed } : undefined
      edit()[k] = JSON.stringify({ ...rest, ...(express ? { express } : {}), slim: true })
    } catch { /* an unreadable record is left as it is */ }
  }
  if (changed) notes = changed

  return notes === state.notes && reviewEvents === state.reviewEvents ? state : { ...state, notes, reviewEvents }
}
