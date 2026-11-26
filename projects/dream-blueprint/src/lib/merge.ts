import type { AppState } from './store'
import { memoryDeletedKey, memoryNoteKey, mergeMemory, readDeleted, readMemory, writeMemory } from './memory'
import { readRemoved, weakKey, weakRemovedKey } from './weakPoints'
import { archiveKey, mergeArchives, readArchive } from './compact'
import { mergeHints, mergeLessonRecords, type HintUse, type LessonRecord } from './lesson'
import { mergeMoved, movedKey, readMoved, settleWords } from './wordStates'
import { betterRead, type ReadAttempt } from './reading'
import { betterListen, type ListenAttempt } from './bridge'

/**
 * 「兩份合併」: when two devices both changed the progress since they last synced, keep everything from both instead of
 * choosing one. Lessons, sessions, review cards and lines, words, weak points and notes from either side all stay; the
 * course position is the one further along; settings follow the copy changed last.
 */
type Notes = Record<string, string>
const unionBy = <T>(a: readonly T[], b: readonly T[], key: (x: T) => string) => {
  const seen = new Set<string>(), out: T[] = []
  for (const x of [...a, ...b]) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x) } }
  return out
}
const parse = (v: string): unknown => { try { return JSON.parse(v) } catch { return undefined } }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0
const earliest = (...days: unknown[]) => days.filter((d): d is string => typeof d === 'string' && !!d).sort()[0]
/** read.*, write.*, nurse.listen.*, bridge.listen.*, story.<passage>, topic.<id>: see mergeNote. Null for anything else. */
function mergePractice(key: string, a: unknown, b: unknown): string | null {
  if (!isObj(a) || !isObj(b)) return null
  if (/^read\./.test(key) && typeof a.correct === 'number' && typeof b.correct === 'number') {
    const bestOf = (r: Record<string, unknown>) => (isObj(r.best) ? r.best : { day: r.day, correct: r.correct, total: r.total, ...(r.zh ? { zh: true } : {}) }) as unknown as ReadAttempt
    const ba = bestOf(a), bb = bestOf(b)
    const legacyBest = b.legacyBest ?? a.legacyBest
    return JSON.stringify({ ...b, best: betterRead(ba, bb) ? ba : bb, tries: Math.max(num(a.tries), num(b.tries)), ...(legacyBest ? { legacyBest } : {}) })
  }
  if (/^write\./.test(key) && (typeof a.day === 'string' || typeof b.day === 'string')) {
    const bests = [a.best, b.best].filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 9)
    const self = Math.max(num(a.self), num(b.self))
    return JSON.stringify({ ...a, ...b, ...(bests.length ? { best: Math.max(...bests) } : {}), tries: Math.max(num(a.tries), num(b.tries)), ...(self ? { self } : {}) })
  }
  if (/^(nurse|bridge)\.listen\./.test(key) && typeof a.correct === 'number' && typeof b.correct === 'number') {
    const bestOf = (r: Record<string, unknown>) => (isObj(r.best) ? r.best : { day: r.day, correct: r.correct, total: r.total, heard: !!r.heard }) as unknown as ListenAttempt
    const ba = bestOf(a), bb = bestOf(b)
    return JSON.stringify({ ...b, best: betterListen(ba, bb) ? ba : bb, plays: Math.max(num(a.plays), num(b.plays)) })
  }
  if (/^story\./.test(key)) {
    const out: Record<string, unknown> = { ...a, ...b }
    for (const f of ['r', 'l', 'd']) { const day = earliest(a[f], b[f]); if (day) out[f] = day }
    // Dictation finished on either device: where it stopped halfway no longer matters.
    if (out.d) { delete out.dn; delete out.dqp }
    return JSON.stringify(out)
  }
  if (/^topic\./.test(key) && isObj(a.done) && isObj(b.done)) {
    const done: Record<string, string> = {}
    for (const p of new Set([...Object.keys(a.done), ...Object.keys(b.done)])) { const day = earliest(a.done[p], b.done[p]); if (day) done[p] = day }
    const open = isObj(a.open) || isObj(b.open) ? { ...(isObj(a.open) ? a.open : {}), ...(isObj(b.open) ? b.open : {}) } : undefined
    // Where to continue: the newer copy's place, unless that part is already finished on either device.
    const cur = [b.cur, a.cur].find(c => isObj(c) && typeof c.part === 'string' && !done[c.part])
    const out: Record<string, unknown> = { ...a, ...b, done, ...(open ? { open } : {}) }
    if (cur) out.cur = cur; else delete out.cur
    return JSON.stringify(out)
  }
  return null
}

/** One note both sides wrote differently. `newer` is the value from the copy changed last. */
export function mergeNote(key: string, older: string, newer: string): string {
  if (older === newer) return newer
  // A day's count (today's sentence review and the like): the larger one has everything done on either device. Other
  // numbers are settings (how many new words a day): the one changed last.
  if (/\d{4}-\d{2}-\d{2}/.test(key) && /^\d+$/.test(older) && /^\d+$/.test(newer)) return String(Math.max(Number(older), Number(newer)))
  const a = parse(older), b = parse(newer)
  // A practice record both devices wrote: the latest attempt from the copy changed last, but the best attempt that
  // counts, the most tries and every finished mode or part from either side, so a pass or a best score never goes back.
  const practice = mergePractice(key, a, b)
  if (practice) return practice
  // The days each skill was practised: every day from both devices.
  if (key === 'skills.log' && isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = Array.isArray(v) && Array.isArray(a[k]) ? [...new Set([...(a[k] as unknown[]), ...v])].sort().slice(-60) : v
    return JSON.stringify(out)
  }
  // One word's four skills (the day each was shown): a skill shown on either device stays, with the later day.
  if (key.startsWith('skill.') && isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = typeof v === 'string' && typeof a[k] === 'string' && (a[k] as string) > v ? a[k] : v
    return JSON.stringify(out)
  }
  // The folded old review lines: the archive folded further along (the lines before it are dropped from the merge).
  if (key === 'review.archive' && isObj(a) && isObj(b)) return String(a.before ?? '') > String(b.before ?? '') ? older : newer
  // A day's lesson on two devices: steps, answers and the open task's sentences from both, not just the copy changed last.
  if (/^lesson\.\d{4}-\d{2}-\d{2}$/.test(key) && isObj(a) && isObj(b) && Array.isArray(a.steps) && Array.isArray(b.steps))
    return JSON.stringify(mergeLessonRecords(a as unknown as LessonRecord, b as unknown as LessonRecord))
  // Help used that day outside the lesson (hints and answers shown): the most from either device.
  if (/^hints\.\d{4}-\d{2}-\d{2}$/.test(key) && isObj(a) && isObj(b))
    return JSON.stringify(mergeHints(a as Record<string, HintUse>, b as Record<string, HintUse>))
  // When words last moved between 認得 and 還不熟: the later move of each word.
  if (key === movedKey) return JSON.stringify(mergeMoved(readMoved({ [key]: older }), readMoved({ [key]: newer })))
  // A checkpoint left halfway on both: the one that got further (the same checkpoint), else the copy changed last.
  if (/^progress\.\d{4}-\d{2}-\d{2}$/.test(key) && isObj(a) && isObj(b) && a.unit === b.unit && a.day === b.day && typeof a.pos === 'number' && typeof b.pos === 'number')
    return a.pos > b.pos ? older : newer
  // Weak points: one entry per label; keep the one seen more often, with both sides' examples.
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every(x => isObj(x) && typeof x.k === 'string' && typeof x.n === 'number')) {
    const items = new Map<string, Record<string, unknown>>()
    for (const x of [...a, ...b] as Record<string, unknown>[]) {
      const had = items.get(x.k as string)
      if (!had) { items.set(x.k as string, x); continue }
      const big = (x.n as number) >= (had.n as number) ? x : had, small = big === x ? had : x
      const ex = Array.isArray(big.ex) && Array.isArray(small.ex) ? unionBy(big.ex, small.ex, e => JSON.stringify(e)).slice(0, 8) : big.ex
      const first = [had.first, x.first].filter((d): d is string => typeof d === 'string').sort()[0]
      const last = [had.last, x.last].filter((d): d is string => typeof d === 'string').sort().at(-1)
      items.set(x.k as string, { ...big, ...(ex ? { ex } : {}), ...(first ? { first } : {}), ...(last ? { last } : {}) })
    }
    return JSON.stringify([...items.values()])
  }
  // Any other list (evidence, dated records): everything from both, once.
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(unionBy(a, b, x => JSON.stringify(x)))
  // Grammar drill marks: each drill answered on either device is kept.
  if (isObj(a) && isObj(b) && isObj(a.marks) && isObj(b.marks)) return JSON.stringify({ ...a, ...b, marks: { ...a.marks, ...b.marks } })
  return newer
}

/** Both copies merged. `mineNewer`: this device's copy was changed after the cloud copy was saved. */
export function mergeStates(mine: AppState, theirs: AppState, mineNewer: boolean): AppState {
  const [older, newer] = mineNewer ? [theirs, mine] : [mine, theirs]
  // The same session id on both (the practice library keeps one session a day): every answer and word from both.
  const sessions = new Map<string, AppState['sessions'][number]>()
  for (const s of [...older.sessions, ...newer.sessions]) {
    const had = sessions.get(s.id)
    if (!had) { sessions.set(s.id, s); continue }
    const translations = unionBy(had.translations ?? [], s.translations ?? [], t => JSON.stringify(t))
    const spokenIds = unionBy(had.spokenIds ?? [], s.spokenIds ?? [], x => x)
    sessions.set(s.id, { ...had, ...s, words: unionBy(had.words, s.words, x => x),
      ...(translations.length ? { translations } : {}), ...(spokenIds.length ? { spokenIds } : {}), advanced: !!(had.advanced || s.advanced) })
  }
  const cards = new Map<string, AppState['cards'][number]>()
  for (const c of [...older.cards, ...newer.cards]) {
    const had = cards.get(c.id)
    if (!had || c.lastDay > had.lastDay || (c.lastDay === had.lastDay && c.due >= had.due)) cards.set(c.id, c)
  }
  const pos = (s: AppState) => s.curriculum.unit * 10 + s.curriculum.day
  const ahead = pos(mine) === pos(theirs) ? newer : pos(mine) > pos(theirs) ? mine : theirs
  const notes: Notes = { ...older.notes }
  for (const [k, v] of Object.entries(newer.notes)) notes[k] = k in older.notes ? mergeNote(k, older.notes[k], v) : v
  // Memory has its own rule: notes from both sides, minus anything deleted on either side.
  const memory = mergeMemory(readMemory(newer.notes), readDeleted(newer.notes), readMemory(older.notes), readDeleted(older.notes))
  const merged: Notes = writeMemory(notes, memory.notes)
  if (memoryNoteKey in older.notes || memoryNoteKey in newer.notes || memory.deleted.length) merged[memoryDeletedKey] = JSON.stringify(memory.deleted)
  // A box ticked or unticked on the copy changed last keeps that state; boxes only the other copy has stay.
  const checks = { ...older.checks, ...newer.checks }
  // Weak points removed on either device stay removed, unless the mistake came back after the removal.
  const removed = { ...readRemoved(older.notes) }
  for (const [k, d] of Object.entries(readRemoved(newer.notes))) if (!removed[k] || d > removed[k]) removed[k] = d
  if (Object.keys(removed).length) {
    merged[weakRemovedKey] = JSON.stringify(removed)
    try {
      const list = JSON.parse(merged[weakKey] ?? '[]') as { k: string; last?: string }[]
      if (Array.isArray(list)) merged[weakKey] = JSON.stringify(list.filter(i => !removed[i.k] || (i.last ?? '') > removed[i.k]))
    } catch { /* leave it */ }
  }
  // Old review lines folded on either device: the two archives merged day by day; lines from before the merged archive
  // are folded into it (keeping them too would count them twice).
  const events = unionBy(older.reviewEvents, newer.reviewEvents, e => [e.id, e.day, e.gap, e.remembered, e.shownAnswer].join('|'))
  const archive = archiveKey in older.notes || archiveKey in newer.notes ? mergeArchives(readArchive(older.notes), readArchive(newer.notes), events) : null
  if (archive) merged[archiveKey] = JSON.stringify(archive)
  const before = archive?.before ?? ''
  return {
    ...newer,
    startedDay: [mine.startedDay, theirs.startedDay].sort()[0],
    sessions: [...sessions.values()].sort((a, b) => a.day.localeCompare(b.day)),
    cards: [...cards.values()],
    reviewEvents: events.filter(e => !before || e.day >= before).sort((a, b) => a.day.localeCompare(b.day)),
    curriculum: { ...ahead.curriculum, stableUnits: [...new Set([...mine.curriculum.stableUnits, ...theirs.curriculum.stableUnits])].sort((a, b) => a - b) },
    // A word moved to 還不熟 on one device and still 認得 on the other is on one list only: the later move decides.
    ...settleWords(unionBy(older.knownWords, newer.knownWords, w => w), unionBy(older.learningWords, newer.learningWords, w => w), readMoved(merged), newer),
    customWords: unionBy(newer.customWords, older.customWords, w => w.en.toLowerCase()),
    // Flags are cleared one by one in Settings: the copy changed last decides.
    flagged: newer.flagged,
    checks,
    notes: merged,
  }
}
