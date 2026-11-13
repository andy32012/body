import levels from '../data/levels.json'

export interface VocabularyWord { en: string; zh: string; level?: number }

const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase()

function spellings(label: string): string[] {
  return label.split('/').flatMap(raw => {
    const part = normalize(raw)
    const parts = part.match(/^([^()]+?)\s*\(([^()]+)\)$/)
    if (!parts) return [part]
    const base = parts[1].trim()
    const suffix = parts[2]
    if (part.includes(' (')) return [base, ...suffix.split(/,\s*/)]
    return [base, suffix.startsWith(base.slice(0, 3)) ? suffix : base + suffix]
  })
}

// Keep the full official entry as its key. Homographs may appear in more than one entry.
const aliasIndex = new Map<string, string>()
for (const entry of levels) {
  const canonical = normalize(entry.en)
  aliasIndex.set(canonical, canonical)
  for (const spelling of spellings(entry.en)) {
    if (!aliasIndex.has(spelling)) aliasIndex.set(spelling, canonical)
  }
}
export function wordKey(word: string) {
  const normalized = normalize(word)
  return aliasIndex.get(normalized) ?? normalized
}
export const isKnownWord = (word: string, known: readonly string[]) =>
  known.some(value => wordKey(value) === wordKey(word))

// A fixed interleaving keeps learners within their chosen level without alphabetic runs.
const hash = (word: string) => {
  let n = 2166136261
  for (const c of word) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
export const officialWords = [...levels].sort((a, b) =>
  a.level - b.level || hash(a.en) - hash(b.en) || a.en.localeCompare(b.en))

export function getScreeningQueue(known: string[], learning: string[], custom: VocabularyWord[]) {
  const seen = new Set([...known, ...learning].map(wordKey))
  const candidates = [...custom, ...officialWords.filter(w => w.level <= 2)]
  return candidates.filter(w => {
    const key = wordKey(w.en)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
