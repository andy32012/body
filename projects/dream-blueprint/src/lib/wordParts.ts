import data from '../data/word-parts.json'

/** Everyday prefixes, roots and suffixes (un-, port, -ful …): what a part means, words that show it, and one word to guess.
 *  The order of the list is the order they are learned in: the most common and most recognisable first. */
export interface PartExample { en: string; zh: string; how?: string }
export interface WordPart { id: string; type: '字首' | '字根' | '字尾'; part: string; meaning: string; examples: PartExample[]; guess: { en: string; zh: string } }
export const wordParts = data as WordPart[]

/** How many new parts a day before the page says "that is enough for today" (more can be asked for). */
export const PARTS_A_DAY = 3
export const learnedKey = (id: string) => 'word-part.' + id
export const dayCountKey = (day: string) => 'word-part.day.' + day
export const moreKey = (day: string) => 'word-part.more.' + day

export const isLearned = (checks: Record<string, boolean>, p: WordPart) => !!checks[learnedKey(p.id)]
export const learnedParts = (checks: Record<string, boolean>) => wordParts.filter(p => isLearned(checks, p))
export const learnedToday = (notes: Record<string, string>, day: string) => Number(notes[dayCountKey(day)]) || 0
/** Today's allowance: three, plus three for every time he asked for more. */
export const allowance = (notes: Record<string, string>, day: string) => PARTS_A_DAY * (1 + (Number(notes[moreKey(day)]) || 0))

/** The parts to show now: the next ones not learned yet, as many as today's allowance still has room for. */
export function partsForToday(checks: Record<string, boolean>, notes: Record<string, string>, day: string): WordPart[] {
  const room = Math.max(0, allowance(notes, day) - learnedToday(notes, day))
  return wordParts.filter(p => !isLearned(checks, p)).slice(0, room)
}

/** Small deterministic generator, so the same part always shows its choices in the same order. */
function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function shuffled<T>(items: T[], seed: number) {
  const out = [...items], rnd = seeded(seed)
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

export interface PartQuiz { q: string; options: string[]; answer: number }
/** "What does <guess word> mean?" The wrong choices are the guess words of other parts of the same kind. */
export function guessQuiz(p: WordPart): PartQuiz {
  const i = wordParts.indexOf(p)
  const same = wordParts.filter(o => o.type === p.type && o !== p)
  const others = shuffled(same, i + 1).slice(0, 2).map(o => o.guess.zh)
  const options = shuffled([p.guess.zh, ...others], i + 101)
  return { q: p.guess.en, options, answer: options.indexOf(p.guess.zh) }
}
/** Review of a learned part: "What does <part> mean?" The wrong choices are the meanings of other parts of the same kind. */
export function meaningQuiz(p: WordPart, round = 0): PartQuiz {
  const i = wordParts.indexOf(p)
  const same = new Set(wordParts.filter(o => o.type === p.type && o.meaning !== p.meaning).map(o => o.meaning))
  const others = shuffled([...same], i + 7 + round * 31).slice(0, 2)
  const options = shuffled([p.meaning, ...others], i + 211 + round * 17)
  return { q: p.part, options, answer: options.indexOf(p.meaning) }
}
/** Which learned parts to ask about now: the ones learned longest ago first is not known, so a different slice each round. */
export function reviewRound(checks: Record<string, boolean>, round: number, size = 5): WordPart[] {
  return shuffled(learnedParts(checks), round + 1).slice(0, size)
}
