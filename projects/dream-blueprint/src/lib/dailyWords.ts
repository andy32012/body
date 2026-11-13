import { officialWords, wordKey } from './vocab'

export const DAILY_CHOICES = [5, 8, 10, 15] as const
export const DEFAULT_DAILY = 8
export const countKey = 'daily-word.count'
export const doneKey = (day: string) => 'daily-word.done.' + day
export const seenKey = (day: string) => 'daily-word.seen.' + day
export const moreKey = (day: string) => 'daily-word.more.' + day

export function dailyTarget(notes: Record<string, string>, quiet: boolean, day: string) {
  const chosen = Number(notes[countKey])
  const full = DAILY_CHOICES.includes(chosen as (typeof DAILY_CHOICES)[number]) ? chosen : DEFAULT_DAILY
  // Exam and internship days show one word unless the learner asks for the full set.
  return quiet && notes[moreKey(day)] !== '1' ? 1 : full
}

/** Words not yet sorted, lowest level first, in the same order the screening uses. */
export function dailyQueue(known: readonly string[], learning: readonly string[]) {
  const sorted = new Set([...known, ...learning].map(wordKey))
  return officialWords.filter(w => !sorted.has(wordKey(w.en)))
}
