/** What a piece of work shows about a unit's goal. Finishing with help, doing it alone once,
 *  and still doing it later with a new item are different things, and are kept apart.
 *  A self-marked "correct" that no one checked stays 「自評完成・待確認」 instead of counting either way. */
export type Level = 'assisted' | 'independent' | 'delayed' | 'pending'
export const levelNames: Record<Level, string> = {
  assisted: '有提示完成', independent: '當次獨立完成', delayed: '延後換題仍能完成', pending: '自評完成・待確認',
}
const rank: Record<Level, number> = { pending: 0, assisted: 1, independent: 2, delayed: 3 }
export type Source = 'pattern' | 'vary' | 'express' | 'checkpoint' | 'retention' | 'listen'
export const sourceNames: Record<Source, string> = {
  pattern: '今天的句子', vary: '換個說法', express: '用自己的話', checkpoint: '單元小關卡', retention: '隔幾個單元回想', listen: '只聽對話',
}
export interface Evidence {
  day: string; level: Level; source: Source; skill: 'write' | 'listen'
  item?: string; hints?: number
  /** Kept only for 待確認, so the answer can be checked later. */
  answer?: string; prompt?: string; ref?: string
}
/** Claude's check of a written answer: good = meaning right and natural; small / again = meaning clear but grammar or words
 *  need fixing; changed = grammatical maybe, but it says something else (換貨 written as a refund). */
export type Verdict = 'good' | 'small' | 'again' | 'changed'
export const evidenceKey = (unit: number) => 'evidence.' + unit

export function readEvidence(notes: Record<string, string>, unit: number): Evidence[] {
  try { return notes[evidenceKey(unit)] ? JSON.parse(notes[evidenceKey(unit)]) as Evidence[] : [] } catch { return [] }
}
export function addEvidence(notes: Record<string, string>, unit: number, ev: Evidence) {
  const list = readEvidence(notes, unit).filter(e => !(e.day === ev.day && e.source === ev.source && e.item === ev.item))
  return { ...notes, [evidenceKey(unit)]: JSON.stringify([...list, ev].slice(-40)) }
}
export function setEvidenceLevel(notes: Record<string, string>, unit: number, index: number, level: Level) {
  const list = readEvidence(notes, unit)
  if (!list[index]) return notes
  list[index] = { ...list[index], level, answer: undefined, prompt: undefined, ref: undefined }
  return { ...notes, [evidenceKey(unit)]: JSON.stringify(list) }
}
export function unitsWithEvidence(notes: Record<string, string>) {
  return Object.keys(notes).filter(k => k.startsWith('evidence.')).map(k => Number(k.slice(9))).filter(n => n > 0).sort((a, b) => a - b)
}
export function bestLevel(list: readonly Evidence[], skill: 'write' | 'listen' = 'write'): Level | null {
  const own = list.filter(e => e.skill === skill)
  return own.length ? own.reduce((a, e) => rank[e.level] > rank[a] ? e.level : a, own[0].level) : null
}

const contractions: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'], [/\byou're\b/g, 'you are'], [/\bwe're\b/g, 'we are'], [/\bthey're\b/g, 'they are'],
  [/\b(it|that|he|she|there|what|where|who)'s\b/g, '$1 is'], [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'],
  [/\b(\w+)n't\b/g, '$1 not'], [/\b(i|you|we|they|he|she|it)'ll\b/g, '$1 will'], [/\b(i|you|we|they)'ve\b/g, '$1 have'],
  [/\b(i|you|we|they|he|she)'d\b/g, '$1 would'], [/\bcan not\b/g, 'cannot'],
]
export function normalizeEnglish(t: string) {
  let s = t.toLowerCase().replace(/[’‘]/g, "'")
  for (const [re, to] of contractions) s = s.replace(re, to)
  return s.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
export const matchesReference = (answer: string, refs: readonly string[]) =>
  !!answer.trim() && refs.some(r => normalizeEnglish(r) === normalizeEnglish(answer))

/** Word-by-word comparison with the closest reference, shown only after the reference itself is open:
 *  `extra` words are not in that reference, `missing` are reference words the answer does not have.
 *  A different wording can still be right — this only points at where to look. */
export function compareWithReference(answer: string, refs: readonly string[]) {
  const a = normalizeEnglish(answer).split(' ').filter(Boolean)
  let best: { ref: string; extra: Set<number>; missing: string[]; score: number } | null = null
  for (const ref of refs) {
    const r = normalizeEnglish(ref).split(' ').filter(Boolean)
    // Longest common subsequence of words.
    const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(r.length + 1).fill(0))
    for (let i = a.length - 1; i >= 0; i--) for (let j = r.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === r[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    const keepA = new Set<number>(), keepR = new Set<number>()
    for (let i = 0, j = 0; i < a.length && j < r.length;) {
      if (a[i] === r[j]) { keepA.add(i); keepR.add(j); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++
    }
    const extra = new Set(a.map((_, i) => i).filter(i => !keepA.has(i)))
    const missing = r.filter((_, j) => !keepR.has(j))
    const score = extra.size + missing.length
    if (!best || score < best.score) best = { ref, extra, missing, score }
  }
  return best ? { ref: best.ref, words: a.map((w, i) => ({ w, extra: best!.extra.has(i) })), missing: best.missing, same: best.score === 0 } : null
}

/** Nothing written is 「未作答」: it leaves no evidence, whichever button was pressed. */
export const answered = (answer?: string) => !!answer?.trim()

/** One standard for every place an answer is written — the lesson, the checkpoint, recall, review and redo:
 *  nothing written → 未作答 (null); hints or the answer seen → 有提示完成; Claude's first check or an exact match → 當次獨立完成;
 *  a self-marked "correct" with neither → 自評完成・待確認. 「不會」 leaves no evidence. 「穩了」 needs 當次獨立完成 later, on another item. */
export function judgeWritten(a: { rating: 'correct' | 'minor' | 'again'; revealed: boolean; answer?: string; references: readonly string[]; firstVerdict?: Verdict }): Level | null {
  if (a.rating === 'again' || !answered(a.answer)) return null
  if (a.revealed || a.rating === 'minor') return 'assisted'
  if (a.firstVerdict === 'good' || matchesReference(a.answer ?? '', a.references)) return 'independent'
  if (a.firstVerdict) return 'assisted'
  return 'pending'
}
/** Whether a written answer may count toward 「穩了」: answered alone and checked (exact match or Claude's first verdict). */
export const verifiedAlone = (a: Parameters<typeof judgeWritten>[0]) => judgeWritten(a) === 'independent'
/** The variation is written first and only then compared with the answer. */
export function judgeVariation(mark: 'good' | 'small' | 'again', answer: string, en: string): Level | null {
  if (mark === 'again' || !answered(answer)) return null
  if (mark === 'small') return 'assisted'
  return matchesReference(answer, [en]) ? 'independent' : 'pending'
}
/** The open task: a frame, the model answer or asking Claude (「我卡住了」) counts as help; the first feedback decides "alone". */
export function judgeExpress(r: { firstVerdict?: Verdict; help: readonly string[]; answered: boolean }): Level | null {
  if (!r.answered) return null
  if (r.help.includes('frame') || r.help.includes('sample') || r.help.includes('claude')) return 'assisted'
  if (!r.firstVerdict) return 'pending'
  return r.firstVerdict === 'good' ? 'independent' : 'assisted'
}
/** A checkpoint comes days after the lesson, with new sentences: two done alone is 「延後換題仍能完成」. */
export function judgeCheckpoint(levels: readonly (Level | null)[]): Level | null {
  const alone = levels.filter(l => l === 'independent').length
  if (alone >= 2) return 'delayed'
  if (levels.some(l => l === 'pending')) return 'pending'
  return levels.filter(l => l === 'assisted' || l === 'independent').length >= 2 ? 'assisted' : null
}
