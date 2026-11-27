import { wordKey } from './vocab'
import { addDays } from './progress'

/**
 * When a word last moved between 認得 and 還不熟 (or went into the word review from a reading), so that two devices merge
 * to the later choice instead of keeping the word on both lists — a word on both was left out of the words still to learn.
 * Kept for 90 days: devices sync long before that.
 */
export const movedKey = 'words.moved'
export type MovedTo = 'k' | 'l'
type Move = [to: MovedTo, day: string, at?: number]
export type Moved = Record<string, Move>
const KEEP_DAYS = 90

const isMove = (v: unknown): v is Move => Array.isArray(v) && (v.length === 2 || v.length === 3)
  && (v[0] === 'k' || v[0] === 'l') && typeof v[1] === 'string'
  && (v.length === 2 || (Number.isSafeInteger(v[2]) && v[2] > 0))
export function readMoved(notes: Record<string, string>): Moved {
  try {
    const v = JSON.parse(notes[movedKey] ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, m]) => isMove(m))) as Moved : {}
  } catch { return {} }
}
/** Records that these words moved to 認得 ('k') or 還不熟 ('l') today; moves older than 90 days are dropped. */
export function noteMoved(notes: Record<string, string>, keys: readonly string[], to: MovedTo, day: string): Record<string, string> {
  if (!keys.length) return notes
  const since = addDays(day, -KEEP_DAYS)
  const kept = Object.entries(readMoved(notes)).filter(([, m]) => m[1] >= since)
  const moved = new Map(kept)
  const at = Date.now()
  for (const word of keys) {
    const k = wordKey(word)
    moved.set(k, [to, day, Math.max(at, (moved.get(k)?.[2] ?? 0) + 1)])
  }
  return { ...notes, [movedKey]: JSON.stringify(Object.fromEntries(moved)) }
}
/** The later choice wins. A legacy same-day tie keeps the word in practice. */
export function mergeMoved(a: Moved, b: Moved): Moved {
  const out = new Map(Object.entries(a))
  for (const [k, m] of Object.entries(b)) {
    const had = out.get(k)
    const at = (m[2] ?? 0) - (had?.[2] ?? 0)
    if (!had || m[1] > had[1] || (m[1] === had[1] && (at > 0 || (at === 0 && m[0] === 'l')))) out.set(k, m)
  }
  return Object.fromEntries(out)
}
/** After a merge, a word on both lists goes to one: the later recorded move; else the list the copy changed last has it
 *  on; else 還不熟. */
export function settleWords(known: readonly string[], learning: readonly string[], moved: Moved, newer: { knownWords: readonly string[]; learningWords: readonly string[] }) {
  const inLearning = new Set(learning.map(wordKey))
  const both = new Set(known.map(wordKey).filter(k => inLearning.has(k)))
  if (!both.size) return { knownWords: [...known], learningWords: [...learning] }
  const newerKnown = new Set(newer.knownWords.map(wordKey)), newerLearning = new Set(newer.learningWords.map(wordKey))
  const goesTo = (k: string): MovedTo => (Object.hasOwn(moved, k) ? moved[k][0] : undefined) ?? (newerKnown.has(k) && !newerLearning.has(k) ? 'k' : 'l')
  return {
    knownWords: known.filter(w => !both.has(wordKey(w)) || goesTo(wordKey(w)) === 'k'),
    learningWords: learning.filter(w => !both.has(wordKey(w)) || goesTo(wordKey(w)) === 'l'),
  }
}
