/** Answer keys corrected after they were published (94 學測 第 49–56 題, checked against the passage and the official
 *  key). Kept apart from examReading.ts so the app's start-up (importBackup) can rescore saved picks without loading
 *  anything else. Each id's key is the whole set of answers, in question order. */
export const correctedKeys: Record<string, number[]> = { 'ex-gsat-94-3': [0, 3, 1, 0], 'ex-gsat-94-4': [1, 2, 3, 2] }

type Attempt = { day: string; correct: number; total: number }
const ratio = (a: Attempt) => a.correct / Math.max(1, a.total)
/** A saved latest attempt (exam.read.<id>) scored again from its picks; the best becomes it when it is the same attempt
 *  or now better. Records without picks for every question are left as they are. */
export function rescoreExams(notes: Record<string, string>, keys: Record<string, number[]> = correctedKeys) {
  let out = notes
  for (const [id, key] of Object.entries(keys)) {
    const name = 'exam.read.' + id
    let r: (Attempt & { picks?: unknown; best?: Attempt }) | null = null
    try { r = out[name] ? JSON.parse(out[name]) : null } catch { r = null }
    if (!r || typeof r.day !== 'string' || !Array.isArray(r.picks) || r.picks.length !== key.length) continue
    const picks = r.picks as unknown[]
    const correct = key.filter((a, i) => picks[i] === a).length
    const now: Attempt = { day: r.day, correct, total: key.length }
    const best = !r.best || r.best.day === r.day || ratio(now) > ratio(r.best) ? now : r.best
    out = { ...out, [name]: JSON.stringify({ ...r, correct, total: key.length, best }) }
  }
  return out
}
