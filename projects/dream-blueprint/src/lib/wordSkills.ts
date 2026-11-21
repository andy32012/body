/** Four ways of knowing a word. A word you can read may still be one you cannot hear, say or spell. */
export const skills = [['read', '看懂'], ['listen', '聽懂'], ['say', '說出'], ['write', '寫出']] as const
export type Skill = typeof skills[number][0]
export type SkillRecord = Partial<Record<Skill, string>>
export const skillKey = (word: string) => 'skill.' + word

export function readSkills(notes: Record<string, string>, word: string): SkillRecord {
  try { return notes[skillKey(word)] ? JSON.parse(notes[skillKey(word)]) as SkillRecord : {} } catch { return {} }
}
export function markSkill(notes: Record<string, string>, word: string, skill: Skill, day: string) {
  return { ...notes, [skillKey(word)]: JSON.stringify({ ...readSkills(notes, word), [skill]: day }) }
}
export function skillSummary(notes: Record<string, string>, words: readonly string[]) {
  const count: Record<Skill, number> = { read: 0, listen: 0, say: 0, write: 0 }
  for (const w of words) { const r = readSkills(notes, w); for (const [s] of skills) if (r[s]) count[s]++ }
  return count
}
/** Words still missing a skill come first. */
export function orderForSkill<T>(items: readonly T[], keyOf: (t: T) => string, notes: Record<string, string>, skill: Skill) {
  return [...items].sort((a, b) => Number(!!readSkills(notes, keyOf(a))[skill]) - Number(!!readSkills(notes, keyOf(b))[skill]))
}
/** Spelling check that accepts "actor/actress" alternatives and "agree(ment)" with or without the ending. */
export function spellingMatches(answer: string, en: string) {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
  const a = norm(answer)
  if (!a) return false
  const forms = en.split('/').flatMap(f => {
    const m = f.match(/^(.*)\((.*)\)(.*)$/)
    return m ? [m[1] + m[3], m[1] + m[2] + m[3]] : [f]
  })
  return forms.some(f => norm(f) === a)
}
