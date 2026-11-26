import { wordKey } from './vocab'
import { addDays } from './progress'

/**
 * When a word last moved between 認得 and 還不熟 (or went into the word review from a reading), so that two devices merge
 * to the later choice instead of keeping the word on both lists — a word on both was left out of the words still to learn.
 * Kept for 90 days: devices sync long before that.
 */
export const movedKey = 'words.moved'
export type MovedTo = 'k' | 'l'
export type Moved = Record<string, [to: MovedTo, day: string]>
const KEEP_DAYS = 90

const isMove = (v: unknown): v is [MovedTo, string] => Array.isArray(v) && v.length === 2 && (v[0] === 'k' || v[0] === 'l') && typeof v[1] === 'string'
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
  const moved: Moved = Object.fromEntries(kept)
  for (const k of keys) moved[wordKey(k)] = [to, day]
  return { ...notes, [movedKey]: JSON.stringify(moved) }
}
/** Two devices' records: the later move of each word; the same day, 還不熟 (the word stays in practice). */
export function mergeMoved(a: Moved, b: Moved): Moved {
  const out: Moved = { ...a }
  for (const [k, m] of Object.entries(b)) {
    const had = out[k]
    if (!had || m[1] > had[1] || (m[1] === had[1] && m[0] === 'l')) out[k] = m
  }
  return out
}
/** After a merge, a word on both lists goes to one: the later recorded move; else the list the copy changed last has it
 *  on; else 還不熟. */
export function settleWords(known: readonly string[], learning: readonly string[], moved: Moved, newer: { knownWords: readonly string[]; learningWords: readonly string[] }) {
  const inLearning = new Set(learning.map(wordKey))
  const both = new Set(known.map(wordKey).filter(k => inLearning.has(k)))
  if (!both.size) return { knownWords: [...known], learningWords: [...learning] }
  const newerKnown = new Set(newer.knownWords.map(wordKey)), newerLearning = new Set(newer.learningWords.map(wordKey))
  const goesTo = (k: string): MovedTo => moved[k]?.[0] ?? (newerKnown.has(k) && !newerLearning.has(k) ? 'k' : 'l')
  return {
    knownWords: known.filter(w => !both.has(wordKey(w)) || goesTo(wordKey(w)) === 'k'),
    learningWords: learning.filter(w => !both.has(wordKey(w)) || goesTo(wordKey(w)) === 'l'),
  }
}
