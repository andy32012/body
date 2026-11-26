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
  /** Claude checked it and said it is wrong (the reason): it is not done until he rewrites it right. */
  wrong?: string
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
/** How Claude's check of a 待確認 answer reads: a 「判定：對」 or 「判定：錯」 line and a 「原因：」 line that says why.
 *  Anything else (「對不起，…」, a bare 「對。」, no reason) is not a verdict. */
export function teacherVerdict(reply: string): 'right' | 'wrong' | 'unclear' {
  const v = reply.match(/^\s*判定[：:]\s*(對|錯)\s*[。.]?\s*$/m)?.[1]
  return v && teacherReason(reply) ? (v === '對' ? 'right' : 'wrong') : 'unclear'
}
/** The 原因 line of Claude's check. */
export const teacherReason = (reply: string) => reply.match(/^\s*原因[：:]\s*(.+)$/m)?.[1].trim() ?? ''
/** Which 待確認 answer a check was sent for: the item and the exact answer, so a reply never lands on another one. */
export type PendingRef = Pick<Evidence, 'day' | 'source' | 'item' | 'answer'>
export const pendingRef = (e: Evidence): PendingRef => ({ day: e.day, source: e.source, item: e.item, answer: e.answer })
/** A 待確認 answer after Claude's check. Right the first time → done alone; right after a rewrite (it was wrong before)
 *  → done with help. Wrong → still not done, with the reason, the question and his answer kept so he can rewrite it.
 *  Unclear → nothing changes. The check lands on the answer it was sent for, found by its item and answer (the list may
 *  have moved while Claude was answering); if that answer is gone or was changed meanwhile, nothing changes. */
export function checkPending(notes: Record<string, string>, unit: number, ref: PendingRef, reply: string, rewrite?: string) {
  const verdict = teacherVerdict(reply)
  const list = readEvidence(notes, unit)
  const index = list.findIndex(e => e.level === 'pending' && e.day === ref.day && e.source === ref.source && e.item === ref.item && e.answer === ref.answer)
  const e = list[index]
  if (!e || verdict === 'unclear') return notes
  if (verdict === 'right') {
    list[index] = { ...e, level: e.wrong || rewrite !== undefined ? 'assisted' : 'independent', answer: undefined, prompt: undefined, ref: undefined, wrong: undefined }
  } else {
    list[index] = { ...e, level: 'pending', wrong: teacherReason(reply) || '還要再改', ...(rewrite !== undefined ? { answer: rewrite } : {}) }
  }
  return { ...notes, [evidenceKey(unit)]: JSON.stringify(list) }
}
export function unitsWithEvidence(notes: Record<string, string>) {
  return Object.keys(notes).filter(k => k.startsWith('evidence.')).map(k => Number(k.slice(9))).filter(n => n > 0).sort((a, b) => a - b)
}
export function bestLevel(list: readonly Evidence[], skill: 'write' | 'listen' = 'write'): Level | null {
  // An answer Claude said is wrong shows nothing yet, not even 自評完成.
  const own = list.filter(e => e.skill === skill && !e.wrong)
  return own.length ? own.reduce((a, e) => rank[e.level] > rank[a] ? e.level : a, own[0].level) : null
}

// Contractions with only one reading are always expanded.
const contractions: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'], [/\byou're\b/g, 'you are'], [/\bwe're\b/g, 'we are'], [/\bthey're\b/g, 'they are'],
  [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\b(\w+)n't\b/g, '$1 not'],
  [/\b(i|you|we|they|he|she|it|there|that)'ll\b/g, '$1 will'], [/\b(i|you|we|they|who|there)'ve\b/g, '$1 have'], [/\bcan not\b/g, 'cannot'],
]
// 's can be is or has, 'd can be would or had. A reference is read by the word after it; an answer may mean either.
const sSubject = /\b(it|that|he|she|there|what|where|who|here)'s\b/g
const dSubject = /\b(i|you|we|they|he|she|it|there)'d\b/g
const adverbs = new Set(['never', 'already', 'just', 'ever', 'always', 'not', 'also', 'really', 'still', 'recently', 'often'])
const participles = new Set(['been', 'gone', 'done', 'seen', 'eaten', 'taken', 'given', 'had', 'made', 'written', 'known', 'got', 'gotten', 'come',
  'become', 'begun', 'broken', 'chosen', 'driven', 'fallen', 'forgotten', 'flown', 'grown', 'hidden', 'left', 'lost', 'met', 'paid', 'put',
  'run', 'said', 'sent', 'sold', 'spoken', 'stolen', 'thought', 'told', 'understood', 'won', 'worn', 'woken', 'felt', 'found', 'heard',
  'kept', 'slept', 'spent', 'stood', 'brought', 'bought', 'caught', 'taught', 'fought', 'held', 'built', 'meant', 'shut', 'cut', 'hit',
  'hurt', 'set', 'let', 'sat', 'drunk', 'swum', 'rung', 'sung', 'shown', 'risen', 'ridden', 'thrown', 'grown', 'blown', 'drawn', 'worn'])
// -ed words that usually follow "is" (He's tired), not "has".
const adjectives = new Set(['tired', 'worried', 'married', 'excited', 'bored', 'interested', 'scared', 'surprised', 'pleased', 'satisfied',
  'confused', 'embarrassed', 'disappointed', 'relaxed', 'shocked', 'frightened', 'injured', 'retired', 'located', 'allowed', 'supposed',
  'used', 'required', 'dressed', 'prepared', 'stressed', 'annoyed', 'amazed', 'exhausted', 'qualified', 'related', 'closed', 'crowded',
  'delayed', 'discharged', 'admitted', 'scheduled', 'covered', 'involved', 'concerned', 'dehydrated', 'infected', 'swollen', 'broken'])
function nextVerb(rest: string) {
  const words = rest.trim().split(/\s+/)
  return words.find(w => !adverbs.has(w)) ?? ''
}
const isParticiple = (w: string) => !adjectives.has(w) && (participles.has(w) || /ed$/.test(w))
function base(t: string) {
  let s = t.toLowerCase().replace(/[’‘]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [re, to] of contractions) s = s.replace(re, to)
  return s
}
const clean = (s: string) => s.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** One reading of a reference: 's / 'd expanded by the word that follows (He's lived → has, He's tired → is, I'd like → would). */
function referenceForm(t: string) {
  const s = clean(base(t))
  return s.replace(sSubject, (_m, who: string, off: number) => who + (isParticiple(nextVerb(s.slice(off + _m.length))) ? ' has' : ' is'))
    .replace(dSubject, (_m, who: string, off: number, all: string) => {
      const next = nextVerb(all.slice(off + _m.length))
      return who + (next === 'better' || isParticiple(next) ? ' had' : ' would')
    })
}
/** Every reading of an answer: a learner's contraction is right if either expansion matches. */
function answerForms(t: string): string[] {
  let forms = [clean(base(t))]
  for (const [re, tos] of [[sSubject, ['is', 'has']], [dSubject, ['would', 'had']]] as const) {
    forms = forms.flatMap(f => {
      const parts: string[] = []; const whos: string[] = []; let last = 0
      f.replace(re, (m: string, who: string, off: number) => { parts.push(f.slice(last, off)); whos.push(who); last = off + m.length; return m })
      if (!whos.length) return [f]
      let out = ['']
      whos.forEach((who, i) => { out = out.flatMap(o => tos.map(to => o + parts[i] + who + ' ' + to)) })
      return out.map(o => o + f.slice(last))
    }).slice(0, 16)
  }
  return [...new Set(forms)]
}
/** The form used to compare and show word differences. */
export function normalizeEnglish(t: string) {
  return referenceForm(t)
}
/** Whether an answer is still the text that was checked (by Claude, or before the answer was shown). Case, spacing,
 *  curly quotes, contractions and how a statement ends (. or !) may differ; every other mark counts: taking the commas
 *  out of "My sister, who is a nurse, lives in Taipei." changes what it says, and so does turning a question into a
 *  statement, so the earlier check no longer applies. (Matching an answer with the reference is looser: normalizeEnglish.) */
const checkedForm = (t: string) => base(t).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim().replace(/[.!]+$/, '').trim()
export const sameEnglish = (a: string, b: string) => checkedForm(a) === checkedForm(b)
export function matchesReference(answer: string, refs: readonly string[]) {
  if (!answer.trim()) return false
  const forms = new Set(answerForms(answer))
  return refs.some(r => forms.has(referenceForm(r)) && clauseCommasMissing(r, answer).length === 0)
}

/** Where commas fall, counted in words (after contractions are expanded): "my sister, who…" → a comma after word 2. */
function commaPlaces(t: string) {
  const tokens = base(t).replace(/[^a-z0-9', ]+/g, ' ').replace(/,/g, ' , ').split(/\s+/).filter(Boolean)
  const places: { at: number; next: string }[] = []
  let words = 0
  tokens.forEach((x, i) => { if (x === ',') places.push({ at: words, next: tokens[i + 1] ?? '' }); else words++ })
  return places
}
const relativeWords = new Set(['who', 'whom', 'which', 'whose', 'where'])
/** The commas of a non-restrictive clause in a reference (", who is a nurse," / ", which made…") that the answer leaves
 *  out. Without them it is a different sentence (all my sisters vs the one sister), so the words alone are not enough.
 *  Each is "before" (the comma before who / which) or "after" (the one closing the clause). */
export function clauseCommasMissing(ref: string, answer: string): ('before' | 'after')[] {
  const r = commaPlaces(ref)
  if (!r.some(c => relativeWords.has(c.next))) return []
  const a = new Set(commaPlaces(answer).map(c => c.at))
  const missing: ('before' | 'after')[] = []
  r.forEach((c, i) => {
    if (!relativeWords.has(c.next)) return
    if (!a.has(c.at)) missing.push('before')
    // The clause closes at the next comma, if the sentence goes on after it.
    const close = r[i + 1]
    if (close && !relativeWords.has(close.next) && !a.has(close.at)) missing.push('after')
  })
  return missing
}
/** Said when the words match a reference but the clause commas do not, so he knows why it is not counted as right. */
export function clauseCommaNote(answer: string, refs: readonly string[]): string | null {
  if (!answer.trim()) return null
  const forms = new Set(answerForms(answer))
  const same = refs.filter(r => forms.has(referenceForm(r)))
  if (!same.length || same.some(r => clauseCommasMissing(r, answer).length === 0)) return null
  const missing = clauseCommasMissing(same[0], answer)
  const where = missing.includes('before') && missing.includes('after') ? '前後兩個逗號'
    : missing.includes('before') ? 'who／which／whose／where 前面的逗號' : '補充說明結束的那個逗號'
  return '字都對，但少了' + where + '：補充說明（非限定關係子句）要用逗號隔開，拿掉逗號意思就變了（例如 my sister who is a nurse 聽起來像你有好幾個姊姊）。'
}

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
export function judgeWritten(a: { rating: 'correct' | 'minor' | 'again'; revealed: boolean; answer?: string; references: readonly string[]; firstVerdict?: Verdict; checkedText?: string }): Level | null {
  if (a.rating === 'again' || !answered(a.answer)) return null
  if (a.revealed || a.rating === 'minor') return 'assisted'
  // Fixed after Claude pointed at a problem: the feedback helped, even if the result now matches the reference.
  if (a.firstVerdict && a.firstVerdict !== 'good') return 'assisted'
  // Claude's "good" belongs to the text it checked; an answer changed afterwards is unchecked again.
  if (a.firstVerdict === 'good' && (a.checkedText === undefined || sameEnglish(a.checkedText, a.answer ?? ''))) return 'independent'
  if (matchesReference(a.answer ?? '', a.references)) return 'independent'
  return 'pending'
}
/** Whether a written answer may count toward 「穩了」: answered alone and checked (exact match or Claude's first verdict). */
export const verifiedAlone = (a: Parameters<typeof judgeWritten>[0]) => judgeWritten(a) === 'independent'
/** The variation is written first and only then compared with the answer. When Claude checked it, the same standard as
 *  every written answer applies: right on the first check → done alone; fixed after feedback, or given the answer → done with help. */
export function judgeVariation(mark: 'good' | 'small' | 'again', answer: string, en: string | readonly string[],
  check: { firstVerdict?: Verdict; checkedText?: string; revealed?: boolean; before?: string } = {}): Level | null {
  // 看答案 pressed by himself: judged on what he had written before he looked. Nothing written yet → copying is not done.
  const before = check.before
  if (before !== undefined && !answered(before)) return null
  const level = judgeWritten({ rating: mark === 'good' ? 'correct' : mark === 'small' ? 'minor' : 'again', revealed: !!check.revealed,
    answer: before ?? answer, references: typeof en === 'string' ? [en] : en, firstVerdict: check.firstVerdict, checkedText: check.checkedText })
  // Changed after looking, and what he had before did not match: the answer helped.
  if (level === 'pending' && before !== undefined && !sameEnglish(before, answer)) return 'assisted'
  return level
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
