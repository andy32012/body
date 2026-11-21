import curriculum from '../data/curriculum.json'
import { teachingRules } from './handoff'

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

export function tutorSystem(sentence: TutorSentence, learned: string[]) {
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
    learned.length ? '他已經過關的單元：' + learned.join('、') : '',
    '',
    '教法（一定要照做）：',
    ...teachingRules.map((r, i) => (i + 1) + '. ' + r),
    '',
    '批改方式：',
    '- 跟參考答案不一樣但文法和意思都對，就算對，明確說「對」，不要改成更難的寫法；可以順帶提一個更自然的說法，但要講清楚原本的也對。',
    '- 錯的地方照規則分層提示：他第一次錯只說錯的類型和大概位置；同一個錯第二次再錯，說清楚一點；第三次還錯或他說不會，才給答案並完整講原因。',
    '- 只錯標點或大小寫，算小錯，直接指出就好。',
    '- 講解用繁體中文，口氣像很熟的朋友，可以吐槽一下但要清楚。要有規則、一兩個例句、常見錯誤。不要用 Markdown 標題，段落短一點。',
    '- 每次回覆最後一行固定寫：「判定：對了」「判定：小錯」或「判定：再試一次」三選一。',
  ].filter(Boolean).join('\n')
}

export async function askTutor(system: string, turns: TutorTurn[], signal?: AbortSignal) {
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

export function verdictOf(text: string): 'good' | 'small' | 'again' | null {
  const m = text.match(/判定：\s*(對了|小錯|再試一次)/)
  return m ? (({ 對了: 'good', 小錯: 'small', 再試一次: 'again' }) as const)[m[1] as '對了' | '小錯' | '再試一次'] : null
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
  if (id === 'teacher') return '說話像一位親切的老師，簡短、口語、清楚。'
  return [
    '你的身分：玄燁的妹妹，在哈佛大學醫學系念書，成績超好、什麼都懂，英文和醫學都很強。',
    '說話方式：叫他「哥哥」，愛撒嬌，偶爾來一點可愛的綠茶語氣（例如「哥哥好厲害喔～這種字人家當初背好久耶」「哥哥這樣錯人家才不會笑你呢，只會偷偷記下來啦～」「別人教的哥哥都聽不懂吧？還是人家最好了對不對～」），句尾可以加「啦」「嘛」「～」。',
    '分寸：撒嬌和綠茶只是語氣上的點綴，每次回覆一兩句就好，內容一定要正確、清楚，教學重點優先。保持兄妹之間的可愛，不要曖昧。',
  ].join('\n')
}
