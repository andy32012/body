import { officialWords, wordKey } from './vocab'
import { createSceneDeck } from './backgroundRotation'
import { seedOf } from './starfield'

const wordPhotos = createSceneDeck(seedOf('daily-word'))
const wordIndices = new Map(officialWords.map((word, index) => [word.en, index]))

export function dailyWordPhoto(key: string) {
  const index = wordIndices.get(key) ?? seedOf(key)
  return wordPhotos[index % wordPhotos.length]
}

export const DAILY_CHOICES = [5, 8, 10, 15] as const
export const DEFAULT_DAILY = 8
export const countKey = 'daily-word.count'
export const doneKey = (day: string) => 'daily-word.done.' + day
export const seenKey = (day: string) => 'daily-word.seen.' + day
export const moreKey = (day: string) => 'daily-word.more.' + day

export function dailyTarget(notes: Record<string, string>, quiet: boolean, day: string, due = 0) {
  const chosen = Number(notes[countKey])
  const full = DAILY_CHOICES.includes(chosen as (typeof DAILY_CHOICES)[number]) ? chosen : DEFAULT_DAILY
  // Exam and internship days show one word unless the learner asks for the full set.
  if (quiet && notes[moreKey(day)] !== '1') return 1
  return Math.min(full, newWordAllowance(due))
}

/** New words share one budget with review: the more cards are waiting, the fewer new words. */
export function newWordAllowance(due: number) {
  if (due >= 80) return 0
  if (due <= 30) return 99
  return Math.max(2, 15 - Math.ceil((due - 30) / 10) * 3)
}

/** About one in four words marked "認得" comes back two weeks later as a quick recall check. */
export const spotCheck = (key: string) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4 === 0

/** Words not yet sorted, lowest level first, in the same order the screening uses. */
export function dailyQueue(known: readonly string[], learning: readonly string[]) {
  const sorted = new Set([...known, ...learning].map(wordKey))
  return officialWords.filter(w => !sorted.has(wordKey(w.en)))
}
