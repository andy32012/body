import { levelEntry } from './vocab'
/** Four ways of knowing a word. A word you can read may still be one you cannot hear, say or spell. */
export const skills = [['read', '看懂'], ['listen', '聽懂'], ['say', '說出（自評）'], ['write', '寫出']] as const
export type Skill = typeof skills[number][0]
/** 說出 has no sound check yet: the drill is self-rated and records `sayself`. `say` is kept for a real check later;
 *  older `say` entries were self-rated too, so both count as 自評. */
export type SkillRecord = Partial<Record<Skill | 'sayself', string>>
const has = (r: SkillRecord, skill: Skill) => !!(skill === 'say' ? r.say || r.sayself : r[skill])
export const skillKey = (word: string) => 'skill.' + word

export function readSkills(notes: Record<string, string>, word: string): SkillRecord {
  try { return notes[skillKey(word)] ? JSON.parse(notes[skillKey(word)]) as SkillRecord : {} } catch { return {} }
}
export function markSkill(notes: Record<string, string>, word: string, skill: Skill, day: string) {
  return { ...notes, [skillKey(word)]: JSON.stringify({ ...readSkills(notes, word), [skill === 'say' ? 'sayself' : skill]: day }) }
}
export function skillSummary(notes: Record<string, string>, words: readonly string[]) {
  const count: Record<Skill, number> = { read: 0, listen: 0, say: 0, write: 0 }
  for (const w of words) { const r = readSkills(notes, w); for (const [s] of skills) if (has(r, s)) count[s]++ }
  return count
}
/** Words still missing a skill come first. */
export function orderForSkill<T>(items: readonly T[], keyOf: (t: T) => string, notes: Record<string, string>, skill: Skill) {
  return [...items].sort((a, b) => Number(has(readSkills(notes, keyOf(a)), skill)) - Number(has(readSkills(notes, keyOf(b)), skill)))
}
/** Spelling check for merged entries. Accepts each listed form and nothing else:
 *  "actor/actress" → actor, actress; "sneaker(s)", "agree(ment)" → with or without the ending;
 *  "argue(argument)" → argue or argument (a whole word in brackets is another form, never glued on);
 *  "he (him, his, himself)" → any of the four. */
/** Lower case, accents removed (café → cafe), curly apostrophes straightened. */
const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
/** The only differences a spelling check ignores: capitals, accents, curly vs straight apostrophes, spaces around the word,
 *  and the full stops of an abbreviation (a.m. = am, Mr. = Mr, U.S. = US) — single letters between dots, or a dot at the end.
 *  A dot inside a word (snea.ker, argu.ment) is a misspelling and stays, as does any digit or symbol. */
const spelled = (t: string) => plain(t).trim().replace(/\s+/g, ' ')
  .replace(/\b([a-z])\.(?=[a-z]\.|[a-z]\b)/g, '$1').replace(/\b([a-z])\.$/, '$1').replace(/\.$/, '')
export function spellingForms(en: string) {
  const forms = new Set<string>()
  const add = (t: string) => { const v = spelled(t); if (v) forms.add(v) }
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
  // Abbreviation dots (a.m., U.S.) are ignored only for words that are written with dots: t.i.s.s.u.e is not tissue.
  if (!en.includes('.') && /[a-z]\.[a-z]/i.test(answer.trim())) return false
  const a = spelled(answer)
  return !!a && /^[a-z' -]+$/.test(a) && spellingForms(en).includes(a)
}

/** Irregular forms, so "I went yesterday" uses go and "I grew tomatoes" does not. */
const irregularTable = 'be:am,is,are,was,were,been,being;have:has,had,having;do:does,did,done,doing;go:goes,went,gone,going;'
  + 'eat:ate,eaten;drink:drank,drunk;run:ran;come:came;become:became;see:saw,seen;give:gave,given;take:took,taken;'
  + 'make:made;get:got,gotten;sleep:slept;feel:felt;fall:fell,fallen;tell:told;say:said;know:knew,known;think:thought;'
  + 'bring:brought;buy:bought;catch:caught;teach:taught;fight:fought;find:found;hold:held;keep:kept;leave:left;lose:lost;'
  + 'meet:met;pay:paid;put:put;read:read;send:sent;sit:sat;stand:stood;understand:understood;write:wrote,written;'
  + 'speak:spoke,spoken;break:broke,broken;choose:chose,chosen;drive:drove,driven;ride:rode,ridden;rise:rose,risen;'
  + 'wake:woke,woken;wear:wore,worn;win:won;begin:began,begun;sing:sang,sung;swim:swam,swum;ring:rang,rung;'
  + 'grow:grew,grown;throw:threw,thrown;blow:blew,blown;draw:drew,drawn;fly:flew,flown;show:showed,shown;'
  + 'forget:forgot,forgotten;hide:hid,hidden;bite:bit,bitten;steal:stole,stolen;spend:spent;build:built;lend:lent;'
  + 'mean:meant;hear:heard;hurt:hurt;cut:cut;hit:hit;let:let;set:set;shut:shut;cost:cost;quit:quit;spread:spread;'
  + 'lie:lay,lain,lying;lay:laid;die:dying;tie:tying;sell:sold;shoot:shot;sweep:swept;weep:wept;feed:fed;lead:led;'
  + 'light:lit;slide:slid;stick:stuck;strike:struck;swing:swung;dig:dug;hang:hung;shake:shook,shaken;forgive:forgave,forgiven;'
  + 'child:children;man:men;woman:women;foot:feet;tooth:teeth;mouse:mice;person:people;good:better,best;bad:worse,worst;'
  + 'he:him,his,himself;she:her,hers,herself;i:me,my,mine,myself;we:us,our,ours,ourselves;they:them,their,theirs,themselves'
const irregular = new Map(irregularTable.split(';').map(x => { const [k, v] = x.split(':'); return [k, v.split(',')] as const }))
/** A word with its everyday endings: plural, -ed, -ing, -er/-est, with the usual spelling changes and irregular forms. */
function inflections(word: string): string[] {
  const w = word.toLowerCase(), out = new Set([w, ...(irregular.get(w) ?? [])])
  const ends = ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly']
  for (const e of ends) out.add(w + e)
  if (/[^aeiou]y$/.test(w)) for (const e of ['ies', 'ied', 'ier', 'iest', 'ily']) out.add(w.slice(0, -1) + e)
  if (/e$/.test(w)) for (const e of ['ing', 'er', 'est', 'ed']) out.add(w.slice(0, -1) + e)
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) for (const e of ['ed', 'ing', 'er', 'est']) out.add(w + w.slice(-1) + e)
  if (/ie$/.test(w)) out.add(w.slice(0, -2) + 'ying')
  if (/(f|fe)$/.test(w)) out.add(w.replace(/fe?$/, 'ves'))
  return [...out]
}
/** Whether a sentence uses the word (or one of its listed forms), counting inflected and irregular forms. */
export function wordUsed(answer: string, en: string) {
  // Words keep their hyphen (T-shirt) and abbreviation dots (a.m., O.K.); the dots are then dropped, as in spelling.
  const tokens = (plain(answer).match(/[a-z0-9']+(?:[-.][a-z0-9']+)*\.?/g) ?? []).map(t => t.replace(/\./g, ''))
  // The spellings the word table lists (acknowledgment as well as acknowledgement) count too.
  const listed = levelEntry(en)?.forms?.flatMap(f => f.forms).map(f => spelled(f)) ?? []
  return [...new Set([...spellingForms(en), ...listed])].map(f => f.replace(/\./g, '')).some(form => {
    const words = form.split(' ').filter(Boolean)
    if (!words.length) return false
    const first = new Set(inflections(words[0]))
    if (words.length === 1) return tokens.some(t => first.has(t))
    // A phrase (look for, work from home): its first word may change, the rest follow in order.
    return tokens.some((t, i) => first.has(t) && words.slice(1).every((x, j) => tokens[i + 1 + j] === x))
  })
}
