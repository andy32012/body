import curriculum from '../data/curriculum.json'
import { daysBetween } from './progress'

/**
 * One list of weak points, shared by every teacher in the app: the Claude tutor, Emma, 問問 Claude and the reviews.
 * A weak point is named after a grammar unit of the course (or one of a few general kinds of mistake), counts how
 * often it went wrong, and keeps the latest few examples. It fades with time and shrinks when the same grammar is
 * later written right, so the list shows what is weak now, not everything that was ever wrong.
 */
export const weakKey = 'weak.v1'
export type WeakSource = 'tutor' | 'self' | 'drill' | 'speak' | 'write' | 'review' | 'gept'
export interface WeakExample { w: string; r: string; src: WeakSource }
export interface WeakItem { k: string; n: number; first: string; last: string; ex: WeakExample[] }

/** English names of the course's grammar, for Emma (her instructions are in English). Unit number → name. */
const grammarEn: Record<number, string> = {
  1: 'present of be (am/is/are)', 2: 'plural nouns and a/an', 3: 'the', 4: 'present simple and he/she/it + -s',
  5: "present simple negatives and questions (don't/doesn't, do/does)", 6: 'present continuous (am/is/are + -ing)',
  7: 'past of be (was/were)', 8: 'past simple of regular verbs (-ed)', 9: 'past simple of irregular verbs',
  10: "past simple negatives and questions (didn't, did …?)", 11: 'future (will, be going to)',
  12: 'modal verbs (can, should, must, may)', 13: 'prepositions of time and place (in/on/at)',
  14: 'countable and uncountable nouns (some/any, much/many)', 15: 'comparatives and superlatives',
  16: 'wh-questions (what/where/when/why/how)', 17: 'there is / there are, and "it" as subject',
  18: 'frequency and time expressions (always, usually, every day)', 19: 'imperatives and polite requests (Please …, Could you …?)',
  20: 'every, all, both, one, something', 21: 'and / but / so / because', 22: 'when / before / after / if clauses',
  23: 'to-infinitive and -ing forms', 24: 'past continuous (was/were + -ing)', 25: 'present perfect (have/has + past participle)',
  26: 'first conditional (If it rains, I will …)', 27: 'So do I / Neither do I, subject questions (Who called you?)',
  28: 'more prepositions (into, by, until, afraid of, wait for)', 29: 'present perfect vs past simple', 30: 'passive voice',
  31: 'relative clauses (who/which/that)', 32: 'indirect questions (Do you know where …?)', 33: 'reported speech',
  34: 'as … as, too, enough, bored/boring', 35: 'tell someone to, make/let, used to', 36: 'present perfect continuous',
  37: 'past perfect', 38: 'second conditional (If I had …, I would …)', 39: 'contrast (although, however, while)',
  40: 'cause and effect in writing (due to, as a result)', 41: 'passive with modals (must be done)',
  42: 'noun clauses (what he said, that …)', 43: 'participle phrases', 44: 'describing changes in numbers',
  45: 'giving opinions and longer answers', 46: 'articles in depth', 47: 'collocations and phrasal verbs',
  48: 'narrative tenses', 49: 'future continuous and future perfect', 50: "speculation (must / might / can't have)",
  51: 'third conditional', 52: 'wish and should have', 53: 'non-defining relative clauses',
}

/** The course's grammar names, in unit order: each unit's sentences are tagged with exactly one of them. */
export const unitLabels: { unit: number; label: string; en: string }[] = curriculum.units.map(u => ({
  unit: u.unit, label: u.days[0].grammar[0], en: grammarEn[u.unit] ?? u.title,
}))
/** Mistakes that are not about one grammar unit. */
export const generalLabels = ['用字', '拼字', '字序', '漏字或多字', '意思跑掉'] as const
const generalEn: Record<string, string> = { 用字: 'word choice', 拼字: 'spelling', 字序: 'word order', 漏字或多字: 'missing or extra words', 意思跑掉: 'meaning drifting from what he wanted to say' }
export const weakLabels = [...unitLabels.map(u => u.label), ...generalLabels]
const labelSet = new Set<string>(weakLabels)

/** The unit that teaches a label (undefined for a general label). */
export const unitOfLabel = (label: string) => unitLabels.find(u => u.label === label)?.unit
export const labelOfUnit = (unit: number) => unitLabels.find(u => u.unit === unit)?.label
export const englishLabel = (label: string) => unitLabels.find(u => u.label === label)?.en ?? generalEn[label] ?? label

const squash = (s: string) => s.toLowerCase().replace(/[\s「」『』"'“”（）()【】\[\]：:、，,。.／/]/g, '')
/** Matches what a teacher wrote to a label of the list; anything that matches nothing is dropped (returns null). */
export function normalizeLabel(raw: string, allowPrefix = true): string | null {
  const t = raw.trim().replace(/^[「『"“]+|[」』"”。.]+$/g, '').trim()
  if (!t) return null
  if (labelSet.has(t)) return t
  // "用字（weather / whether）": the name before an explanation in brackets.
  const head = t.split(/[（(]/)[0].trim()
  if (labelSet.has(head)) return head
  const s = squash(t)
  if (s.length < 2) return null
  const exact = weakLabels.find(l => squash(l) === s)
  if (exact) return exact
  // Part of a longer name ("there is／there are" for the whole unit name), when it is most of that name; a short
  // generic word such as "時態" matches nothing rather than the wrong unit ("敘事時態").
  const containing = weakLabels.filter(l => squash(l).includes(s) && s.length / squash(l).length >= 0.6).sort((a, b) => a.length - b.length)[0]
  if (containing) return containing
  if (!allowPrefix) return null
  // A name followed by more words ("用字weather"): the longest name it starts with, but "the" is not the start of "there".
  const prefix = weakLabels.filter(l => {
    const q = squash(l)
    return q.length >= 2 && s.startsWith(q) && !(/[a-z]$/.test(q) && /[a-z]/.test(s.charAt(q.length)))
  }).sort((a, b) => b.length - a.length)[0]
  return prefix ?? null
}

export function readWeak(notes: Record<string, string>): WeakItem[] {
  try {
    const list = JSON.parse(notes[weakKey] || '[]') as unknown
    if (!Array.isArray(list)) return []
    return list.filter((x): x is WeakItem => !!x && typeof x.k === 'string' && typeof x.n === 'number' && typeof x.last === 'string')
      .map(x => ({ ...x, first: typeof x.first === 'string' ? x.first : x.last, ex: Array.isArray(x.ex) ? x.ex.filter(e => e && typeof e.w === 'string' && typeof e.r === 'string') : [] }))
  } catch { return [] }
}
/** Saved notes are capped at 50,000 characters each (store.ts); the list stays well under that by dropping the
 *  examples of the weakest points first, then those points. */
function write(notes: Record<string, string>, list: WeakItem[]) {
  let kept = list
  let json = JSON.stringify(kept)
  for (let i = kept.length - 1; json.length > 30000 && i >= 0; i--) {
    kept = kept.map((item, j) => j === i ? { ...item, ex: item.ex.slice(0, 1) } : item)
    json = JSON.stringify(kept)
  }
  while (json.length > 30000 && kept.length) { kept = kept.slice(0, -1); json = JSON.stringify(kept) }
  return { ...notes, [weakKey]: json }
}

/** How weak a point is today: each miss counts, and the count halves every three weeks without a new miss. */
export function weakScore(item: WeakItem, today: string) {
  const age = Math.max(0, daysBetween(item.last, today))
  return item.n * Math.pow(0.5, age / 21)
}
const MAX_ITEMS = 30
const clip = (s: string, n = 140) => s.trim().replace(/\s+/g, ' ').slice(0, n)

/** Records a mistake. Labels outside the list are ignored, so a teacher cannot fill the list with free text. */
export function addWeak(notes: Record<string, string>, rawLabel: string, day: string, example?: { w: string; r: string }, src: WeakSource = 'tutor') {
  const k = normalizeLabel(rawLabel)
  if (!k) return notes
  const list = readWeak(notes)
  const ex = example && example.r.trim() ? [{ w: clip(example.w) || '（沒寫）', r: clip(example.r), src }] : []
  const old = list.find(i => i.k === k)
  const item: WeakItem = old
    ? { ...old, n: old.n + 1, last: day > old.last ? day : old.last, ex: [...ex, ...old.ex.filter(e => !ex.some(x => squash(x.w) === squash(e.w)))].slice(0, 3) }
    : { k, n: 1, first: day, last: day, ex }
  const rest = list.filter(i => i.k !== k)
  const next = [item, ...rest]
  if (next.length > MAX_ITEMS) next.splice(0, next.length, ...next.sort((a, b) => weakScore(b, day) - weakScore(a, day)).slice(0, MAX_ITEMS))
  return write(notes, next)
}

/** The same grammar written right on its own: the point gets one miss lighter, and goes away at zero. */
export function easeWeak(notes: Record<string, string>, rawLabel: string) {
  const k = normalizeLabel(rawLabel)
  if (!k) return notes
  const list = readWeak(notes)
  const old = list.find(i => i.k === k)
  if (!old) return notes
  return write(notes, old.n <= 1 ? list.filter(i => i.k !== k) : list.map(i => i.k === k ? { ...i, n: i.n - 1 } : i))
}

/** Deleted by the learner. A new mistake of the same kind starts it again from one. */
export function removeWeak(notes: Record<string, string>, label: string) {
  const list = readWeak(notes)
  return list.some(i => i.k === label) ? write(notes, list.filter(i => i.k !== label)) : notes
}

/** The strongest weak points now. Points that faded below half a miss are not shown. */
export function topWeak(notes: Record<string, string>, today: string, count = 5) {
  return readWeak(notes)
    .map(i => ({ ...i, score: weakScore(i, today) }))
    .filter(i => i.score >= 0.5)
    .sort((a, b) => b.score - a.score || b.last.localeCompare(a.last))
    .slice(0, count)
}

/** One line per weak point, for a Chinese prompt (the tutor, 問問 Claude, another assistant). */
export function weakLines(notes: Record<string, string>, today: string, count = 5) {
  return topWeak(notes, today, count).map(i => i.k + '（錯 ' + i.n + ' 次' + (i.ex[0] ? '，例如他寫「' + i.ex[0].w + '」，應該是「' + i.ex[0].r + '」' : '') + '）')
}
/** The same, in English, for Emma. */
export function weakLinesEn(notes: Record<string, string>, today: string, count = 5) {
  return topWeak(notes, today, count).map(i => englishLabel(i.k) + (i.ex[0] && /[a-z]/i.test(i.ex[0].w) ? ` (he said "${i.ex[0].w}", right: "${i.ex[0].r}")` : ''))
}

/** Pulls 「弱點：…」 lines out of a teacher's reply: the labels it names, and the reply without those lines. */
export function takeWeakLines(text: string) {
  const labels: string[] = []
  const clean = text.split('\n').filter(line => {
    const m = line.trim().match(/^弱點[：:]\s*(.+)$/)
    if (!m) return true
    const add = (k: string | null) => { if (k && !labels.includes(k)) labels.push(k) }
    // Two names are separated by ；. A name can contain 、 and ／ itself ("名詞單複數、a／an"), so each part is first
    // matched whole, then split at 、, and only then matched by its beginning.
    for (const part of m[1].split(/[；;，,]/)) {
      const whole = normalizeLabel(part, false)
      if (whole) { add(whole); continue }
      const subs = part.split('、').map(sub => normalizeLabel(sub)).filter((k): k is string => !!k)
      if (subs.length) subs.forEach(add)
      else add(normalizeLabel(part))
    }
    return false
  }).join('\n')
  return { labels, clean }
}

/** The list of names a teacher may use, for a prompt. */
export const weakLabelPrompt = () => '課程的文法名稱：' + unitLabels.map(u => u.label).join('、') + '。不屬於任何一課時用：' + generalLabels.join('、') + '。'
