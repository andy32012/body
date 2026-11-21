/** 寫作階梯：句子 → 一段 → 多段 → IELTS Task 1 → Task 2. Feedback is given against each stage's criteria. */
export interface WriteTask { id: string; prompt: string; zh: string; min: number; sample: string; chart?: { title: string; points: { label: string; value: number }[] } }
export interface WriteStage { id: string; name: string; goal: string; criteria: string[]; tasks: WriteTask[]; ielts?: boolean; minutes?: number }
export interface CriterionResult { name: string; score: number; comment: string }
export interface WriteFeedback { criteria: CriterionResult[]; band?: number; next: string; fixes: { wrong: string; right: string; why: string }[]; revised?: string; summary?: string }
export interface WriteRecord { day: string; words: number; tries: number; best?: number; last?: WriteFeedback; self?: number }
export const writeKey = (id: string) => 'write.' + id

export const wordCount = (text: string) => (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length

export function readWrite(notes: Record<string, string>, id: string): WriteRecord | null {
  try { const v = notes[writeKey(id)]; return v ? JSON.parse(v) as WriteRecord : null } catch { return null }
}
/** Average criterion score (1–5) or IELTS band, whichever the feedback has. */
export function scoreOf(f: WriteFeedback, ielts: boolean) {
  if (ielts && typeof f.band === 'number') return f.band
  return f.criteria.length ? f.criteria.reduce((a, c) => a + c.score, 0) / f.criteria.length : 0
}
/** A task counts as done when its feedback reached 3.5 / 5 (or band 5.5), or when checked by yourself on every point. */
export function taskDone(r: WriteRecord | null, ielts: boolean) {
  if (!r) return false
  if (typeof r.best === 'number') return r.best >= (ielts ? 5.5 : 3.5)
  return (r.self ?? 0) >= 1
}
export function suggestedStage(stages: readonly WriteStage[], notes: Record<string, string>) {
  for (const s of stages) if (s.tasks.filter(t => taskDone(readWrite(notes, t.id), !!s.ielts)).length < Math.min(2, s.tasks.length)) return s.id
  return stages[stages.length - 1].id
}
export function parseFeedback(text: string, criteria: readonly string[]): WriteFeedback | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (!Array.isArray(j.criteria) || !j.criteria.length) return null
    const crit = j.criteria.slice(0, criteria.length).map((c: { name?: unknown; score?: unknown; comment?: unknown }, i: number) => ({
      name: typeof c.name === 'string' ? c.name : criteria[i], score: Math.max(0, Math.min(9, Number(c.score) || 0)), comment: String(c.comment ?? '') }))
    return { criteria: crit, band: typeof j.band === 'number' ? j.band : undefined, next: String(j.next ?? ''), summary: j.summary ? String(j.summary) : undefined,
      fixes: Array.isArray(j.fixes) ? j.fixes.filter((f: { wrong?: unknown; right?: unknown }) => f && typeof f.right === 'string').slice(0, 8) : [], revised: typeof j.revised === 'string' ? j.revised : undefined }
  } catch { return null }
}
