/** 寫作階梯：句子 → 一段 → 多段 → IELTS Task 1 → Task 2. Feedback is given against each stage's criteria. */
export interface WriteTask { id: string; prompt: string; zh: string; min: number; sample: string; chart?: { title: string; points: { label: string; value: number }[] } }
export interface WriteStage { id: string; name: string; goal: string; criteria: string[]; tasks: WriteTask[]; ielts?: boolean; minutes?: number }
export interface CriterionResult { name: string; score: number; comment: string }
export interface WriteFeedback { criteria: CriterionResult[]; band?: number; next: string; fixes: { wrong: string; right: string; why: string }[]; revised?: string; summary?: string }
export interface WriteRecord { day: string; words: number; tries: number; best?: number; last?: WriteFeedback; self?: number }
export const writeKey = (id: string) => 'write.' + id

/** Words as IELTS counts them: numbers count too (150, 37.5, 10,000). */
export const wordCount = (text: string) => (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:[.,]\d+)*/g) ?? []).length

/** Saved records from before scores were checked may hold an impossible best (e.g. band 99): it is dropped, never counted. */
export function readWrite(notes: Record<string, string>, id: string): WriteRecord | null {
  try {
    const v = notes[writeKey(id)]
    if (!v) return null
    const r = JSON.parse(v) as WriteRecord
    if (typeof r.best === 'number' && !(r.best >= 1 && r.best <= 9)) r.best = undefined
    return r
  } catch { return null }
}
/** A score Claude returns must be a real score: 1–5 for the criteria of the early stages, 1–9 (in .5 steps) for IELTS. */
export const validScore = (v: unknown, ielts: boolean): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= (ielts ? 9 : 5) && Number.isInteger(v * 2)
/** Average criterion score (1–5) or IELTS band, whichever the feedback has. */
export function scoreOf(f: WriteFeedback, ielts: boolean) {
  if (ielts && typeof f.band === 'number') return f.band
  return f.criteria.length ? f.criteria.reduce((a, c) => a + c.score, 0) / f.criteria.length : 0
}
/** A task counts as done when checked feedback reached 3.5 / 5 (or IELTS 5.5). Ticking every point yourself is 自評完成, not done. */
export function taskDone(r: WriteRecord | null, ielts: boolean) {
  return !!r && typeof r.best === 'number' && r.best >= (ielts ? 5.5 : 3.5)
}
export const selfChecked = (r: WriteRecord | null) => !!r && (r.self ?? 0) >= 1 && typeof r.best !== 'number'
/** The first stage with fewer than two tasks done by checked feedback. */
export function suggestedStage(stages: readonly WriteStage[], notes: Record<string, string>) {
  for (const s of stages) if (s.tasks.filter(t => taskDone(readWrite(notes, t.id), !!s.ielts)).length < Math.min(2, s.tasks.length)) return s.id
  return stages[stages.length - 1].id
}
/** Reads Claude's JSON. Anything that is not a usable assessment — a missing or out-of-range score (band 99, 0, "7"),
 *  a missing IELTS band, the wrong number of criteria — returns null: it is shown as a failed check and never counted. */
export function parseFeedback(text: string, criteria: readonly string[], ielts = false): WriteFeedback | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (!Array.isArray(j.criteria) || j.criteria.length !== criteria.length) return null
    if (!j.criteria.every((c: { score?: unknown }) => c && validScore(c.score, ielts))) return null
    if (ielts && !validScore(j.band, true)) return null
    const crit = j.criteria.map((c: { name?: unknown; score: number; comment?: unknown }, i: number) => ({
      name: typeof c.name === 'string' && c.name.trim() ? c.name : criteria[i], score: c.score, comment: String(c.comment ?? '') }))
    return { criteria: crit, band: ielts ? j.band : undefined, next: String(j.next ?? ''), summary: j.summary ? String(j.summary) : undefined,
      fixes: Array.isArray(j.fixes) ? j.fixes.filter((f: { wrong?: unknown; right?: unknown }) => f && typeof f.right === 'string').slice(0, 8) : [], revised: typeof j.revised === 'string' ? j.revised : undefined }
  } catch { return null }
}
