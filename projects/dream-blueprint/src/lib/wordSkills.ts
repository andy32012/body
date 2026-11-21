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
/** Spelling check for merged entries. Accepts each listed form and nothing else:
 *  "actor/actress" → actor, actress; "sneaker(s)", "agree(ment)" → with or without the ending;
 *  "argue(argument)" → argue or argument (a whole word in brackets is another form, never glued on);
 *  "he (him, his, himself)" → any of the four. */
/** Lower case, accents removed (café → cafe), curly apostrophes straightened. */
const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
export function spellingForms(en: string) {
  const forms = new Set<string>()
  const add = (t: string) => { const v = plain(t).replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim(); if (v) forms.add(v) }
  for (const part of en.split('/')) {
    const m = part.match(/^(.*?)\s*[(（](.*?)[)）](.*)$/)
    if (!m) { add(part); continue }
    const [, head, inner, tail] = m
    add(head + tail)
    const spaced = /\s[(（]/.test(part)
    for (const piece of inner.split(/[,，、;]/)) {
      const p = piece.trim()
      if (!p) continue
      const base = head.trim().toLowerCase(), low = p.toLowerCase()
      // A separate word: written after a space, a list, or it repeats the start of the headword.
      const whole = spaced || /[,，、;]/.test(inner) || (base.length >= 3 && low.length > 3 && low.startsWith(base.slice(0, 3)))
      add(whole ? p : head + p + tail)
    }
  }
  return [...forms]
}
export function spellingMatches(answer: string, en: string) {
  const a = plain(answer).replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
  return !!a && spellingForms(en).includes(a)
}
