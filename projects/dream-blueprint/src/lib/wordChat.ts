import type { Skill } from './wordSkills'

/** 「跟 Emma 聊這個字」: from a word card he opens a voice chat with Emma (#speaking/word-…) that knows what he is doing —
 *  which list, which drill (看懂、聽懂、說出、寫出), the word on the card and the other words of this round. */
export interface WordChat {
  en: string; zh: string
  /** The list: 單字複習 or 護理單字. */
  where: string
  part: Skill
  /** Whether he has seen the meaning already (on the review card he may not have). */
  seen: boolean
  others: string[]
}
export const partNames: Record<Skill, string> = { read: '看懂', listen: '聽懂', say: '說出', write: '寫出' }
const partEn: Record<Skill, string> = {
  read: 'seeing the English word and recalling its meaning', listen: 'hearing the word and choosing its meaning',
  say: 'seeing the Chinese meaning and saying the English word', write: 'seeing the Chinese meaning and spelling the English word',
}
const clip = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n)

/** The address of the chat; everything Emma needs travels in it, so it also works after a reload. */
export function wordChatHash(c: WordChat) {
  const data = { en: clip(c.en, 60), zh: clip(c.zh, 60), w: clip(c.where, 12), p: c.part, s: c.seen ? 1 : 0, o: c.others.map(o => clip(o, 40)).filter(o => o && o !== c.en).slice(0, 5) }
  return 'speaking/word-' + encodeURIComponent(JSON.stringify(data))
}
/** Reads the part after "word-" (still URI-encoded); anything broken gives null and the page is the ordinary chat. */
export function readWordChat(raw: string | undefined): WordChat | null {
  if (!raw) return null
  try {
    const d = JSON.parse(decodeURIComponent(raw)) as { en?: unknown; zh?: unknown; w?: unknown; p?: unknown; s?: unknown; o?: unknown }
    if (typeof d.en !== 'string' || !d.en.trim()) return null
    const part = typeof d.p === 'string' && d.p in partNames ? d.p as Skill : 'read'
    return {
      en: clip(d.en, 60), zh: typeof d.zh === 'string' ? clip(d.zh, 60) : '', where: typeof d.w === 'string' && d.w ? clip(d.w, 12) : '單字複習',
      part, seen: d.s !== 0, others: Array.isArray(d.o) ? d.o.filter((o): o is string => typeof o === 'string').map(o => clip(o, 40)).slice(0, 5) : [],
    }
  } catch { return null }
}
/** Back to the card he came from. */
export const wordChatBack = (c: WordChat) => c.where === '護理單字' ? '#library/nwords' : '#library/words' + (c.part === 'read' ? '' : '/' + c.part)

/** What Emma is told: what he was doing, the word, and how to chat around it. */
export function wordChatInstructions(c: WordChat) {
  const forms = c.en.split('/').map(f => f.trim()).filter(Boolean)
  return [
    'Right now he is reviewing vocabulary in his English app' + (c.where === '護理單字' ? ' (nursing English words)' : '') + ', doing the "' + partNames[c.part] + '" drill: ' + partEn[c.part] + '.',
    'He opened this chat from the card for the word "' + forms.join('" / "') + '"' + (c.zh ? ' (Chinese meaning: ' + c.zh + ')' : '') + '. He wants to talk about this word and practise using it.',
    c.others.length ? 'Other words in the same round, which he may also want to talk about: ' + c.others.join(', ') + '.' : '',
    c.seen ? '' : 'He may not remember the meaning yet: let him guess first, and give the meaning simply if he cannot.',
    'Start by saying in one short sentence that you see he is reviewing "' + forms[0] + '", then ask one easy question about his life or his nursing study that he can answer with this word.',
    'Keep it a friendly chat, not a test. Get him to say his own sentence with the word; if he uses it wrongly, say the right sentence once and ask him to say it again.',
    'If he asks what it means, how to use it, or about another word of the round, answer simply at his level with one short example, then go back to talking.',
    'You hear him through speech recognition, so do not comment on his pronunciation.',
    'After about six of his turns, finish with one natural example sentence with the word for him to remember.',
  ].filter(Boolean).join('\n')
}
