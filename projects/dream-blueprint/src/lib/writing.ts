/** 寫作階梯：句子 → 一段 → 多段 → IELTS Task 1 → Task 2. Feedback is given against each stage's criteria. */
export interface WriteTask { id: string; prompt: string; zh: string; min: number; sample: string; chart?: { title: string; points: { label: string; value: number }[] }
  /** Bridge-unit tasks: the unit and its grammar focus, which the first criterion checks. */
  unit?: number; focus?: string }
export interface WriteStage { id: string; name: string; goal: string; criteria: string[]; tasks: WriteTask[]; ielts?: boolean; minutes?: number
  /** Tasks that belong to the units' skills packs: opened from the pack, never the suggested stage. */
  pack?: boolean }
export interface CriterionResult { name: string; score: number; comment: string }
export interface WriteFeedback { criteria: CriterionResult[]; band?: number; next: string; fixes: { wrong: string; right: string; why: string }[]; revised?: string; summary?: string }
export interface WriteRecord { day: string; words: number; tries: number; best?: number; last?: WriteFeedback; self?: number }
export const writeKey = (id: string) => 'write.' + id

/** Words for these exercises: letters with accents count as one word (résumé, café), so do numbers (150, 37.5, 10,000)
 *  and hyphen / apostrophe joins (well-known, don't). Punctuation alone is not a word. Close to, not the same as, an exam counter. */
export const wordCount = (text: string) => (text.match(/\p{L}+(?:['’-]\p{L}+)*|\d+(?:[.,]\d+)*/gu) ?? []).length

/** Saved records from before scores were checked may hold an impossible best (e.g. band 99) or a broken last
 *  feedback: they are dropped, never counted or shown. A best above 5 on a 1–5 stage is dropped by taskDone. */
export function readWrite(notes: Record<string, string>, id: string): WriteRecord | null {
  try {
    const v = notes[writeKey(id)]
    if (!v) return null
    const r = JSON.parse(v) as WriteRecord
    if (typeof r.best === 'number' && !(r.best >= 1 && r.best <= 9)) r.best = undefined
    if (r.last && !(Array.isArray(r.last.criteria) && r.last.criteria.every(c => c && typeof c.name === 'string' && typeof c.score === 'number'))) r.last = undefined
    if (r.last && !Array.isArray(r.last.fixes)) r.last = { ...r.last, fixes: [] }
    return r
  } catch { return null }
}
/** A score Claude returns must be a real score: a whole 1–5 for the criteria of the early stages, 1–9 in .5 steps for IELTS. */
export const validScore = (v: unknown, ielts: boolean): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= (ielts ? 9 : 5) && Number.isInteger(ielts ? v * 2 : v)
const squash = (s: string) => s.toLowerCase().replace(/[\s&＆·・,，.。]+/g, '').replace(/and/g, '')
/** Which of this stage's criteria a returned name is: the full text, its name before the colon ("Task Response"),
 *  or a clear shortening of it (主題句, 文法正確). -1 when it is none of them. */
export function matchCriterion(name: string, criteria: readonly string[]) {
  const n = squash(name)
  if (!n) return -1
  return criteria.findIndex(c => {
    const full = squash(c), head = squash(c.split(/[:：（(]/)[0])
    return n === full || n === head || (n.length >= 3 && full.startsWith(n)) || (head.length >= 3 && n.startsWith(head))
  })
}
/** Average criterion score (1–5) or IELTS band, whichever the feedback has. */
export function scoreOf(f: WriteFeedback, ielts: boolean) {
  if (ielts && typeof f.band === 'number') return f.band
  return f.criteria.length ? f.criteria.reduce((a, c) => a + c.score, 0) / f.criteria.length : 0
}
/** A task counts as done when checked feedback reached 3.5 / 5 (or IELTS 5.5). Ticking every point yourself is 自評完成, not done. */
export function taskDone(r: WriteRecord | null, ielts: boolean) {
  return !!r && typeof r.best === 'number' && r.best <= (ielts ? 9 : 5) && r.best >= (ielts ? 5.5 : 3.5)
}
export const selfChecked = (r: WriteRecord | null) => !!r && (r.self ?? 0) >= 1 && typeof r.best !== 'number'
/** The first stage with fewer than two tasks done by checked feedback. Pack stages are opened from their unit, not suggested. */
export function suggestedStage(stages: readonly WriteStage[], notes: Record<string, string>) {
  const ladder = stages.filter(s => !s.pack)
  for (const s of ladder) if (s.tasks.filter(t => taskDone(readWrite(notes, t.id), !!s.ielts)).length < Math.min(2, s.tasks.length)) return s.id
  return ladder[ladder.length - 1].id
}
/** Reads Claude's JSON. Anything that is not a usable assessment — a missing or out-of-range score (band 99, 0, "7"),
 *  the wrong number of criteria, a name that is not one of this stage's criteria or the same one twice, a missing
 *  IELTS band or one that does not follow the four criteria (all 4s with band 8) — returns null: it is shown as a
 *  failed check and never counted. Items without names are taken in the order asked. */
export function parseFeedback(text: string, criteria: readonly string[], ielts = false): WriteFeedback | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (!Array.isArray(j.criteria) || j.criteria.length !== criteria.length) return null
    if (!j.criteria.every((c: { score?: unknown }) => c && validScore(c.score, ielts))) return null
    const named = j.criteria.some((c: { name?: unknown }) => typeof c.name === 'string' && c.name.trim())
    const order: number[] = j.criteria.map((c: { name?: unknown }, i: number) => named ? matchCriterion(typeof c.name === 'string' ? c.name : '', criteria) : i)
    if (order.some(i => i < 0) || new Set(order).size !== criteria.length) return null
    const scores: number[] = j.criteria.map((c: { score: number }) => c.score)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    if (ielts && (!validScore(j.band, true) || Math.abs(j.band - mean) > 0.5)) return null
    const crit = order.map((at, i) => ({ at, name: criteria[at], score: scores[i], comment: String(j.criteria[i].comment ?? '') }))
      .sort((a, b) => a.at - b.at).map(({ name, score, comment }) => ({ name, score, comment }))
    return { criteria: crit, band: ielts ? j.band : undefined, next: String(j.next ?? ''), summary: j.summary ? String(j.summary) : undefined,
      fixes: Array.isArray(j.fixes) ? j.fixes.filter((f: { wrong?: unknown; right?: unknown }) => f && typeof f.right === 'string').slice(0, 8) : [], revised: typeof j.revised === 'string' ? j.revised : undefined }
  } catch { return null }
}
/** Task 2 questions ask for different essays: the outline, the Task Response point and Claude's check follow the question. */
export type Essay = 'discuss' | 'problem' | 'advantages' | 'extent'
export function essayKind(prompt: string): Essay | null {
  if (/discuss both views/i.test(prompt)) return 'discuss'
  if (/problems?\b/i.test(prompt) && /\b(solve|solutions?|be done)\b/i.test(prompt)) return 'problem'
  if (/\badvantages\b/i.test(prompt) && /\bdisadvantages\b/i.test(prompt)) return 'advantages'
  if (/to what extent|agree or disagree/i.test(prompt)) return 'extent'
  return null
}
export const essays: Record<Essay, { name: string; outline: string[]; response: string }> = {
  discuss: { name: '討論兩種看法＋自己的意見',
    outline: ['Introduction：改寫題目，點出兩種看法＋你的意見', 'Body 1：第一種看法為什麼有人支持＋例子', 'Body 2：第二種看法為什麼有人支持＋例子', '你的意見：寫在 Body 2 結尾或另寫一段，說清楚比較同意哪邊、為什麼', 'Conclusion：兩邊各一句＋重申你的意見'],
    response: 'Task Response：兩種看法都有討論，也清楚說出自己的意見，論點有發展' },
  problem: { name: '問題＋解決方法',
    outline: ['Introduction：改寫題目，說接下來會談問題和解決方法（這題不用表態同不同意）', 'Body 1：問題——一到兩個，說明為什麼會發生＋例子', 'Body 2：解決方法——對應上面每個問題，說誰來做、怎麼做', 'Conclusion：問題和方法各一句總結，不加新點子'],
    response: 'Task Response：問題和解決方法都有寫到、而且互相對應，論點有發展' },
  advantages: { name: '優點＋缺點',
    outline: ['Introduction：改寫題目，說接下來會比較優點和缺點（題目有問就表態）', 'Body 1：優點＋解釋＋例子', 'Body 2：缺點＋解釋＋例子', 'Conclusion：總結兩邊，題目有問就說哪邊比較多'],
    response: 'Task Response：優點和缺點都有寫到，題目要表態時立場清楚，論點有發展' },
  extent: { name: '同意到什麼程度',
    outline: ['Introduction：改寫題目＋你同意到什麼程度（完全同意／部分同意／不同意）', 'Body 1：支持你立場的第一個理由＋解釋＋例子', 'Body 2：第二個理由，或先承認對方的道理再說為什麼你仍這樣想', 'Conclusion：重申同意的程度，不加新論點'],
    response: 'Task Response：回答題目所有部分，同意的程度清楚，論點有發展' },
}
/** The criteria for this task: in Task 2 the first one follows the kind of essay the question asks for;
 *  in a bridge task it names the unit's grammar. */
export function criteriaFor(stage: WriteStage, task: WriteTask) {
  const kind = stage.id === 'task2' ? essayKind(task.prompt) : null
  if (kind) return stage.criteria.map((c, i) => i === 0 ? essays[kind].response : c)
  if (stage.pack && task.focus) return stage.criteria.map((c, i) => i === 0 ? '用到這一課的文法（' + task.focus + '），而且用對' : c)
  return stage.criteria
}
