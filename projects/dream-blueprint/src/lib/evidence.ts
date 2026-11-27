import { legacyRecordId } from './recordId'

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
  /** One submission, retained after the teacher's reply removes its original text. */
  attemptId?: string
  reviewedAt?: number
  /** The overall record and its sentences share the ID of the checkpoint they belong to. */
  checkpointId?: string
  /** The checkpoint's per-sentence levels. Only the overall record counts toward the unit result. */
  checkpointItems?: Record<string, Level | null>
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
  try {
    const list: unknown = JSON.parse(notes[evidenceKey(unit)] ?? '[]')
    const entries = Array.isArray(list) ? list.filter((e): e is Evidence => !!e && typeof e.day === 'string'
      && typeof e.level === 'string' && Object.hasOwn(rank, e.level) && typeof e.source === 'string'
      && Object.hasOwn(sourceNames, e.source)) : []
    // Older pending work has its text. Derive the same ID on both devices so its first check can sync.
    return mergeEvidenceRecords([], entries.map(e => !e.attemptId && typeof e.answer === 'string'
      ? { ...e, attemptId: legacyRecordId(JSON.stringify([e.day, e.source, e.item, e.answer])) }
      : e))
  } catch { return [] }
}
export const newEvidenceId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)

/** A check changes the same sample; two independently written answers to the same question keep their own IDs. */
function evidenceId(e: Evidence) {
  return e.attemptId ? 'id:' + e.attemptId : JSON.stringify([e.day, e.source, e.item])
}
const checkpointSlot = (e: Evidence, item?: string) => JSON.stringify([e.checkpointId ?? e.day, item])

function preferEvidence(previous: Evidence | undefined, next: Evidence) {
  if (!previous) return true
  const olderCheck = previous.reviewedAt ?? 0, newerCheck = next.reviewedAt ?? 0
  if (olderCheck !== newerCheck) return newerCheck > olderCheck
  return rank[next.level] > rank[previous.level] ||
    (next.level === previous.level && (!!next.wrong || !previous.wrong))
}

/** An appraisal can replace a self-mark on another copy of the same exercise. Independent exercises stay separate. */
export function mergeEvidenceRecords(older: Evidence[], newer: Evidence[]) {
  const evidence = new Map<string, Evidence>()
  for (const item of [...older, ...newer]) {
    const id = evidenceId(item)
    if (preferEvidence(evidence.get(id), item)) evidence.set(id, item)
  }
  const checked = new Map<string, Evidence>()
  for (const entry of evidence.values()) {
    if (entry.source !== 'checkpoint' || !entry.item) continue
    const slot = checkpointSlot(entry, entry.item)
    if (preferEvidence(checked.get(slot), entry)) checked.set(slot, entry)
  }
  return [...evidence.values()].map(overall => {
    if (overall.source !== 'checkpoint' || overall.item || !overall.checkpointItems) return overall
    const checklist = { ...overall.checkpointItems }
    for (const question of Object.keys(checklist)) {
      const reviewed = checked.get(checkpointSlot(overall, question))
      if (reviewed) checklist[question] = reviewed.wrong ? null : reviewed.level
    }
    const level = judgeCheckpoint(Object.values(checklist))
    return { ...overall, checkpointItems: checklist, level: level ?? 'pending',
      wrong: level ? undefined : '還沒有足夠確認的作答' }
  })
}
export function addEvidence(notes: Record<string, string>, unit: number, ev: Evidence) {
  const entry = { ...ev, attemptId: ev.attemptId ?? newEvidenceId() }
  const list = mergeEvidenceRecords(readEvidence(notes, unit), [entry])
  return { ...notes, [evidenceKey(unit)]: JSON.stringify(list.slice(-40)) }
}
export function setEvidenceLevel(notes: Record<string, string>, unit: number, index: number, level: Level) {
  const list = readEvidence(notes, unit)
  if (!list[index]) return notes
  list[index] = { ...list[index], level, answer: undefined, prompt: undefined, ref: undefined, wrong: undefined,
    reviewedAt: Math.max(Date.now(), (list[index].reviewedAt ?? 0) + 1) }
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
export type PendingRef = Pick<Evidence, 'day' | 'source' | 'item' | 'answer' | 'attemptId' | 'reviewedAt' | 'wrong'>
export const pendingRef = (e: Evidence): PendingRef => ({
  day: e.day, source: e.source, item: e.item, answer: e.answer, attemptId: e.attemptId,
  reviewedAt: e.reviewedAt, wrong: e.wrong,
})
export const pendingReviewId = (unit: number, ref: PendingRef) => legacyRecordId(JSON.stringify([
  unit, ref.attemptId ?? [ref.day, ref.source, ref.item], ref.answer, ref.reviewedAt, ref.wrong,
]))
function samePendingAnswer(e: Evidence, ref: PendingRef) {
  return e.level === 'pending' && e.answer === ref.answer && e.reviewedAt === ref.reviewedAt && e.wrong === ref.wrong &&
    (ref.attemptId ? e.attemptId === ref.attemptId : e.day === ref.day && e.source === ref.source && e.item === ref.item)
}
export const stillPending = (notes: Record<string, string>, unit: number, ref: PendingRef) =>
  readEvidence(notes, unit).some(e => samePendingAnswer(e, ref))
/** A 待確認 answer after Claude's check. Right the first time → done alone; right after a rewrite (it was wrong before)
 *  → done with help. Wrong → still not done, with the reason, the question and his answer kept so he can rewrite it.
 *  Unclear → nothing changes. The check lands on the answer it was sent for, found by its item and answer (the list may
 *  have moved while Claude was answering); if that answer is gone or was changed meanwhile, nothing changes. */
export function checkPending(notes: Record<string, string>, unit: number, ref: PendingRef, reply: string, rewrite?: string) {
  const verdict = teacherVerdict(reply)
  const list = readEvidence(notes, unit)
  const index = list.findIndex(e => samePendingAnswer(e, ref))
  const e = list[index]
  if (!e || verdict === 'unclear') return notes
  const reviewedAt = Math.max(Date.now(), (e.reviewedAt ?? 0) + 1)
  if (verdict === 'right') {
    list[index] = { ...e, level: e.wrong || rewrite !== undefined ? 'assisted' : 'independent', answer: undefined, prompt: undefined, ref: undefined, wrong: undefined, reviewedAt }
  } else {
    list[index] = { ...e, level: 'pending', wrong: teacherReason(reply) || '還要再改', reviewedAt,
      ...(rewrite !== undefined ? { answer: rewrite } : {}) }
  }
  return { ...notes, [evidenceKey(unit)]: JSON.stringify(mergeEvidenceRecords([], list)) }
}
export function unitsWithEvidence(notes: Record<string, string>) {
  return Object.keys(notes).filter(k => k.startsWith('evidence.')).map(k => Number(k.slice(9))).filter(n => n > 0).sort((a, b) => a - b)
}
export function bestLevel(list: readonly Evidence[], skill: 'write' | 'listen' = 'write'): Level | null {
  // An answer Claude said is wrong shows nothing yet, not even 自評完成.
  const own = list.filter(e => e.skill === skill && !e.wrong && (e.source !== 'checkpoint' || !e.item))
  return own.length ? own.reduce((a, e) => rank[e.level] > rank[a] ? e.level : a, own[0].level) : null
}

// Contractions with only one reading are always expanded.
const contractions: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'], [/\byou're\b/g, 'you are'], [/\bwe're\b/g, 'we are'], [/\bthey're\b/g, 'they are'],
  [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\b(\w+)n't\b/g, '$1 not'],
  [/\b(i|you|we|they|he|she|it|there|that)'ll\b/g, '$1 will'], [/\b(i|you|we|they|who|there)'ve\b/g, '$1 have'], [/\bcan not\b/g, 'cannot'],
]
// Keep attached single quotes when expanding 's and 'd. Possessives like "the nurse's" stay as written.
const sSubject = /^('*(?:it|that|he|she|there|what|where|who|here))'s('*)$/
const dSubject = /^('*(?:i|you|we|they|he|she|it|there))'d('*)$/
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
const isParticiple = (w: string) => !adjectives.has(w) && (participles.has(w) || /ed$/.test(w))
function base(t: string) {
  let s = t.toLowerCase().replace(/[’‘]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [re, to] of contractions) s = s.replace(re, to)
  return s
}
/** A contraction occupies the same two word positions in either reading. Store the alternate verb at its position
 *  so comparison can try it directly. Commas use these same positions, after every contraction has been expanded. */
function englishForm(text: string) {
  const tokens = base(text).replace(/，/g, ',').match(/[a-z0-9']+|,/g) ?? []
  const following = new Array<string>(tokens.length)
  let next = ''
  for (let i = tokens.length - 1; i >= 0; i--) {
    following[i] = next
    if (tokens[i] !== ',' && !adverbs.has(tokens[i])) next = tokens[i]
  }
  const words: string[] = []
  const alternateVerbs = new Map<number, string>()
  const commas: number[] = []
  for (const [i, token] of tokens.entries()) {
    if (token === ',') {
      commas.push(words.length)
      continue
    }
    const shortS = token.match(sSubject)
    const contraction = shortS ?? token.match(dSubject)
    if (!contraction) {
      words.push(token)
      continue
    }
    const [first, second] = shortS ? ['is', 'has'] : ['would', 'had']
    const inferred = isParticiple(following[i]) || (!shortS && following[i] === 'better')
    const [, subject, quotes] = contraction
    alternateVerbs.set(words.length + 1, (inferred ? first : second) + quotes)
    words.push(subject, (inferred ? second : first) + quotes)
  }
  return { words, alternateVerbs, commas }
}
type EnglishForm = ReturnType<typeof englishForm>

function wordMatches(answer: EnglishForm, position: number, reference: string) {
  return answer.words[position] === reference || answer.alternateVerbs.get(position) === reference
}
const wordsMatch = (ref: EnglishForm, answer: EnglishForm) =>
  ref.words.length === answer.words.length && ref.words.every((word, i) => wordMatches(answer, i, word))

/** The form used to compare and show word differences. */
export function normalizeEnglish(t: string) {
  return englishForm(t).words.join(' ')
}
/** Whether an answer is still the text that was checked (by Claude, or before the answer was shown). Case, spacing,
 *  curly quotes, contractions and how a statement ends (. or !) may differ; every other mark counts: taking the commas
 *  out of "My sister, who is a nurse, lives in Taipei." changes what it says, and so does turning a question into a
 *  statement, so the earlier check no longer applies. (Matching an answer with the reference is looser: normalizeEnglish.) */
const checkedForm = (t: string) => base(t).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim().replace(/[.!]+$/, '').trim()
export const sameEnglish = (a: string, b: string) => checkedForm(a) === checkedForm(b)
export function matchesReference(answer: string, refs: readonly string[], requireSameCommas = false) {
  if (!answer.trim()) return false
  const form = englishForm(answer)
  return matchingReferences(form, refs).some(ref => requireSameCommas
    ? ref.commas.length === form.commas.length && ref.commas.every((position, i) => position === form.commas[i])
    : missingCommas(ref, form).length === 0 && !addedClauseComma(ref, form))
}

const relativeWords = new Set(['who', 'whom', 'which', 'whose', 'where'])
const relativePrepositions = new Set(['about', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'through', 'to', 'with'])
function clauseStartsAt(words: string[], at: number) {
  return relativeWords.has(words[at]) ||
    (relativePrepositions.has(words[at]) && (words[at + 1] === 'which' || words[at + 1] === 'whom'))
}
/** A comma inserted at a relative clause's start changes which person or thing the reference specifies. */
function addedClauseComma(ref: EnglishForm, answer: EnglishForm) {
  return answer.commas.some(at => at > 0 && !ref.commas.includes(at) && (clauseStartsAt(ref.words, at) || ref.words[at] === 'that'))
}
/** The commas of a non-restrictive clause in a reference (", who is a nurse," / ", which made…") that the answer leaves
 *  out. Without them it is a different sentence (all my sisters vs the one sister), so the words alone are not enough.
 *  Each is "before" (the comma before who / which) or "after" (the one closing the clause). */
export function clauseCommasMissing(ref: string, answer: string): ('before' | 'after')[] {
  return missingCommas(englishForm(ref), englishForm(answer))
}
function missingCommas(ref: EnglishForm, answer: EnglishForm): ('before' | 'after')[] {
  const present = new Set(answer.commas)
  const missing: ('before' | 'after')[] = []
  ref.commas.forEach((at, i) => {
    if (!clauseStartsAt(ref.words, at)) return
    if (!present.has(at)) missing.push('before')
    // The clause closes at the next comma, if the sentence goes on after it.
    const close = ref.commas[i + 1]
    if (close !== undefined && !clauseStartsAt(ref.words, close) && !present.has(close)) missing.push('after')
  })
  return missing
}
function matchingReferences(answer: EnglishForm, refs: readonly string[]) {
  return refs.map(englishForm).filter(ref => wordsMatch(ref, answer))
}
/** Said when the words match a reference but the clause commas do not, so he knows why it is not counted as right. */
export function clauseCommaNote(answer: string, refs: readonly string[]): string | null {
  if (!answer.trim()) return null
  const form = englishForm(answer)
  const matching = matchingReferences(form, refs)
    .map(ref => ({ missing: missingCommas(ref, form), added: addedClauseComma(ref, form) }))
  if (!matching.length || matching.some(issue => issue.missing.length === 0 && !issue.added)) return null
  const [{ missing, added }] = matching
  if (added) return '字都對，但關係子句前多了逗號。這裡要靠子句指出是哪個人或哪件事，拿掉把子句隔開的逗號。'
  const where = missing.includes('before') && missing.includes('after') ? '前後兩個逗號'
    : missing.includes('before') ? '關係詞前面的逗號' : '補充說明結束的那個逗號'
  return '字都對，但少了' + where + '：補充說明（非限定關係子句）要用逗號隔開，拿掉逗號意思就變了（例如 my sister who is a nurse 聽起來像你有好幾個姊姊）。'
}

/** Word-by-word comparison with the closest reference, shown only after the reference itself is open:
 *  `extra` words are not in that reference, `missing` are reference words the answer does not have.
 *  A different wording can still be right — this only points at where to look. */
export function compareWithReference(answer: string, refs: readonly string[]) {
  const form = englishForm(answer)
  const a = form.words
  let best: { ref: string; words: { w: string; extra: boolean }[]; missing: string[]; score: number } | null = null
  for (const ref of refs) {
    const reference = englishForm(ref)
    const r = reference.words
    if (wordsMatch(reference, form)) return { ref, words: r.map(w => ({ w, extra: false })), missing: [], same: true }
    // Longest common subsequence of words.
    const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(r.length + 1).fill(0))
    for (let i = a.length - 1; i >= 0; i--) for (let j = r.length - 1; j >= 0; j--)
      dp[i][j] = wordMatches(form, i, r[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    const keepA = new Map<number, string>(), keepR = new Set<number>()
    for (let i = 0, j = 0; i < a.length && j < r.length;) {
      if (wordMatches(form, i, r[j])) { keepA.set(i, r[j]); keepR.add(j); i++; j++ }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++
      else j++
    }
    const missing = r.filter((_, j) => !keepR.has(j))
    const score = a.length - keepA.size + missing.length
    if (!best || score < best.score) {
      const words = a.map((word, i) => ({ w: keepA.get(i) ?? word, extra: !keepA.has(i) }))
      best = { ref, words, missing, score }
    }
  }
  return best ? { ref: best.ref, words: best.words, missing: best.missing, same: false } : null
}

/** Nothing written is 「未作答」: it leaves no evidence, whichever button was pressed. */
export const answered = (answer?: string) => !!answer?.trim()

/** One standard for every place an answer is written — the lesson, the checkpoint, recall, review and redo:
 *  nothing written → 未作答 (null); hints or the answer seen → 有提示完成; Claude's first check or an exact match → 當次獨立完成;
 *  a self-marked "correct" with neither → 自評完成・待確認. 「不會」 leaves no evidence. 「穩了」 needs 當次獨立完成 later, on another item. */
export function judgeWritten(a: { rating: 'correct' | 'minor' | 'again'; revealed: boolean; answer?: string; references: readonly string[]; firstVerdict?: Verdict; checkedText?: string }): Level | null {
  if (a.rating === 'again' || !answered(a.answer)) return null
  if (a.rating === 'correct' && clauseCommaNote(a.answer ?? '', a.references)) return 'pending'
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
