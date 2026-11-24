/**
 * 朗讀比對: the text he read, word by word, against what speech recognition heard. Words the recognizer did not
 * come up with are marked. This is not a pronunciation score — a word can be missed because it was said unclearly,
 * too softly, skipped, or simply misheard — but a word missed every time is worth listening to again.
 */
export interface ReadMark { text: string; heard: boolean; word: boolean }
export interface ReadResult { marks: ReadMark[]; heard: number; total: number; ratio: number }

const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
/** 0–999 as words, the way it is read ("125" → one hundred twenty five). */
function numberWords(n: number): string[] {
  if (n < 20) return [ones[n]]
  if (n < 100) return [tens[Math.floor(n / 10)], ...(n % 10 ? [ones[n % 10]] : [])]
  return [ones[Math.floor(n / 100)], 'hundred', ...(n % 100 ? numberWords(n % 100) : [])]
}
const contractions: Record<string, string[]> = {
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'], "it's": ['it', 'is'],
  "he's": ['he', 'is'], "she's": ['she', 'is'], "that's": ['that', 'is'], "there's": ['there', 'is'], "what's": ['what', 'is'],
  "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'], "isn't": ['is', 'not'], "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'], "weren't": ['were', 'not'], "can't": ['can', 'not'], "couldn't": ['could', 'not'], "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'], "shouldn't": ['should', 'not'], "haven't": ['have', 'not'], "hasn't": ['has', 'not'],
  "i'll": ['i', 'will'], "you'll": ['you', 'will'], "we'll": ['we', 'will'], "they'll": ['they', 'will'], "it'll": ['it', 'will'],
  "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'], "they've": ['they', 'have'], "i'd": ['i', 'would'],
  "let's": ['let', 'us'], cannot: ['can', 'not'], ok: ['okay'], "o'clock": ['oclock'],
}
/** The spoken words inside one written token: lower case, contractions opened, numbers spelled out, hyphens split. */
export function spokenWords(token: string): string[] {
  const t = token.toLowerCase().replace(/[’‘`]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
  if (!t) return []
  if (contractions[t]) return contractions[t]
  if (/^\d+$/.test(t) && Number(t) < 1000) return numberWords(Number(t))
  return t.split(/[-–—/]/).map(p => p.replace(/'s$/, '').replace(/[^a-z0-9]/g, '')).filter(Boolean)
}
const heardWords = (text: string) => text.split(/\s+/).flatMap(spokenWords)

/** Longest common subsequence of the two word lists: which target words have a partner in what was heard, in order. */
function matched(target: string[], heard: string[]): boolean[] {
  const n = target.length, m = heard.length
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = target[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = new Array<boolean>(n).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (target[i] === heard[j]) { out[i] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return out
}

/** Marks each written word of the text: heard when all its spoken words were recognised (in order). */
export function compareReading(text: string, heardText: string): ReadResult {
  const tokens = text.split(/(\s+)/)
  const parts = tokens.map(t => /^\s+$/.test(t) || !t ? [] : spokenWords(t))
  const flat = parts.flat()
  const ok = matched(flat, heardWords(heardText))
  let at = 0, heard = 0, total = 0
  const marks: ReadMark[] = tokens.filter(t => t !== '').map(t => {
    const spoken = /^\s+$/.test(t) ? [] : spokenWords(t)
    if (!spoken.length) return { text: t, heard: true, word: false }
    const got = spoken.every((_, k) => ok[at + k])
    at += spoken.length
    total++
    if (got) heard++
    return { text: t, heard: got, word: true }
  })
  return { marks, heard, total, ratio: total ? heard / total : 0 }
}

/** The words that were not heard, once each, for a short list under the text. */
export function missedWords(result: ReadResult): string[] {
  const seen = new Set<string>()
  return result.marks.filter(m => m.word && !m.heard).map(m => m.text.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')).filter(w => {
    const k = w.toLowerCase()
    if (!w || seen.has(k)) return false
    seen.add(k)
    return true
  })
}
