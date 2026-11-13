export interface Passage {
  id: string
  level: number
  letter: string
  n: number
  zh: string
  en?: string
  words?: { en: string; zh: string }[]
}
export const doneKey = (id: string) => 'passage.' + id
export const redoKey = (id: string) => 'passage.redo.' + id
export const levelKey = 'passage.level'

/** The next passage to translate in a level: unfinished ones in book order, then the ones marked to redo. */
export function nextPassage(all: readonly Passage[], level: number, checks: Record<string, boolean>,
  notes: Record<string, string>, skipped: readonly string[] = [], letter = '') {
  const pool = all.filter(p => p.level === level && (!letter || p.letter === letter))
  const open = pool.filter(p => !checks[doneKey(p.id)] && !skipped.includes(p.id))
  return open.find(p => !notes[redoKey(p.id)]) ?? open[0]
}
export const levelProgress = (all: readonly Passage[], level: number, checks: Record<string, boolean>) => {
  const pool = all.filter(p => p.level === level)
  return { done: pool.filter(p => checks[doneKey(p.id)]).length, total: pool.length }
}
