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
export interface CaseRecord { day: string; results: StepResult[]; usedZh?: boolean; tries: number }
export const caseKey = (id: string) => 'case.' + id

export function readCase(notes: Record<string, string>, id: string): CaseRecord | null {
  try { return notes[caseKey(id)] ? JSON.parse(notes[caseKey(id)]) as CaseRecord : null } catch { return null }
}
export function saveCase(notes: Record<string, string>, id: string, day: string, results: StepResult[], usedZh: boolean) {
  const old = readCase(notes, id)
  const rec: CaseRecord = { day, results, tries: (old?.tries ?? 0) + 1, ...(usedZh ? { usedZh: true } : {}) }
  return { ...notes, [caseKey(id)]: JSON.stringify(rec) }
}
/** New cases first; then ones with a wrong step, the longest ago first; then the rest. */
export function nextScenario(all: readonly Scenario[], notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = all.filter(s => !skip.includes(s.id))
  const fresh = pool.find(s => !readCase(notes, s.id))
  if (fresh) return fresh
  const missed = pool.filter(s => readCase(notes, s.id)!.results.some(r => !r.correct))
    .sort((a, b) => readCase(notes, a.id)!.day.localeCompare(readCase(notes, b.id)!.day))
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
    if (!k.startsWith('case.')) continue
    try { const r = JSON.parse(v) as CaseRecord; if (r.day === day && r.results?.length >= 4) n++ } catch { /* skip */ }
  }
  return n
}
