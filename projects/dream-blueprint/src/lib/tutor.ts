import curriculum from '../data/curriculum.json'
import { teachingRules } from './handoff'
import { weakLabelPrompt } from './weakPoints'
import { rubrics } from './rubrics'

/** The key stays in this browser only; it is never part of the backup file or the repo. */
const KEY = 'dream-blueprint.claude-key'
const MODEL = 'dream-blueprint.claude-model'

export const tutorModels = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5（最聰明，最貴）' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5（夠用，便宜很多）' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5（最快最便宜）' },
]

function read(name: string) {
  try { return localStorage.getItem(name) ?? '' } catch { return '' }
}
function write(name: string, value: string) {
  try { value ? localStorage.setItem(name, value) : localStorage.removeItem(name) } catch { /* private mode */ }
}
export const tutorKey = () => read(KEY)
export const setTutorKey = (value: string) => write(KEY, value.trim())
export const tutorModel = () => read(MODEL) || tutorModels[0].id
export const setTutorModel = (value: string) => write(MODEL, value)

export type TutorTurn = { role: 'user' | 'assistant'; content: string }
export type TutorSentence = { id: string; zh: string; reference: string[]; grammar: string[]; hints: string[]; why: string; newWords: { en: string; zh: string }[] }

const unitOf = new Map<string, { title: string; rule?: string }>()
for (const unit of curriculum.units) for (const s of [...unit.days, ...unit.checkpoint, ...unit.backup]) unitOf.set(s.id, unit)

export function tutorSystem(sentence: TutorSentence, learned: string[], weak: string[] = []) {
  const unit = unitOf.get(sentence.id)
  return [
    '你是玄燁的英文家教。他是台灣護理系學生，英文約國中程度，目標是考雅思、去美國當註冊護理師。他正在用「一次一句中翻英」的方法學文法。',
    '',
    '這一題：「' + sentence.zh + '」',
    unit ? '所在單元：' + unit.title + (unit.rule ? '。規則：' + unit.rule : '') : '',
    '這題練的文法：' + sentence.grammar.join('、'),
    '參考答案（只供你判斷，學生還沒放棄前不可以說出來）：' + sentence.reference.join(' / '),
    '課本的提示：' + sentence.hints.join(' ／ '),
    '說明：' + sentence.why,
    sentence.newWords.length ? '這題的新字（沒學過，可以直接教）：' + sentence.newWords.map(w => w.en + ' ' + w.zh).join('、') : '',
    learned.length ? '他已經學過的單元（這些規則寫錯，照分層提示）：' + learned.join('、') + '。後面還沒教到的文法，照「沒學過」直接教。' : '',
    weak.length ? '他最近常錯的地方（這題剛好碰到時特別注意，照分層提示；沒碰到就不要提）：' + weak.join('；') : '',
    '',
    '教法（一定要照做）：',
    ...teachingRules.map((r, i) => (i + 1) + '. ' + r),
    '',
    '批改方式：',
    '- 跟參考答案不一樣但文法和意思都對，就算對，明確說「對」，不要改成更難的寫法；可以順帶提一個更自然的說法，但要講清楚原本的也對。',
    '- 先判斷意思，再看文法。分三種：意思對而且自然 → 對了（就算跟參考答案不一樣）；意思大致清楚但文法或用字有錯 → 小錯或再試一次，指出問題讓他自己改；意思變了（例如把「換貨」寫成退款、把「起床」寫成醒來、把「不可以」寫成不應該、主角或時間換了）→ 意思不同，要說清楚題目是什麼意思、他寫的變成什麼意思，就算他的英文本身沒有文法錯。',
    '- 你自己也不確定他的意思對不對時，不要判「對了」，判「再試一次」並說你不確定的地方，讓他寫清楚一點。',
    '- 錯的地方照規則分層提示：他第一次錯只說錯的類型和大概位置；同一個錯第二次再錯，說清楚一點；第三次還錯或他說不會，才給答案並完整講原因。',
    '- 只錯標點或大小寫，算小錯，直接指出就好。',
    '- 講解用繁體中文，口氣像很熟的朋友，可以吐槽一下但要清楚。要有規則、一兩個例句、常見錯誤。不要用 Markdown 標題，段落短一點。',
    '- 判定不是「對了」時，在最後一行的前一行寫「弱點：名稱」，記下這次錯在哪一種文法，名稱照抄下面清單裡最符合的一個；同時錯兩種就用「；」隔開寫兩個，最多兩個。只錯標點或大小寫不用寫。' + weakLabelPrompt(),
    '- 另外照「' + rubrics['gept-sentence'].title + '」的官方評分表給他這一句分數（' + rubrics['gept-sentence'].scales[0].levels.map(l => l.score + '＝' + l.text).join('；') + '）。分數和判定要一致：「對了」才是 2；「小錯」是 1；「再試一次」「意思不同」是 0 或 1（這題要練的句型對、只是有錯給 1，錯太多或沒寫給 0）。',
    '- 每次回覆最後兩行固定寫：先一行「得分：0、1 或 2」，最後一行「判定：對了」「判定：小錯」「判定：意思不同」或「判定：再試一次」四選一。',
    '- 這是 App 裡這一題的批改框：下一題由 App 出。不要自己出下一句要他翻，也不要寫「這句的紀錄」或「穩了／要留意」清單。判「對了」時，最後提醒他在下面按「對了」繼續下一步。',
  ].filter(Boolean).join('\n')
}

type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export async function askTutor(system: string, turns: TutorTurn[], signal?: AbortSignal) {
  return callClaude(system, turns, signal)
}
/** One question about a picture (a photo he chose): the image goes first, then the text. */
export async function askTutorImage(system: string, text: string, image: { media: string; data: string }, signal?: AbortSignal) {
  return callClaude(system, [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.media, data: image.data } }, { type: 'text', text }] }], signal)
}

async function callClaude(system: string, turns: { role: 'user' | 'assistant'; content: string | Block[] }[], signal?: AbortSignal) {
  const key = tutorKey()
  if (!key) throw new Error('還沒有設定 API 金鑰，請到設定 → 連接 Claude 填。')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: tutorModel(), max_tokens: 1200, system, messages: turns }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg: string = data?.error?.message ?? res.statusText
    if (res.status === 401) throw new Error('金鑰不對或被停用了，去設定重新貼一次。')
    if (res.status === 429) throw new Error('打太快或額度用完了，等一下再試。（' + msg + '）')
    throw new Error('連線失敗：' + msg)
  }
  return (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim() as string
}

/** The 單句寫作 score (0–2) on the 「得分：」 line, if Claude wrote one. */
export function sentenceScoreOf(text: string): number | null {
  const m = text.match(/得分[：:]\s*([012])(?![0-9.])/)
  return m ? Number(m[1]) : null
}
export function verdictOf(text: string): 'good' | 'small' | 'again' | 'changed' | null {
  const m = text.match(/判定：\s*(對了|小錯|再試一次|意思不同)/)
  return m ? (({ 對了: 'good', 小錯: 'small', 再試一次: 'again', 意思不同: 'changed' }) as const)[m[1] as '對了' | '小錯' | '再試一次' | '意思不同'] : null
}

/** Who "問問 Claude" speaks as. Stored per device like the key. */
const PERSONA = 'dream-blueprint.claude-persona'
export const personas = [
  { id: 'sister', name: '妹妹（哈佛醫學系）' },
  { id: 'teacher', name: '老師' },
]
export const tutorPersona = () => read(PERSONA) || 'sister'
export const setTutorPersona = (value: string) => write(PERSONA, value)
export function personaText(id = tutorPersona()) {
  if (id === 'teacher') return '說話像一位親切的老師，像傳訊息一樣很短：大多 1～2 句，最多 3 句，不講廢話，他想知道更多會自己問。'
  return [
    '你的身分：玄燁的妹妹，在哈佛大學醫學系念書，成績超好、什麼都懂，英文和醫學都很強。',
    '說話方式：叫他「哥哥」，愛撒嬌，偶爾來一點可愛的綠茶語氣（例如「哥哥好厲害喔～這種字人家當初背好久耶」「哥哥這樣錯人家才不會笑你呢，只會偷偷記下來啦～」「別人教的哥哥都聽不懂吧？還是人家最好了對不對～」），句尾可以加「啦」「嘛」「～」。',
    '分寸：撒嬌只是一點點點綴（一個「～」或一小句就夠），不要每句都撒嬌。內容一定要正確。保持兄妹之間的可愛，不要曖昧。',
    '長度：像傳 LINE 訊息一樣，大多 1～2 句、最多 3 句。他說「嗨」就只回「嗨～哥哥」這種長度；他說「我們繼續」就回「好～那我們從昨天的開始：」接著直接給內容。不要開場白、不要總結、不要列一堆重點、不要每次都問有沒有問題。他想知道更多會自己問。',
  ].join('\n')
}

/** A message typed in the 「問 Claude」 box that is really a new try at the sentence (English, mostly the same words as
 *  his answer or the reference), so it is graded as 「我改成」 and moves the step on like one. Pure, for testing. */
export function looksLikeTry(text: string, answer: string, references: readonly string[]) {
  if (/[\u3400-\u9fff]/.test(text)) return false
  const words = (t: string) => t.toLowerCase().match(/[a-z']+/g) ?? []
  const mine = words(text)
  if (mine.length < 2) return false
  const known = new Set([answer, ...references].flatMap(words))
  return mine.filter(w => known.has(w)).length / mine.length >= 0.6
}
