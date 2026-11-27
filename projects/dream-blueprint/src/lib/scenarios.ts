/** Small clinical-judgment cases in four steps (like the NCLEX model): cues → problem → first action → evaluate.
 *  A wrong step asks why, so "I didn't understand the English" is kept apart from "I didn't know the nursing". */
export type StepKind = 'cues' | 'problem' | 'action' | 'evaluate'
/** whyOptions: one line per option saying why it is right or wrong. */
export interface CaseStep { kind: StepKind; q: string; options: string[]; answer: number; why: string; whyOptions?: string[] }
/** sources: public references the case follows; review: 'self' = written for this site, not yet checked by a clinical nurse. */
export interface Scenario { id: string; topic: string; case: string; caseZh: string; steps: CaseStep[]
  sources?: { title: string; url: string }[]; subjects?: string[]; updated?: string; review?: 'self' | 'reviewed' }
export const stepNames: Record<StepKind, string> = { cues: '看線索', problem: '判斷問題', action: '先做什麼', evaluate: '評估結果' }
export const caseCauses = ['看不懂英文', '護理觀念不熟', '不知道先處理哪個', '看漏條件']
export interface StepResult { kind: StepKind; correct: boolean; cause?: string }
export interface CaseRecord { day: string; results: StepResult[]; usedZh?: boolean; tries: number; completedAt?: number }
export const caseKey = (id: string) => 'case.' + id
export const isCaseResultKey = (key: string) => key !== caseKey('progress') && /^case\.[\w-]+$/.test(key)

function parseCase(raw: string | undefined): CaseRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Partial<CaseRecord>
    return typeof record.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.day) && Array.isArray(record.results) && record.results.length > 0 &&
      record.results.every(result => result && Object.hasOwn(stepNames, result.kind) && typeof result.correct === 'boolean') ? record as CaseRecord : null
  } catch { return null }
}

export function readCase(notes: Record<string, string>, id: string): CaseRecord | null {
  return parseCase(notes[caseKey(id)])
}
export function saveCase(notes: Record<string, string>, id: string, day: string, results: StepResult[], usedZh: boolean) {
  const old = readCase(notes, id)
  const rec: CaseRecord = { day, results, tries: triesOf(old) + 1, completedAt: Date.now(), ...(usedZh ? { usedZh: true } : {}) }
  return { ...notes, [caseKey(id)]: JSON.stringify(rec) }
}

const triesOf = (record: CaseRecord | null) => typeof record?.tries === 'number' && Number.isFinite(record.tries) ? record.tries : 0
const completionTime = (record: CaseRecord) => Number.isFinite(record.completedAt) ? record.completedAt ?? 0 : 0

/** An unrelated save on another device cannot make its older case result the latest attempt. */
export function mergeCaseRecords(older: string, newer: string) {
  const before = parseCase(older), after = parseCase(newer)
  if (!before) return newer
  if (!after) return older
  const earlierTime = completionTime(before), laterTime = completionTime(after)
  const triesOrder = triesOf(before) - triesOf(after)
  const order = before.day.localeCompare(after.day) || (earlierTime && laterTime
    ? earlierTime - laterTime || triesOrder : triesOrder || earlierTime - laterTime)
  const record = order > 0 ? before : after
  const tries = Math.max(triesOf(before), triesOf(after))
  if (record.tries === tries) return order > 0 ? older : newer
  return JSON.stringify({ ...record, tries })
}

/** New cases first; then ones with a wrong step, the longest ago first; then the rest. When every case was skipped
 *  (a subject with one case, done just now), the skips are ignored: the same case can be done again. */
export function nextScenario(all: readonly Scenario[], notes: Record<string, string>, skip: readonly string[] = []): Scenario | undefined {
  const left = all.filter(s => !skip.includes(s.id))
  const pool = left.length ? left : all
  const fresh = pool.find(s => !readCase(notes, s.id))
  if (fresh) return fresh
  const missed = pool.filter(s => readCase(notes, s.id)!.results.some(r => !r.correct))
    .sort((a, b) => {
      const first = readCase(notes, a.id)!, second = readCase(notes, b.id)!
      return first.day.localeCompare(second.day) || completionTime(first) - completionTime(second)
    })
  return missed[0] ?? pool[0]
}
export function causeSummary(all: readonly Scenario[], notes: Record<string, string>) {
  const count: Record<string, number> = {}
  let done = 0
  for (const s of all) {
    const r = readCase(notes, s.id)
    if (!r) continue
    done++
    for (const x of r.results) if (x.cause) count[x.cause] = (count[x.cause] ?? 0) + 1
  }
  return { done, total: all.length, count }
}

/** Cases finished (all four steps answered) on a day. */
export function casesFinishedOn(notes: Record<string, string>, day: string) {
  let n = 0
  for (const [k, v] of Object.entries(notes)) {
    if (!isCaseResultKey(k)) continue
    const record = parseCase(v)
    if (record?.day === day && record.results.length >= 4) n++
  }
  return n
}
