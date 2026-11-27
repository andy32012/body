import { newCard, type ReviewCard } from './progress'

/** A sentence the learner got wrong somewhere (Emma, a passage, a lesson), saved as a translation review card. */
export interface SayCard {
  zh: string
  en: string
  wrong?: string
  why?: string
  from?: 'emma' | 'passage' | 'lesson' | 'gept'
  /** The weak point this mistake belongs to (a name from weakPoints.ts), so reviewing the card counts for it. */
  tag?: string
}
export const sayKey = (id: string) => 'say.' + id
const sources = { emma: '口說錯句', passage: '短文錯句', lesson: '課堂錯句', gept: '英檢口說錯句' } as const

export function readSayCard(value: string): SayCard | null {
  try {
    const d = JSON.parse(value) as SayCard
    return typeof d.zh === 'string' && typeof d.en === 'string' && d.zh.trim() && d.en.trim() ? d : null
  } catch { return null }
}

/** The same sentence however it is capitalised or punctuated, with its words and numbers kept apart: "Take 5 mg." and
 *  "Take 50 mg." (or room 12 and room 120) are two cards; "take 5 mg" is the first one again. */
export function sayIdentity(t: string) {
  return t.toLowerCase().replace(/[\u2018\u2019`]/g, "'")
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d)\.(?=\d)/g, '$1point')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
const squash = sayIdentity
/** The note key of the saved card with this English, if there is one. */
function sayNoteOf(notes: Record<string, string>, en: string) {
  return Object.keys(notes).find(k => k.startsWith('say.') && squash(readSayCard(notes[k])?.en ?? '') === squash(en))
}
export const hasSayCard = (notes: Record<string, string>, en: string) => !!sayNoteOf(notes, en)

/** Adds the card (stored in notes, scheduled like every other card). The same English is never added twice. */
export function addSayCard<S extends { notes: Record<string, string>; cards: ReviewCard[] }>(prev: S, card: SayCard, day: string, salt = ''): S {
  if (sayNoteOf(prev.notes, card.en)) return prev
  const base = 'say-' + Date.now().toString(36) + salt
  let id = base
  for (let n = 1; prev.notes[sayKey(id)] !== undefined; n++) id = base + '-' + n
  return { ...prev, notes: { ...prev.notes, [sayKey(id)]: JSON.stringify(card) }, cards: [...prev.cards, newCard(id, day)] }
}

export function addSayCards<S extends { notes: Record<string, string>; cards: ReviewCard[] }>(state: S, cards: SayCard[], day: string, from?: SayCard['from']): S {
  return cards.reduce((prev, card) => addSayCard(prev, from ? { ...card, from } : card, day), state)
}

/** Takes a saved card out again (its note and its review card), e.g. a correction that came from a misheard word. */
export function removeSayCard<S extends { notes: Record<string, string>; cards: ReviewCard[] }>(prev: S, en: string, ownedId?: string): S {
  const key = ownedId === undefined ? sayNoteOf(prev.notes, en) : sayKey(ownedId)
  if (!key) return prev
  if (ownedId !== undefined) {
    const stored = readSayCard(prev.notes[key] ?? '')
    if (!stored || sayIdentity(stored.en) !== sayIdentity(en)) return prev
  }
  const notes = { ...prev.notes }
  delete notes[key]
  const id = key.slice('say.'.length)
  return { ...prev, notes, cards: prev.cards.filter(c => c.id !== id) }
}

/** How a saved card shows up in the translation drill. */
export function sayCardSentence(id: string, d: SayCard) {
  const from = d.from ?? 'emma'
  const where = from === 'emma' ? '你在口說時說成：' : from === 'gept' ? '你在英檢口說練習說成：' : from === 'passage' ? '你在短文裡寫成：' : '你在課堂上寫成：'
  return {
    id, zh: d.zh, grammar: d.tag ? [sources[from], d.tag] : [sources[from]],
    hints: [d.why || (from === 'emma' ? '想想 Emma 當時怎麼幫你改的' : from === 'gept' ? '想想練習後的回饋怎麼改的' : '想想批改時改了哪裡'), '開頭：' + d.en.split(' ')[0] + ' …'],
    reference: [d.en],
    why: (d.wrong ? where + d.wrong + '。' : '') + (d.why || ''),
    newWords: [] as { en: string; zh: string }[],
  }
}

/** The sentence-level card a correction turns into. Without the sentence, the fragment itself becomes a "fix this" card. */
export function fixToCard(f: { wrong?: string; right?: string; why?: string; zh?: string; en?: string; tag?: string }, from: SayCard['from'] = 'passage'): SayCard | null {
  const tag = typeof f.tag === 'string' && f.tag.trim() ? { tag: f.tag.trim() } : {}
  if (f.zh?.trim() && f.en?.trim()) return { zh: f.zh.trim(), en: f.en.trim(), wrong: f.wrong, why: f.why, from, ...tag }
  if (f.wrong?.trim() && f.right?.trim()) return { zh: '把這段英文改對：' + f.wrong.trim(), en: f.right.trim(), wrong: f.wrong, why: f.why, from, ...tag }
  return null
}
