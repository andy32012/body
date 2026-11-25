import { ieltsOverall, rubricPrompt, rubrics, validRubricScore, type Rubric, type RubricId } from './rubrics'
import { openSteps, reached } from './unlock'
import { unitPackOpen } from './bridge'

/** 寫作階梯：從完整的簡單句逐步練到 IELTS。Claude grades each stage by a published table (see rubricFor). */
export interface WriteTask { id: string; prompt: string; zh: string; min: number; sample: string; chart?: { title: string; points: { label: string; value: number }[] }
  /** Bridge-unit tasks: the unit and its grammar focus, which the first criterion checks. */
  unit?: number; focus?: string }
export interface WriteStage { id: string; name: string; goal: string; criteria: string[]; tasks: WriteTask[]; ielts?: boolean; minutes?: number
  grammar?: { title: string; points: string[]; examples: { en: string; zh: string }[]; mistakes?: { bad: string; good: string; why: string }[] }
  /** Tasks that belong to the units' skills packs: opened from the pack, never the suggested stage. */
  pack?: boolean }
export interface CriterionResult { name: string; score: number; comment: string }
/** One score from the table: a required sentence, the whole piece or an IELTS criterion, with why it got that level. */
export interface ScoreLine { name: string; score: number; reason: string }
/** One of the stage's own requirements (主題句、連接詞、這一課的文法…): done or not. */
export interface CheckLine { name: string; ok: boolean; comment: string }
export interface WriteFeedback {
  /** Feedback saved before the published tables: each stage criterion scored 1–5 (IELTS 1–9). Empty in a graded check. */
  criteria: CriterionResult[]
  band?: number; next: string; fixes: { wrong: string; right: string; why: string }[]; revised?: string; summary?: string
  /** The published table this check used, its scores and the stage requirements. */
  rubric?: RubricId; scores?: ScoreLine[]; checks?: CheckLine[]
}
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
    if (typeof r.best === 'number' && !(r.best >= 0 && r.best <= 9)) r.best = undefined
    if (r.last && !(Array.isArray(r.last.criteria) && r.last.criteria.every(c => c && typeof c.name === 'string' && typeof c.score === 'number'))) r.last = undefined
    if (r.last?.scores !== undefined && !(r.last.rubric && r.last.rubric in rubrics && Array.isArray(r.last.scores) && r.last.scores.length
      && r.last.scores.every(x => x && typeof x.name === 'string' && validRubricScore(rubrics[r.last!.rubric!], x.score)))) r.last = undefined
    if (r.last && !Array.isArray(r.last.fixes)) r.last = { ...r.last, fixes: [] }
    return r
  } catch { return null }
}
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
/** The score a check is recorded with: the IELTS band, or on the early stages a 0–5 figure — the 全民英檢 level, or the
 *  share of the 單句寫作 points (5 of 6 → 4.2) — so 3.5 is the same bar everywhere (七成，初級寫作的通過標準). */
export function scoreOf(f: WriteFeedback, ielts: boolean) {
  if (f.rubric && f.scores?.length) {
    const r = rubrics[f.rubric]
    if (r.id.startsWith('ielts')) return ieltsOverall(f.scores.map(s => s.score))
    return f.scores.reduce((a, s) => a + s.score, 0) / (r.max * f.scores.length) * 5
  }
  if (ielts && typeof f.band === 'number') return f.band
  return f.criteria.length ? f.criteria.reduce((a, c) => a + c.score, 0) / f.criteria.length : 0
}
/** A task counts as done when checked feedback reached 3.5 / 5 (or IELTS 5.5): 全民英檢 4 級分, or seven tenths of the
 *  單句寫作 points. Ticking every point yourself is 自評完成, not done. */
export function taskDone(r: WriteRecord | null, ielts: boolean) {
  return !!r && typeof r.best === 'number' && r.best <= (ielts ? 9 : 5) && r.best >= (ielts ? 5.5 : 3.5)
}
export const selfChecked = (r: WriteRecord | null) => !!r && (r.self ?? 0) >= 1 && typeof r.best !== 'number'
/** Continue from the furthest stage already practised or preserved during the upgrade, so added earlier steps do not
 *  send a returning learner back to the beginning. Pack stages are opened from their unit, never suggested. */
export function suggestedStage(stages: readonly WriteStage[], notes: Record<string, string>) {
  const ladder = stages.filter(s => !s.pack)
  const from = Math.max(0, writingFrontier(ladder, notes))
  for (const s of ladder.slice(from)) if (!stageComplete(s, notes)) return s.id
  return ladder.at(-1)?.id ?? ''
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

/** The published table stays the same throughout each group of small steps; IELTS uses its own band descriptors. */
const stageRubrics: Record<string, RubricId> = {
  basic: 'gept-sentence', longer: 'gept-sentence', negq: 'gept-sentence', yesterday: 'gept-sentence', sentence: 'gept-sentence',
  steps: 'gept-paragraph', paragraph: 'gept-paragraph', opinion: 'gept-paragraph',
  multi: 'gept-essay', numbers: 'gept-essay', twosides: 'gept-essay', bridge: 'gept-essay', task1: 'ielts-task1', task2: 'ielts-task2',
}
export const rubricFor = (stage: Pick<WriteStage, 'id' | 'ielts'>): Rubric => rubrics[stageRubrics[stage.id] ?? (stage.ielts ? 'ielts-task2' : 'gept-paragraph')]

/** The sentences a 句子 task asks for, one per word the prompt names ("Use and, but, and because."). */
export function sentenceParts(task: Pick<WriteTask, 'prompt'>): string[] {
  const m = task.prompt.match(/\bUse (.+?)\.\s*$/i)
  const words = m ? m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(w => w.trim()).filter(Boolean) : []
  return words.length ? words.map(w => '用 ' + w + ' 的句子') : ['第 1 句', '第 2 句', '第 3 句']
}
/** What gets a score: each required sentence (單句寫作), the whole piece (全民英檢), or each IELTS criterion. */
export function scoredParts(stage: WriteStage, task: WriteTask): string[] {
  const r = rubricFor(stage)
  return r.id === 'gept-sentence' ? sentenceParts(task) : r.scales.map(s => s.name)
}
/** The stage's own requirements, checked done / not done beside the score. Single-sentence stages score each sentence and the
 *  IELTS stages score the four criteria, so they have none. */
export const checksFor = (stage: WriteStage, task: WriteTask): string[] => stage.ielts || rubricFor(stage).id === 'gept-sentence' ? [] : criteriaFor(stage, task)

/** Claude's instructions for one writing check: the task, the published table and the JSON to answer with. */
export function gradePrompt(stage: WriteStage, task: WriteTask, prompt: string) {
  const r = rubricFor(stage), parts = scoredParts(stage, task), checks = checksFor(stage, task)
  const kind = stage.id === 'task2' ? essayKind(task.prompt) : null
  return [
    '你是英文寫作老師，批改台灣護理系學生玄燁（英文約國中程度，目標雅思）的英文寫作。',
    '題目：' + prompt,
    ...(stage.grammar ? ['這一階教過的文法：' + stage.grammar.title + '；' + stage.grammar.points.join('；') + '。他是照這個程度寫的，不要因為沒用到更難的文法扣分；分數仍只照下面的官方評分表，不能另加要求，也不能放寬官方標準。'] : []),
    ...(kind ? ['這題是「' + essays[kind].name + '」題，回應題目要照這種題目該有的結構：' + essays[kind].outline.join('；')] : []),
    ...(task.focus ? ['這一課的文法重點：' + task.focus + '。題目要他用這些句型：有沒有用、用得對不對，算在「題目的要求」裡；沒用到就照表給分並說明要怎麼加。'] : []),
    ...(r.id === 'gept-sentence' ? ['題目要的每一句各給一個分數：先找出他寫的哪一句是那一句；沒寫到、或沒用到指定的字，那一句就是 0。'] : []),
    rubricPrompt(r, parts),
    ...(checks.length ? ['另外逐項檢查這一階的要求（不給分，只說有沒有做到）：' + checks.join('；')] : []),
    ...(r.id.startsWith('ielts') ? ['這只是練習估計，不是正式分數，寧可保守；初學者寫得很短、錯很多就照表給低分，不要為了鼓勵墊高。'] : []),
    '只輸出 JSON：{"scores":[{"name":"項目名（照上面的名稱和順序）","score":數字,"reason":"符合第幾級的哪一句描述，以及為什麼沒有到高一級"}],'
      + (checks.length ? '"checks":[{"name":"要求（照上面的名稱）","ok":true 或 false,"comment":"一句說明"}],' : '')
      + '"summary":"一句整體評語","next":"下一版最重要、只改一件事的建議","fixes":[{"wrong":"原文片段","right":"改成","why":"一句原因"}],"revised":"保留他內容的修改版全文"}',
    'fixes 最多 6 個，挑最重要的；reason、comment、why 都用口語繁體中文。',
  ].join('\n')
}

/** Which part a returned name is: the exact name; for 單句寫作 the one sentence whose word it names ("and", "用 and 的句子");
 *  otherwise the criterion it names (Task Response, Coherence & Cohesion…). -1 when it is none, or more than one. */
function matchPart(name: string, parts: readonly string[]) {
  const n = name.trim()
  const exact = parts.indexOf(n)
  if (exact >= 0) return exact
  const words = parts.map(p => p.match(/^用 (.+) 的句子$/)?.[1])
  if (words.every(Boolean)) {
    const hits = words.flatMap((w, i) => new RegExp('(^|[^a-z])' + w!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)', 'i').test(n) ? [i] : [])
    return hits.length === 1 ? hits[0] : -1
  }
  return matchCriterion(n, parts)
}

/** Reads Claude's grade against the stage's table. Anything that is not a usable grade — a score that is not on the table
 *  (band 7.5 for one criterion, 6 on a 0–5 scale, "4"), the wrong number of parts, a name that is not one of the parts or
 *  the same one twice — returns null: it is shown as a failed check and never counted. With a single part (全民英檢 scores
 *  the whole piece) or no names, parts are taken in order. The IELTS band is worked out here from the four criteria. */
export function parseGrade(text: string, rubric: Rubric, parts: readonly string[], checks: readonly string[] = []): WriteFeedback | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (!Array.isArray(j.scores) || j.scores.length !== parts.length) return null
    if (!j.scores.every((x: { score?: unknown }) => x && validRubricScore(rubric, x.score))) return null
    const named = parts.length > 1 && j.scores.some((x: { name?: unknown }) => typeof x.name === 'string' && x.name.trim())
    const order: number[] = j.scores.map((x: { name?: unknown }, i: number) => named ? matchPart(typeof x.name === 'string' ? x.name : '', parts) : i)
    if (order.some(i => i < 0) || new Set(order).size !== parts.length) return null
    const scores: ScoreLine[] = order.map((at, i) => ({ at, name: parts[at], score: j.scores[i].score as number, reason: String(j.scores[i].reason ?? '') }))
      .sort((a, b) => a.at - b.at).map(({ name, score, reason }) => ({ name, score, reason }))
    const said: { name?: unknown; ok?: unknown; comment?: unknown }[] = Array.isArray(j.checks) ? j.checks.filter((c: unknown) => c && typeof c === 'object') : []
    const checkLines = checks.flatMap((name, i): CheckLine[] => {
      const hit = said.find(c => typeof c.name === 'string' && matchCriterion(c.name, [name]) === 0) ?? (said.length === checks.length ? said[i] : undefined)
      return hit && typeof hit.ok === 'boolean' ? [{ name, ok: hit.ok, comment: String(hit.comment ?? '') }] : []
    })
    return { rubric: rubric.id, scores, checks: checkLines, criteria: [], band: rubric.id.startsWith('ielts') ? ieltsOverall(scores.map(x => x.score)) : undefined,
      next: String(j.next ?? ''), summary: j.summary ? String(j.summary) : undefined,
      fixes: Array.isArray(j.fixes) ? j.fixes.filter((f: { wrong?: unknown; right?: unknown }) => f && typeof f.right === 'string').slice(0, 8) : [],
      revised: typeof j.revised === 'string' ? j.revised : undefined }
  } catch { return null }
}

/** Tasks done in a stage before the next one opens: two (all, if a stage has fewer) — the bar that moves the suggestion on. */
export const stageTarget = (stage: WriteStage) => Math.min(2, stage.tasks.length)
const stageComplete = (stage: WriteStage, notes: Record<string, string>) =>
  stage.tasks.filter(t => taskDone(readWrite(notes, t.id), !!stage.ielts)).length >= stageTarget(stage)
/** A one-time snapshot of the old ladder's open stages. New installs store [] so later progress cannot accidentally
 *  bypass the new intermediate stages. Existing write.<id> records and all storage keys stay untouched. */
export const writingMigrationKey = 'migrate.writing-ladder-14'
const legacyStageIds = ['sentence', 'paragraph', 'multi', 'task1', 'task2']
function preservedWritingStages(stages: readonly WriteStage[], notes: Record<string, string>): string[] {
  if (notes[writingMigrationKey] !== undefined) {
    try {
      const saved: unknown = JSON.parse(notes[writingMigrationKey])
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && legacyStageIds.includes(id)) : []
    } catch { return [] }
  }
  const legacy = legacyStageIds.flatMap(id => stages.filter(s => s.id === id && !s.pack))
  if (!legacy.some(s => s.tasks.some(t => readWrite(notes, t.id) !== null))) return []
  const open = openSteps(legacy.map(s => stageComplete(s, notes)))
  return legacy.filter((_, i) => open[i]).map(s => s.id)
}
export function migrateWritingProgress(stages: readonly WriteStage[], notes: Record<string, string>): Record<string, string> {
  return notes[writingMigrationKey] !== undefined ? notes : { ...notes, [writingMigrationKey]: JSON.stringify(preservedWritingStages(stages, notes)) }
}
function writingFrontier(ladder: readonly WriteStage[], notes: Record<string, string>) {
  const preserved = new Set(preservedWritingStages(ladder, notes))
  for (let i = ladder.length - 1; i >= 0; i--) {
    const s = ladder[i]
    if (preserved.has(s.id) || s.tasks.some(t => readWrite(notes, t.id) !== null)) return i
  }
  return -1
}
/** Each stage opens after two checked passes in the preceding stage. Any recorded later stage keeps its whole prefix
 *  open, as do stages already unlocked before the extra steps were added. Bridge access still follows the course. */
export function stagesOpen(stages: readonly WriteStage[], notes: Record<string, string>, unit: number): Record<string, boolean> {
  const ladder = stages.filter(s => !s.pack)
  const frontier = writingFrontier(ladder, notes)
  const open = openSteps(ladder.map((s, i) => i < frontier || stageComplete(s, notes)))
  return Object.fromEntries([...ladder.map((s, i): [string, boolean] => [s.id, open[i]]), ...stages.filter(s => s.pack).map((s): [string, boolean] => [s.id, unitPackOpen(unit)])])
}
/** A bridge task opens with its unit; the ladder's tasks are open whenever their stage is. */
export const writeTaskOpen = (task: Pick<WriteTask, 'unit'>, unit: number) => task.unit === undefined || reached(task.unit, unit)

export interface WriteTaskPage {
  label: string
  tasks: { task: WriteTask; label: string }[]
}
/** Keep a large bank usable on a phone. Bridge pages stay within one unit; numbering never depends on task IDs.
 *  These are display-only groups: original task order, IDs, saved answers and unit locks stay unchanged. */
export function writingTaskPages(stage: WriteStage): WriteTaskPage[] {
  const groups = stage.pack
    ? [...new Set(stage.tasks.map(t => t.unit))].sort((a, b) => (a ?? 0) - (b ?? 0)).map(unit => stage.tasks.filter(t => t.unit === unit))
    : [stage.tasks]
  return groups.flatMap(tasks => {
    const prefix = stage.pack && tasks[0]?.unit !== undefined ? '單元 ' + tasks[0].unit + '・' : ''
    return Array.from({ length: Math.ceil(tasks.length / 10) }, (_, page) => {
      const start = page * 10
      return {
        label: prefix + '第 ' + (start + 1) + '–' + Math.min(start + 10, tasks.length) + ' 題',
        tasks: tasks.slice(start, start + 10).map((task, i) => ({ task, label: prefix + '題 ' + (start + i + 1) })),
      }
    })
  })
}

