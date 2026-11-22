import { addDays, dayKey } from './progress'

export interface Passage {
  id: string
  level: number
  letter: string
  n: number
  zh: string
  en?: string
  /** The words this passage really uses: `form` is the word exactly as it appears in the English (saw, bounded, am),
   *  `en` the word-table entry it belongs to (see, bound, be) and `zh` its meaning in this passage, not the table's
   *  general meaning. Edit these per passage; never overwrite them from the word table. */
  words?: { en: string; zh: string; form?: string }[]
}
export const doneKey = (id: string) => 'passage.' + id
export const redoKey = (id: string) => 'passage.redo.' + id
export const levelKey = 'passage.level'

/** A passage marked 「不會」 stores the day it was marked; it comes back once a day has passed. Old '1' marks count as due. */
export function redoDue(notes: Record<string, string>, id: string, today = dayKey()) {
  const marked = notes[redoKey(id)]
  return !!marked && (marked === '1' || marked <= addDays(today, -1))
}

/** The next passage to translate in a level: 「不會」 passages that are due again come first, then unfinished ones in book order. */
export function nextPassage(all: readonly Passage[], level: number, checks: Record<string, boolean>,
  notes: Record<string, string>, skipped: readonly string[] = [], letter = '', today = dayKey()) {
  const pool = all.filter(p => p.level === level && (!letter || p.letter === letter))
  const open = pool.filter(p => !checks[doneKey(p.id)] && !skipped.includes(p.id))
  return open.find(p => redoDue(notes, p.id, today)) ?? open.find(p => !notes[redoKey(p.id)]) ?? open[0]
}
export const levelProgress = (all: readonly Passage[], level: number, checks: Record<string, boolean>) => {
  const pool = all.filter(p => p.level === level)
  return { done: pool.filter(p => checks[doneKey(p.id)]).length, total: pool.length }
}
