import bookPlan from '../data/writing-book.json'
import { isTimeSeries } from './chart'
import { chapterReady, sectionDone, type BookIndex } from './grammarBook'
import { ieltsOverall, ieltsShortLimit, rubricPrompt, rubrics, validRubricScore, type Rubric, type RubricId } from './rubrics'
import { openSteps, reached } from './unlock'
import { unitPackOpen } from './bridge'

/** A Task 1 picture can show numbers, process steps or a pair of layouts. */
export interface PointChart { title: string; points: { label: string; value: number }[] }
export interface TableChart { kind: 'table'; title: string; columns: string[]; rows: { label: string; values: number[] }[] }
export interface ProcessChart { kind: 'process'; title: string; steps: string[]; cycle?: boolean }
type LayoutRow = [string, string, string]
type LayoutPanel = { label: string; rows: [LayoutRow, LayoutRow, LayoutRow] }
export interface LayoutChart { kind: 'layout'; title: string; panels: [LayoutPanel, LayoutPanel] }
export type WriteChart = PointChart | TableChart | ProcessChart | LayoutChart
export const isTableChart = (c: WriteChart): c is TableChart => 'kind' in c && c.kind === 'table'
export const isProcessChart = (c: WriteChart): c is ProcessChart => 'kind' in c && c.kind === 'process'
export const isLayoutChart = (c: WriteChart): c is LayoutChart => 'kind' in c && c.kind === 'layout'
export const layoutColumns = ['West', 'Centre', 'East'] as const
export const layoutRows = ['North', 'Middle', 'South'] as const
/** The picture as text, for Claude (who cannot see it). */
export function chartText(c: WriteChart): string {
  if (isTableChart(c)) return c.title + '（表格）\n' + ['', ...c.columns].join(' | ') + '\n' + c.rows.map(r => [r.label, ...r.values].join(' | ')).join('\n')
  if (isProcessChart(c)) return c.title + (c.cycle ? '（循環圖）：' : '（流程圖）：') +
    c.steps.map((x, i) => (i + 1) + '. ' + x).join(' → ') + (c.cycle ? ' → 回到第 1 個階段' : '')
  if (isLayoutChart(c)) return [c.title, 'Columns (left to right): ' + layoutColumns.join(' | '),
    ...c.panels.flatMap(panel => [panel.label, ...panel.rows.map((row, i) => layoutRows[i] + ': ' + row.join(' | '))])].join('\n')
  return c.title + ' ' + c.points.map(p => p.label + ' ' + p.value).join(', ')
}
/** Task 1's structure hint for each kind of picture. */
export const taskOneOutlines: Record<'trend' | 'comparison' | 'table' | 'process' | 'cycle' | 'layout', string[]> = {
  trend: ['Introduction：用自己的話改寫題目', 'Overview：Overall, …（最大的趨勢或特點，不放數字）', 'Body 1：前半段的重要數據和比較', 'Body 2：後半段的重要數據和比較'],
  comparison: ['Introduction：用自己的話說明比較哪些組別、數字的單位與調查期間', 'Overview：Overall, …（最高、最低或最明顯的差別，不放細節數字）', 'Body 1：比較差距明顯的組別，附數字', 'Body 2：把數字相近的組別一起比較，或補充另一個重要差別'],
  table: ['Introduction：說明表格比較什麼、數字單位，有標示期間也寫出來', 'Overview：比較組別時抓高低和明顯差距，有時間順序時抓主要變化', 'Body 1：用數字說明一組重要比較', 'Body 2：用數字補充另一組比較或例外'],
  process: ['Introduction：用自己的話說明這是什麼流程', 'Overview：概括從原料或起點如何走到結果，可以用總步數來組織', 'Body 1：照順序寫前半的主要步驟', 'Body 2：整理後半的主要步驟，交代圖中重要時間或數字'],
  cycle: ['Introduction：用自己的話說明圖中的循環', 'Overview：概括循環的主要階段和共同特點', 'Body 1：照圖中順序描述各階段，寫出重要時間或數字', 'Body 2：描述後續階段，交代最後如何接回循環的起始階段'],
  layout: ['Introduction：介紹兩張圖的地點及時間', 'Overview：概述改建規模及主要用途的變化', 'Body 1：按方位比較移動、移除及改作他用的設施', 'Body 2：描述新增設施及原處保留的部分，用 in the north 或 to the east of 等片語定位'],
}
export function chartKind(c: WriteChart | undefined) {
  if (!c) return null
  if (isTableChart(c)) return 'table'
  if (isProcessChart(c)) return c.cycle ? 'cycle' : 'process'
  if (isLayoutChart(c)) return 'layout'
  return isTimeSeries(c.points.map(p => p.label)) ? 'trend' : 'comparison'
}

/** 寫作階梯：從完整的簡單句逐步練到 IELTS。Claude grades each stage by a published table (see rubricFor). */
export interface WriteTask { id: string; prompt: string; zh: string; min: number; sample: string; chart?: WriteChart
  /** Bridge-unit tasks: the unit and optional grammar reference. Specific requirements are in the task. */
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
  /** Stage requirements Claude didn't answer (shown as no feedback, never guessed from their position). */
  unchecked?: string[]
  /** The text that was graded: a later draft is never shown under this check's scores. */
  answer?: string
  /** When the answer was sent, so order does not depend on which reply finishes first. */
  submittedAt?: number
}
export interface WriteRecord {
  day: string; words: number; tries: number; best?: number; last?: WriteFeedback; self?: number
  /** A compact identity for the exact draft that was self-checked. Older records only have the `self` flag. */
  selfReview?: { draft: string; at: number }
}
export const writeKey = (id: string) => 'write.' + id

const latinLetter = /(?=\p{Script=Latin})\p{L}\p{M}*/u.source
const latinRun = `(?:${latinLetter})+`
const writingToken = new RegExp(`${latinRun}(?:['’-]${latinRun})*|\\d+(?:[.,]\\d+)*`, 'gu')
/** Count Latin words (including accents, hyphens and apostrophes) and numerals, leaving Chinese notes out of the count. */
export const wordCount = (text: string) => (text.normalize('NFC').match(writingToken) ?? []).length

const str = (v: unknown) => typeof v === 'string' ? v : undefined
/** Fixes as the page can show them: text only; one without the corrected part says nothing and is left out. */
function cleanFixes(v: unknown): WriteFeedback['fixes'] {
  if (!Array.isArray(v)) return []
  return v.flatMap(f => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return []
    const x = f as Record<string, unknown>, right = str(x.right)
    return right?.trim() ? [{ wrong: str(x.wrong) ?? '', right, why: str(x.why) ?? '' }] : []
  })
}
/** The requirements' lines as the page can show them: a name, a yes / no and a comment in words. */
const cleanChecks = (v: unknown): CheckLine[] => Array.isArray(v) ? v.flatMap(c => c && typeof c === 'object' && typeof c.name === 'string' && typeof c.ok === 'boolean'
  ? [{ name: c.name, ok: c.ok, comment: str(c.comment) ?? '' }] : []) : []

function mixesZero(scores: readonly { score: number }[]) {
  return scores.some(line => line.score === 0) && scores.some(line => line.score > 0)
}

export function mixedIeltsScores(f: WriteFeedback) {
  return mixesZero(f.scores ?? f.criteria)
}

/** Enforce the printed length rule on the text actually submitted, including when restoring old feedback. */
export function applyIeltsLengthRule(f: WriteFeedback, words: number): WriteFeedback {
  if (words > ieltsShortLimit || mixedIeltsScores(f)) return f
  const lines = f.scores ?? f.criteria
  const allZero = lines.length > 0 && lines.every(line => line.score === 0)
  const band = words > 0 && !allZero ? 1 : 0
  if ((f.band ?? 0) <= band && !lines.some(line => line.score > band)) {
    return lines.length === 4 && f.band !== band ? { ...f, band } : f
  }
  const reason = band ? `原稿只有 ${words} 字。可評的英文作答若是 ${ieltsShortLimit} 字或更少，四項記為 Band 1。`
    : '原稿沒有計入字數的英文作答，這份練習估計為 0 分。'
  return { ...f, band, summary: reason,
    ...(f.scores ? { scores: f.scores.map(line => ({ ...line, score: band, reason })) }
      : { criteria: f.criteria.map(line => ({ ...line, score: band, comment: reason })) }) }
}

/** Old records only kept the highest total and the latest report. Exclude a highest
 *  score matching the incorrect total that was stored with a mixed report. New mixed
 *  reports never have a band and valid scores earned on other attempts can stay. */
function discardMixedBest(r: WriteRecord, ielts: boolean) {
  return ielts && !!r.last && typeof r.last.band === 'number' && r.best === r.last.band && mixedIeltsScores(r.last)
}

/** Normalize older grades for both display and sync, keeping any feedback the page can show. */
export function readWriteRecord(value: unknown): WriteRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const r = { ...value } as WriteRecord
  if (!(typeof r.best === 'number' && r.best >= 0 && r.best <= 9)) r.best = undefined
  if (!r.selfReview || typeof r.selfReview.draft !== 'string' || !r.selfReview.draft ||
    !Number.isSafeInteger(r.selfReview.at) || r.selfReview.at <= 0) r.selfReview = undefined
  if (r.last && !(Array.isArray(r.last.criteria) && r.last.criteria.every(c => c && typeof c.name === 'string' && typeof c.score === 'number'))) r.last = undefined
  if (r.last?.scores !== undefined && !(r.last.rubric && r.last.rubric in rubrics && Array.isArray(r.last.scores) && r.last.scores.length
    && r.last.scores.every(x => x && typeof x.name === 'string' && validRubricScore(rubrics[r.last!.rubric!], x.score)))) r.last = undefined
  if (r.last) {
    const l = r.last
    r.last = { ...l, fixes: cleanFixes(l.fixes), next: str(l.next) ?? '', summary: str(l.summary), revised: str(l.revised),
      ...(l.scores ? { scores: l.scores.map(x => ({ ...x, reason: str(x.reason) ?? '' })) } : {}),
      ...(l.checks !== undefined ? { checks: cleanChecks(l.checks) } : {}),
      ...(l.unchecked !== undefined ? { unchecked: Array.isArray(l.unchecked) ? l.unchecked.filter((x): x is string => typeof x === 'string') : [] } : {}),
      ...(l.answer !== undefined ? { answer: str(l.answer) } : {}),
      submittedAt: typeof l.submittedAt === 'number' && l.submittedAt > 0 && Number.isSafeInteger(l.submittedAt) ? l.submittedAt : undefined,
      criteria: l.criteria.map(c => ({ ...c, comment: str(c.comment) ?? '' })) }
  }
  if (r.last && (r.last.rubric === 'ielts-task1' || r.last.rubric === 'ielts-task2' || typeof r.last.band === 'number')) {
    if (mixedIeltsScores(r.last)) {
      if (discardMixedBest(r, true)) r.best = undefined
      r.last.band = undefined
    } else {
      if (r.last.band === undefined && r.last.scores?.length === 4) r.last.band = ieltsOverall(r.last.scores.map(line => line.score))
      if (r.last.answer !== undefined) {
        const before = r.last.band
        const corrected = applyIeltsLengthRule(r.last, wordCount(r.last.answer))
        // A short attempt cannot be a passing score. A best from more than one attempt lacks individual scores.
        if (r.tries === 1 && typeof before === 'number' && typeof corrected.band === 'number' &&
          corrected.band < before && before === r.best) r.best = undefined
        r.last = corrected
      }
    }
  }
  return r
}

export function readWrite(notes: Record<string, string>, id: string): WriteRecord | null {
  try {
    const v = notes[writeKey(id)]
    return v ? readWriteRecord(JSON.parse(v)) : null
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
  if (ielts && mixedIeltsScores(f)) return undefined
  if (f.rubric && f.scores?.length) {
    const r = rubrics[f.rubric]
    if (r.id.startsWith('ielts')) return ieltsOverall(f.scores.map(s => s.score))
    return f.scores.reduce((a, s) => a + s.score, 0) / (r.max * f.scores.length) * 5
  }
  if (ielts && typeof f.band === 'number') return f.band
  return f.criteria.length ? f.criteria.reduce((a, c) => a + c.score, 0) / f.criteria.length : 0
}
/** Only a valid result that meets the word target counts toward 過關. */
export function countedBest(f: WriteFeedback, ielts: boolean, words: number, task: WriteTask): number | undefined {
  return words >= task.min ? scoreOf(f, ielts) : undefined
}
/** A task counts as done when checked feedback reached 3.5 / 5 (or IELTS 5.5): 全民英檢 4 級分, or seven tenths of the
 *  單句寫作 points. Ticking every point yourself is 自評完成, not done. */
export function taskDone(r: WriteRecord | null, ielts: boolean) {
  return !!r && typeof r.best === 'number' && r.best <= (ielts ? 9 : 5) && r.best >= (ielts ? 5.5 : 3.5) && !discardMixedBest(r, ielts)
}
export const selfChecked = (r: WriteRecord | null) => !!r && (r.self ?? 0) >= 1 && typeof r.best !== 'number'
/** Continue from the furthest stage already practised or preserved during the upgrade, so added earlier steps do not
 *  send a returning learner back to the beginning. Pack stages are opened from their unit, never suggested. */
export function suggestedStage(stages: readonly WriteStage[], notes: Record<string, string>, draftedStages?: ReadonlySet<string>) {
  const ladder = stages.filter(s => !s.pack)
  const from = Math.max(0, writingFrontier(ladder, notes, draftedStages))
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
  if (stage.pack) return stage.criteria.map((c, i) => i === 0 ? '用對本題指定的句型' : c)
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
  const picture = chartKind(task.chart)
  return [
    '你是英文寫作老師，批改台灣護理系學生玄燁（英文約國中程度，目標雅思）的英文寫作。',
    '題目：' + prompt,
    ...(task.zh ? ['畫面上給他的中文要求（他照這些寫，批改也照這些看；有指定的步驟、數字或條件，漏了就在 fixes 或 next 指出是哪一項）：' + task.zh] : []),
    ...(task.min ? ['這題要求至少 ' + task.min + ' 字。字數不夠時照評分表給分，並在 next 提醒他要寫到幾個字。'] : []),
    ...(stage.grammar ? ['這一階教過的文法：' + stage.grammar.title + '；' + stage.grammar.points.join('；') + '。他是照這個程度寫的，不要因為沒用到更難的文法扣分；分數仍只照下面的官方評分表，不能另加要求，也不能放寬官方標準。'] : []),
    ...(kind ? ['這題是「' + essays[kind].name + '」題，回應題目要照這種題目該有的結構：' + essays[kind].outline.join('；')] : []),
    ...(picture === 'process' ? ['這題是直線流程圖。Task Achievement 看是否概括流程、交代主要步驟和順序，並選用圖上重要數字或時間。列出總步數只是概括的方法之一。'] : []),
    ...(picture === 'cycle' ? ['這題是循環圖。Task Achievement 看是否概括循環、描述主要階段與最後如何接回起始階段，並報告圖上重要時間或數字。沒有固定終點，也不硬性要求計算總步數。'] : []),
    ...(picture === 'table' ? ['這題是表格。Task Achievement 看有沒有挑出主要特點和重要比較。表格若比較不同組別，請看數值高低與差距。只有數字按時間排列時，才評估是否說明重要的時間變化。'] : []),
    ...(picture === 'layout' ? ['這題是地圖或平面圖。兩張圖使用相同方位。請依圖核對增加、移除、移動及留下的設施和位置，並依評分表評估總覽與選取的重點。'] : []),
    ...(picture === 'comparison' ? ['這題的長條比較不同組別。總覽找最高、最低或明顯差別，正文用數字比較組別；橫軸不是時間順序，請勿要求寫時間趨勢。'] : []),
    ...(task.focus ? ['這一課可參考的文法：' + task.focus + '。是否達成本題句型要求只按上方英中題幹判定。沒有被題幹指定的句型可用來表達，但用不到時不扣分。'] : []),
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

const wholePieceNames = new Set([
  '整篇', '整體', '全文', '全篇', '總分', '整篇評分', '整體評分', '全文評分', '全篇評分',
  '整篇分數', '整體分數', '全文分數', '全篇分數', 'overall', 'overall score', 'overall grade', 'whole piece',
])

/** Reads Claude's grade against the stage's table. Anything that is not a usable grade returns null: it is shown as a
 *  failed check and never counted. That is a score not on the table (band 7.5 for one criterion, 6 on a 0–5 scale, "4"),
 *  the wrong number of parts, a part without a name or with a name that is not one of the parts (never matched by its
 *  position), the same part twice, or a score without its reason. A whole-piece table (全民英檢 整篇) takes its usual
 *  wording (整篇、整體…) but not another table's criterion (Task Response means the wrong table was used). The
 *  stage's requirements are matched by name only; those Claude didn't answer are listed in `unchecked`. Only text is kept
 *  where the page shows words. An IELTS reply with mixed zero and positive scores keeps the feedback, with no overall band. */
export function parseGrade(text: string, rubric: Rubric, parts: readonly string[], checks: readonly string[] = []): WriteFeedback | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (!Array.isArray(j.scores) || j.scores.length !== parts.length) return null
    const lines = j.scores as { name?: unknown; score?: unknown; reason?: unknown }[]
    if (!lines.every(x => x && typeof x === 'object' && validRubricScore(rubric, x.score) && str(x.reason)?.trim() && str(x.name)?.trim())) return null
    const wholePiece = (rubric.id === 'gept-paragraph' || rubric.id === 'gept-essay') && parts.length === 1 && parts[0] === '整篇'
    const order: number[] = lines.map(x => {
      const name = str(x.name)!
      if (wholePiece) return wholePieceNames.has(name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')) ? 0 : -1
      return matchPart(name, parts)
    })
    if (order.some(i => i < 0) || new Set(order).size !== parts.length) return null
    const scores: ScoreLine[] = order.map((at, i) => ({ at, name: parts[at], score: lines[i].score as number, reason: str(lines[i].reason)! }))
      .sort((a, b) => a.at - b.at).map(({ name, score, reason }) => ({ name, score, reason }))
    const said = cleanChecks(j.checks)
    const checkLines = checks.flatMap((name): CheckLine[] => {
      const hit = said.find(c => matchCriterion(c.name, [name]) === 0)
      return hit ? [{ name, ok: hit.ok, comment: hit.comment }] : []
    })
    const unchecked = checks.filter(name => !checkLines.some(c => c.name === name))
    return { rubric: rubric.id, scores, checks: checkLines, ...(unchecked.length ? { unchecked } : {}), criteria: [],
      band: rubric.id.startsWith('ielts') && !mixesZero(scores) ? ieltsOverall(scores.map(x => x.score)) : undefined,
      next: str(j.next) ?? '', summary: str(j.summary), fixes: cleanFixes(j.fixes).slice(0, 8), revised: str(j.revised) }
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
/** The old ladder as it was before the extra steps (its 59 tasks minus the bridge), enough for the one-time snapshot,
 *  so the app's start-up does not need the whole 1,400-task bank. Records from before the change can only be these. */
const legacyTasks: Record<string, string[]> = {
  sentence: ['s1', 's2', 's3', 's4'], paragraph: ['p1', 'p2', 'p3'], multi: ['m1', 'm2', 'm3'], task1: ['t1a', 't1b'], task2: ['t2a', 't2b', 't2c'],
}
export const legacyLadder: WriteStage[] = legacyStageIds.map(id => ({
  id, name: id, goal: '', criteria: [], ...(id.startsWith('task') ? { ielts: true } : {}),
  tasks: legacyTasks[id].map(t => ({ id: t, prompt: '', zh: '', min: 0, sample: '' })),
}))
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
function writingFrontier(ladder: readonly WriteStage[], notes: Record<string, string>, draftedStages?: ReadonlySet<string>) {
  const preserved = new Set(preservedWritingStages(ladder, notes))
  for (let i = ladder.length - 1; i >= 0; i--) {
    const s = ladder[i]
    if (preserved.has(s.id) || draftedStages?.has(s.id) || stageStarted(s, notes)) return i
  }
  return -1
}
/** Each stage opens after two checked passes in the preceding stage. Any recorded later stage keeps its whole prefix
 *  open, as do stages already unlocked before the extra steps were added. Bridge access still follows the course. */
/** The 完整文法 chapters a stage uses (src/data/writing-book.json): they are learned first. */
export const stageChapters = (stageId: string): number[] => bookPlan.stages.find(s => s.stage === stageId)?.chapters ?? []
/** A chapter is learned when every one of its sections has its three drills done. */
export function chapterLeft(notes: Record<string, string>, chapter: number): number {
  const n = (bookPlan.sections as Record<string, number>)[String(chapter)] ?? 0
  let left = 0
  for (let k = 1; k <= n; k++) if (!sectionDone(notes, chapter + '-' + k)) left++
  return left
}
/** How the grammar page names a chapter (its shown number, the skipped first chapter not counted) and its title. */
export const bookChapter = (chapter: number): { label: number; title: string } => (bookPlan.chapters as Record<string, { label: number; title: string }>)[String(chapter)] ?? { label: chapter, title: '' }
/** The first section of a chapter whose drills are not done yet (where 「去讀」 goes). */
export function firstUndone(notes: Record<string, string>, chapter: number): string {
  const n = (bookPlan.sections as Record<string, number>)[String(chapter)] ?? 1
  for (let k = 1; k <= n; k++) if (!sectionDone(notes, chapter + '-' + k)) return chapter + '-' + k
  return chapter + '-1'
}
/** The ladder stages that use a chapter (the grammar page links to them). */
export const stagesUsing = (chapter: number) => bookPlan.stages.filter(s => s.chapters.includes(chapter)).map(s => ({ id: s.stage, name: s.name }))
/** The chapters of a stage still to learn, with how many sections each has left (empty: the grammar is done). */
export function bookMissing(stageId: string, notes: Record<string, string>, index?: BookIndex): { chapter: number; left: number }[] {
  return stageChapters(stageId).map(chapter => ({ chapter, left: chapterLeft(notes, chapter) }))
    .filter(c => c.left > 0 || (index && !chapterReady(index, c.chapter)))
}
/** He has written at least one task of the stage. */
export const stageStarted = (stage: WriteStage, notes: Record<string, string>) => stage.tasks.some(t => readWrite(notes, t.id) !== null)
/** Which stages are open. A ladder stage: the one before passed (step by step) and the grammar it uses learned in 完整文法
 *  first — up to the furthest stage he already wrote in, nothing is locked again. A unit pack's stage: with the unit packs. */
export function stagesOpen(stages: readonly WriteStage[], notes: Record<string, string>, unit: number,
  { index, draftedStages }: { index?: BookIndex; draftedStages?: ReadonlySet<string> } = {}): Record<string, boolean> {
  const ladder = stages.filter(s => !s.pack)
  const frontier = writingFrontier(ladder, notes, draftedStages)
  const open = openSteps(ladder.map((s, i) => i < frontier || stageComplete(s, notes)))
  const preserved = new Set(preservedWritingStages(ladder, notes))
  // Keep old unlocks and drafts usable without waiving grammar for newly inserted stages.
  const furthest = ladder.reduce((far, s, i) => stageStarted(s, notes) ? i : far, -1)
  return Object.fromEntries([...ladder.map((s, i): [string, boolean] => [s.id, open[i] && (
    i <= furthest || preserved.has(s.id) || draftedStages?.has(s.id) === true || bookMissing(s.id, notes, index).length === 0
  )]),
    ...stages.filter(s => s.pack).map((s): [string, boolean] => [s.id, unitPackOpen(unit)])])
}
/** A bridge task opens with its unit; the ladder's tasks are open whenever their stage is. */
export const writeTaskOpen = (task: Pick<WriteTask, 'unit'>, unit: number) => task.unit === undefined || reached(task.unit, unit)
/** The task to go on to after `currentId` in the same stage: the next open one never tried, then the next one not passed
 *  yet (wrapping around); null when all the other open tasks have passed. */
export function nextWritingTask(stage: WriteStage, currentId: string, notes: Record<string, string>, unit: number): WriteTask | null {
  const open = stage.tasks.filter(t => writeTaskOpen(t, unit))
  const at = open.findIndex(t => t.id === currentId)
  const order = [...open.slice(at + 1), ...open.slice(0, Math.max(0, at))]
  return order.find(t => !readWrite(notes, t.id)) ?? order.find(t => !taskDone(readWrite(notes, t.id), !!stage.ielts)) ?? null
}

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


/** 上一題／下一題 on the writing page: the open tasks of a stage in the order the list shows them (not the undone-first
 *  order of the 下一題 offered after feedback). */
export function taskNeighbors(stage: WriteStage, id: string, unit: number): { prev?: WriteTask; next?: WriteTask } {
  const order = writingTaskPages(stage).flatMap(p => p.tasks.map(t => t.task)).filter(t => writeTaskOpen(t, unit))
  const i = order.findIndex(t => t.id === id)
  return i < 0 ? {} : { prev: order[i - 1], next: order[i + 1] }
}
