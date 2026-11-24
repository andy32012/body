import { weakLabelPrompt } from './weakPoints'
import { rubricPrompt, rubrics, type RubricId } from './rubrics'

/**
 * 全民英檢口說練習. The formats follow LTTC's published descriptions (中級: 朗讀短文 2 篇、回答問題 10 題、看圖敘述;
 * 初級: 複誦、朗讀句子與短文、回答問題; both pass at 4 of 5 級分). Claude only sees what speech recognition heard,
 * so its score covers content and language and says so — it is never presented as an official score.
 */
export type GeptLevel = 'elementary' | 'intermediate'
export interface GeptPicture { scene: string; title: string; questions: string[]; describe: string }
export interface GeptElementarySet { id: string; repeat: string[]; readSentences: string[]; readPassage: string; questions: string[] }
export interface GeptIntermediateSet { id: string; passages: string[]; questions: string[]; picture: GeptPicture }
export type GeptPart = 'repeat' | 'read' | 'questions' | 'picture'

export const geptLevels: Record<GeptLevel, { name: string; cefr: string; minutes: number; parts: { part: GeptPart; name: string; how: string }[] }> = {
  elementary: {
    name: '初級', cefr: 'A2', minutes: 10,
    parts: [
      { part: 'repeat', name: '複誦', how: '每句聽兩次，聽完跟著說一次（看不到句子）。' },
      { part: 'read', name: '朗讀句子與短文', how: '先默讀，再用正常的速度清楚念出來。' },
      { part: 'questions', name: '回答問題', how: '每題聽兩次（題目不印出來），每題約 15 秒回答。' },
    ],
  },
  intermediate: {
    name: '中級', cefr: 'B1', minutes: 15,
    parts: [
      { part: 'read', name: '朗讀短文', how: '兩篇短文，每篇先默讀 1 分鐘，再在 2 分鐘內念完。' },
      { part: 'questions', name: '回答問題', how: '10 題，每題聽兩次（題目不印出來）；第 1–5 題各 15 秒，第 6–10 題各 30 秒。' },
      { part: 'picture', name: '看圖敘述', how: '先用 30 秒看圖和問題，再用 1 分 30 秒描述，問題是用來提示你可以講什麼。' },
    ],
  },
}

/** Answer time for question `i` (0-based). */
export const answerSeconds = (level: GeptLevel, i: number) => level === 'intermediate' && i >= 5 ? 30 : 15

export const geptKey = (level: GeptLevel, id: string) => 'gept.speak.' + level + '.' + id
export interface GeptRecord { d?: string; q?: number; p?: number; r?: number }
export function readGept(notes: Record<string, string>, level: GeptLevel, id: string): GeptRecord {
  try { return JSON.parse(notes[geptKey(level, id)] || '{}') as GeptRecord } catch { return {} }
}
export function saveGept(notes: Record<string, string>, level: GeptLevel, id: string, patch: GeptRecord) {
  return { ...notes, [geptKey(level, id)]: JSON.stringify({ ...readGept(notes, level, id), ...patch }) }
}

/** The official 全民英檢 speaking tables (see rubrics.ts), with what a transcript can and can't show. */
export const speakRubric: Record<GeptLevel, RubricId> = { elementary: 'gept-speak-elementary', intermediate: 'gept-speak-intermediate' }
const rubric: Record<GeptLevel, string[]> = {
  elementary: [
    '官方初級口說：5 級分，4 級分通過。官方評「發音、語調、流暢」（三部分都算）和「回答問題的語法、字彙」兩半。你聽不到聲音，只評「回答問題時的語法和字彙、有沒有回答到題目」這一半，給參考分。',
    rubricPrompt(rubrics[speakRubric.elementary]),
  ],
  intermediate: [
    '官方中級口說：整體 5 級分，4 級分通過；官方同時評發音與語調、字彙與語法、別人聽不聽得懂、有沒有切題。你聽不到聲音，只評逐字稿看得出來的「字彙與語法」和「切題、內容」，給參考分。',
    rubricPrompt(rubrics[speakRubric.intermediate]),
  ],
}

const format = (perItem: string) => [
  '照固定格式回覆，每種一行，不要寫其他文字，不要用 Markdown：',
  '[分數] 0 到 5 的數字（可以有 .5） ||| 一句繁體中文的理由',
  perItem,
  '[好] 一句這次做得最好的地方',
  '[改] 一句最該改進的地方，具體說怎麼改',
  '[卡] 他說錯的原句 ||| 正確自然的英文 ||| 這句的中文意思 ||| 一句繁體中文原因 ||| 弱點名稱（最多 3 行，挑最值得記住的；沒有錯就不要寫）',
  '弱點名稱照抄這份清單裡最符合的一個：' + weakLabelPrompt(),
].join('\n')

/** Claude's instructions for the 回答問題 part; the answers go in the message. */
export function questionsPrompt(level: GeptLevel) {
  return [
    `你是全民英檢${geptLevels[level].name}口說的練習評分員，學生是玄燁（台灣護理系學生）。下面是他「回答問題」的逐字稿：每題的題目和他說的話（語音辨識的結果，可能有辨識錯的字，明顯是辨識錯的不要扣分；沒說話就是空白）。`,
    ...rubric[level],
    format('[題] 題號 ||| 一句回饋：好的地方或更好的說法，可以附一句示範英文（每題一行）'),
  ].join('\n')
}

/** Claude's instructions for 看圖敘述 (中級). */
export function picturePrompt(picture: { describe: string; questions: string[] }) {
  return [
    '你是全民英檢中級口說的練習評分員，學生是玄燁（台灣護理系學生）。這是「看圖敘述」：他先看圖和下面的問題 30 秒，再描述 1 分 30 秒。他說的話是語音辨識的結果，可能有辨識錯的字，明顯是辨識錯的不要扣分。',
    '圖片內容：' + picture.describe,
    '提示問題：' + picture.questions.map((q, i) => (i + 1) + '. ' + q).join(' '),
    ...rubric.intermediate,
    '另外看他有沒有回答到提示問題、描述得夠不夠具體（人、地方、動作、感覺）。',
    format('[題] 提示問題的題號 ||| 他有沒有講到，沒講到的話示範一句可以怎麼說（每題一行）'),
  ].join('\n')
}

/** Asking Claude to look at his own photo: four guiding questions in the style of the test, and a short description. */
export const photoQuestionsPrompt = [
  '這是一張照片，要用來練全民英檢中級口說的「看圖敘述」。',
  '照官方題型寫 4 個英文提示問題（例如：這些人在哪裡、他們在做什麼、看起來感覺怎麼樣、跟自己的經驗有關的一題），難度 B1，每題一行，格式：[問] 問題',
  '再用一行英文描述照片裡看得到的人、地方、動作和細節，格式：[描述] 描述',
  '不要寫其他文字。',
].join('\n')

export interface GeptFeedback { score?: number; why: string; items: { n: number; text: string }[]; good: string; fix: string; cards: { wrong: string; en: string; zh: string; why: string; tag?: string }[]; rest: string }

export function parseGeptFeedback(text: string): GeptFeedback {
  const out: GeptFeedback = { why: '', items: [], good: '', fix: '', cards: [], rest: '' }
  const rest: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = line.match(/^\[(分數|題|好|改|卡)\]\s*(.*)$/)
    if (!m) { if (line) rest.push(line); continue }
    const parts = m[2].split('|||').map(p => p.trim())
    if (m[1] === '分數') {
      const n = Number((parts[0].match(/\d+(?:\.\d+)?/) ?? [''])[0])
      if (Number.isFinite(n) && n >= 0 && n <= 5 && parts[0].trim() !== '') out.score = Math.round(n * 2) / 2
      out.why = parts[1] ?? ''
    } else if (m[1] === '題') {
      const n = Number((parts[0].match(/\d+/) ?? ['0'])[0])
      if (n && parts[1]) out.items.push({ n, text: parts.slice(1).join(' ') })
    } else if (m[1] === '好') out.good = parts.join(' ')
    else if (m[1] === '改') out.fix = parts.join(' ')
    else if (parts.length >= 4 && parts[0] && parts[1] && out.cards.length < 3)
      out.cards.push({ wrong: parts[0], en: parts[1], zh: parts[2], why: parts[3], ...(parts[4] ? { tag: parts[4] } : {}) })
  }
  out.rest = rest.join('\n')
  return out
}

export function parsePhotoQuestions(text: string) {
  const questions: string[] = []
  let describe = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const q = line.match(/^\[問\]\s*(.+)$/)
    const d = line.match(/^\[描述\]\s*(.+)$/)
    if (q && questions.length < 5) questions.push(q[1].trim())
    else if (d) describe = d[1].trim()
  }
  return { questions, describe }
}
