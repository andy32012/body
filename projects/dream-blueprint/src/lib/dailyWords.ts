import { officialWords, wordKey } from './vocab'
import { addDays, newCard, type ReviewCard } from './progress'
import { createSceneDeck } from './backgroundRotation'
import { seedOf } from './starfield'

const wordPhotos = createSceneDeck(seedOf('daily-word'))
const wordIndices = new Map(officialWords.map((word, index) => [word.en, index]))

export function dailyWordPhoto(key: string) {
  const index = wordIndices.get(key) ?? seedOf(key)
  return wordPhotos[index % wordPhotos.length]
}

export const DAILY_CHOICES = [5, 8, 10, 15, 20, 25, 30] as const
/** 20 a day: at this pace levels 1–2 are seen before the first certificate (全民英檢初級, mid-2027) and levels 3–4 before
 *  the internship starts (2028-02) and 全民英檢中級. At 8 a day level 4 was not reached until 2029, after the exam it is for.
 *  Sorting a word takes seconds; only the unknown ones become cards, and the review cap and the new-word brake keep the load in hand. */
export const DEFAULT_DAILY = 20
export const countKey = 'daily-word.count'
export const doneKey = (day: string) => 'daily-word.done.' + day
export const seenKey = (day: string) => 'daily-word.seen.' + day
export const moreKey = (day: string) => 'daily-word.more.' + day
/** Today's sorted words in order, so the card can step back to the word before. */
export const sortedKey = (day: string) => 'daily-word.sorted.' + day
export interface SortedWord { k: string; known: boolean }
export const officialByKey = new Map(officialWords.map(w => [wordKey(w.en), w]))

export function readSorted(notes: Record<string, string>, day: string): SortedWord[] {
  try {
    const list = JSON.parse(notes[sortedKey(day)] ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((e): e is SortedWord => !!e && typeof e.k === 'string' && typeof e.known === 'boolean') : []
  } catch { return [] }
}
/** Adds a word to today's order; a word already there keeps its place and takes the new choice. */
export function recordSorted(notes: Record<string, string>, day: string, k: string, known: boolean) {
  const list = readSorted(notes, day)
  const next = list.some(e => e.k === k) ? list.map(e => e.k === k ? { k, known } : e) : [...list, { k, known }]
  return { ...notes, [sortedKey(day)]: JSON.stringify(next) }
}

type Sortable = { knownWords: string[]; learningWords: string[]; cards: ReviewCard[]; notes: Record<string, string> }
/** Changes the choice for a word sorted today, after stepping back to it.
 *  還不熟 → 認得: the new card made today goes away (a spot check, as for any 認得, may still bring it back in two weeks).
 *  認得 → 還不熟: the word becomes a new card for tomorrow, replacing a two-week spot check. The day's count stays the same. */
export function changeSorted<S extends Sortable>(prev: S, k: string, known: boolean, day: string): S {
  const id = 'word:' + k
  const others = (list: string[]) => list.filter(w => wordKey(w) !== k)
  let cards = prev.cards
  if (known) {
    cards = cards.filter(c => !(c.id === id && c.box === 1 && c.lastDay === day))
    if (spotCheck(k) && !cards.some(c => c.id === id)) cards = [...cards, { id, box: 4 as const, lastDay: day, due: addDays(day, 14), mastered: false }]
  } else {
    cards = cards.some(c => c.id === id) ? cards.map(c => c.id === id ? newCard(id, day) : c) : [...cards, newCard(id, day)]
  }
  return {
    ...prev,
    knownWords: known ? [...others(prev.knownWords), k] : others(prev.knownWords),
    learningWords: known ? others(prev.learningWords) : [...others(prev.learningWords), k],
    cards,
    notes: recordSorted(prev.notes, day, k, known),
  }
}

/** `backlog`: word cards due beyond what today's review can take (reviewLoad in progress.ts). */
export function dailyTarget(notes: Record<string, string>, quiet: boolean, day: string, backlog = 0) {
  const chosen = Number(notes[countKey])
  const full = DAILY_CHOICES.includes(chosen as (typeof DAILY_CHOICES)[number]) ? chosen : DEFAULT_DAILY
  // Exam and internship days show one word unless the learner asks for the full set.
  if (quiet && notes[moreKey(day)] !== '1') return 1
  return Math.min(full, newWordAllowance(backlog))
}

/** New words share one budget with review: the more word cards pile up past today's review, the fewer new words.
 *  Cards today's review will clear, and sentence cards waiting their turn, never hold new words back. */
export function newWordAllowance(backlog: number) {
  if (backlog >= 80) return 0
  if (backlog <= 30) return 99
  return Math.max(2, 15 - Math.ceil((backlog - 30) / 10) * 3)
}

/** About one in four words marked "認得" comes back two weeks later as a quick recall check. */
export const spotCheck = (key: string) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4 === 0

/** Words not yet sorted, lowest level first, in the same order the screening uses. */
export function dailyQueue(known: readonly string[], learning: readonly string[]) {
  const sorted = new Set([...known, ...learning].map(wordKey))
  return officialWords.filter(w => !sorted.has(wordKey(w.en)))
}
