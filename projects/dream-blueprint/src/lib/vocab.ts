import levels from '../data/levels.json'

export interface VocabularyWord { en: string; zh: string; level?: number }
/** One form inside a merged entry: "he (him, his, himself)" → he / him / his / himself, each with its own meaning.
 *  Several spellings in `forms` are the same word (airplane / plane); separate items are different words or forms. */
export interface WordForm { forms: string[]; zh: string; pos: string }
/** A word-table entry. `zh` lists meanings separated by 「；」; `sensePos` gives each of those meanings its part of speech. */
export interface LevelEntry { en: string; level: number; zh: string; pos?: string; sensePos?: string[]; forms?: WordForm[] }

/** "n. 聲音；v. 聽起來": every meaning with its own part of speech, so the label always matches what is shown. */
export function meaningLine(e: Pick<LevelEntry, 'zh' | 'pos' | 'sensePos'>) {
  const groups = e.zh.split('；')
  if (e.sensePos && e.sensePos.length === groups.length) {
    // Consecutive meanings with the same part of speech share one label: "v. 玩；彈奏；n. 戲劇".
    return groups.map((g, i) => (i > 0 && e.sensePos![i] === e.sensePos![i - 1] ? '' : e.sensePos![i] + ' ') + g).join('；')
  }
  return (e.pos && !e.pos.includes('/') ? e.pos + ' ' : '') + e.zh
}
/** The forms of a merged entry, each on its own line: "him pron. 他（當受詞）". Empty for an ordinary word. */
export const formLines = (e: Pick<LevelEntry, 'forms'>) =>
  e.forms && e.forms.length > 1 ? e.forms.map(f => ({ en: f.forms.join(' / '), pos: f.pos, zh: f.zh })) : []

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
// The spellings an entry lists in `forms` (Mr for Mr./Mister, acknowledgment for acknowledge(ment)) find it too, and
// so does a short form without its full stop (Mrs for Mrs., as a tapped word arrives without it). A spelling another
// entry already has keeps that entry, so no existing key changes.
for (const entry of levels as LevelEntry[]) {
  const canonical = normalize(entry.en)
  const listed = [...spellings(entry.en), ...(entry.forms?.flatMap(f => f.forms) ?? []).map(normalize)]
  for (const spelling of [...listed, ...listed.filter(x => x.endsWith('.')).map(x => x.slice(0, -1))]) {
    if (spelling && !aliasIndex.has(spelling)) aliasIndex.set(spelling, canonical)
  }
}
export function wordKey(word: string) {
  const normalized = normalize(word)
  return aliasIndex.get(normalized) ?? normalized
}
export const isKnownWord = (word: string, known: readonly string[]) =>
  known.some(value => wordKey(value) === wordKey(word))

const entryIndex = new Map((levels as LevelEntry[]).map(e => [normalize(e.en), e]))
export const levelEntry = (word: string): LevelEntry | undefined => entryIndex.get(wordKey(word))

/** What a spelling drill asks for. A merged entry is asked one form at a time, with that form's own meaning,
 *  so "him" is practised as 他（當受詞）, not as any of he / him / his / himself. `turn` picks which form this time. */
export function spellingTargets(word: { en: string; zh: string }, turn = 0): { en: string; zh: string; accept: string } {
  const forms = levelEntry(word.en)?.forms
  if (!forms || forms.length < 2) return { en: word.en, zh: word.zh, accept: forms?.[0]?.forms.join('/') ?? word.en }
  const f = forms[Math.abs(turn) % forms.length]
  return { en: f.forms[0], zh: f.zh + '（' + f.pos + '）', accept: f.forms.join('/') }
}

// A fixed interleaving keeps learners within their chosen level without alphabetic runs.
const hash = (word: string) => {
  let n = 2166136261
  for (const c of word) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
export const officialWords = ([...levels] as LevelEntry[]).sort((a, b) =>
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

/** 分級找字: words of one level matching what he typed. The word spelt exactly comes first (typing "in" shows in, not
 *  win and meeting), then words starting with it, then the rest; only then are the first `limit` kept. */
export function lookupWords<T extends { en: string; zh: string; level: number }>(words: readonly T[], level: number, term: string, limit = 12): T[] {
  const t = term.trim().toLowerCase()
  const here = words.filter(w => w.level === level)
  if (!t) return here.slice(0, limit)
  const rank = (w: T) => { const en = w.en.toLowerCase(); return en === t ? 0 : en.startsWith(t) ? 1 : en.includes(t) ? 2 : w.zh.includes(t) ? 3 : -1 }
  return here.map(w => ({ w, r: rank(w) })).filter(x => x.r >= 0).sort((a, b) => a.r - b.r).slice(0, limit).map(x => x.w)
}
