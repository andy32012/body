import type { AppState } from './store'
import { memoryDeletedKey, memoryNoteKey, mergeMemory, readDeleted, readMemory, writeMemory } from './memory'

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

/** One note both sides wrote differently. `newer` is the value from the copy changed last. */
export function mergeNote(key: string, older: string, newer: string): string {
  if (older === newer) return newer
  // Counts (today's sentence review and the like): the larger one has everything done on either device.
  if (/^\d+$/.test(older) && /^\d+$/.test(newer)) return String(Math.max(Number(older), Number(newer)))
  const a = parse(older), b = parse(newer)
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
  const sessions = new Map<string, AppState['sessions'][number]>()
  for (const s of [...older.sessions, ...newer.sessions]) {
    const had = sessions.get(s.id)
    const size = (x: typeof s) => (x.translations?.length ?? 0) * 100 + x.words.length + (x.spokenIds?.length ?? 0)
    if (!had || size(s) >= size(had)) sessions.set(s.id, s)
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
  const checks = { ...older.checks }
  for (const [k, v] of Object.entries(newer.checks)) checks[k] = v || !!older.checks[k]
  return {
    ...newer,
    startedDay: [mine.startedDay, theirs.startedDay].sort()[0],
    sessions: [...sessions.values()].sort((a, b) => a.day.localeCompare(b.day)),
    cards: [...cards.values()],
    reviewEvents: unionBy(older.reviewEvents, newer.reviewEvents, e => [e.id, e.day, e.gap, e.remembered, e.shownAnswer].join('|'))
      .sort((a, b) => a.day.localeCompare(b.day)),
    curriculum: { ...ahead.curriculum, stableUnits: [...new Set([...mine.curriculum.stableUnits, ...theirs.curriculum.stableUnits])].sort((a, b) => a - b) },
    knownWords: unionBy(older.knownWords, newer.knownWords, w => w),
    learningWords: unionBy(older.learningWords, newer.learningWords, w => w),
    customWords: unionBy(newer.customWords, older.customWords, w => w.en.toLowerCase()),
    flagged: unionBy(older.flagged, newer.flagged, w => w),
    checks,
    notes: merged,
  }
}
