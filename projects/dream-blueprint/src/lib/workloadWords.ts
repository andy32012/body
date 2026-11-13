import type { AppState } from './store'
import { wordKey } from './vocab'
import courseWords from '../data/words.json'
import levels from '../data/levels.json'

const tiers = new Map(levels.map((w) => [wordKey(w.en), w.level]))

/** Added words come with a bilingual sentence and start with the lowest vocabulary level. */
export function workloadWords(
  state: AppState,
  regular: readonly { en: string }[],
) {
  const seen = new Set(
    [
      ...state.knownWords,
      ...state.learningWords,
      ...regular.map((w) => w.en),
    ].map(wordKey),
  )
  return courseWords
    .filter((w) => !seen.has(wordKey(w.en)))
    .sort(
      (a, b) =>
        (tiers.get(wordKey(a.en)) ?? 7) - (tiers.get(wordKey(b.en)) ?? 7),
    )
    .slice(0, state.workload.extraWords)
}
