import { rubricPrompt, rubrics, validRubricScore, verdictFor, type RubricId } from './rubrics'
import { weakLabelPrompt } from './weakPoints'

/** A correction box's answer from Claude: the verdict, the corrected text, each fix, and — when the box grades by a
 *  published table — the score and why. */
export type Fix = { wrong: string; right: string; why: string; zh?: string; en?: string; tag?: string }
export type Result = { verdict: 'good' | 'small' | 'again' | 'changed'; corrected: string; fixes: Fix[]; note?: string; resolved?: number[]; still?: number[]
  /** The score on the published table (全民英檢) and why, when the box grades by one. */
  rubric?: RubricId; score?: number; reason?: string }
export const verdictNames = { good: '全對', small: '小錯', again: '要再練', changed: '意思不一樣' }

const text = (v: unknown) => typeof v === 'string' ? v : undefined
/** One fix as the page can show it: strings only; a fix without the corrected part says nothing and is left out. */
function cleanFix(v: unknown): Fix | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const f = v as Record<string, unknown>
  const right = text(f.right)
  if (!right?.trim()) return null
  const zh = text(f.zh), en = text(f.en), tag = text(f.tag)
  return { wrong: text(f.wrong) ?? '', right, why: text(f.why) ?? '', ...(zh !== undefined ? { zh } : {}), ...(en !== undefined ? { en } : {}), ...(tag !== undefined ? { tag } : {}) }
}
const strictness: Record<Result['verdict'], number> = { good: 0, small: 1, again: 2, changed: 3 }
/** Claude's JSON, or null when it is not a judgement — then nothing is marked and he can ask again. Every judgement
 *  needs one of the four verdicts and a non-empty corrected text. With a table the score must be one on the table and
 *  the reason must say why (a missing or impossible score, or no reason, is no judgement), and the verdict can't be
 *  friendlier than either the table or what Claude said: 全對 only at the top level, and 「要再練」 with a full score
 *  stays 要再練. 意思不一樣 is never turned into 全對 by a high score. */
export function parseCorrection(reply: string, rubric?: RubricId): Result | null {
  try {
    const json = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as Record<string, unknown>
    if (!json || typeof json !== 'object' || typeof json.corrected !== 'string' || !json.corrected.trim()) return null
    const nums = (v: unknown) => Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0) : undefined
    const named = typeof json.verdict === 'string' && json.verdict in verdictNames ? json.verdict as Result['verdict'] : null
    if (!named) return null
    const table = rubric ? rubrics[rubric] : null
    const scored = table && validRubricScore(table, json.score) ? json.score as number : undefined
    if (table && (scored === undefined || !text(json.reason)?.trim())) return null
    const byTable = table && scored !== undefined ? verdictFor(table, scored, named) : named
    const verdict: Result['verdict'] = strictness[byTable] >= strictness[named] ? byTable : named
    const fixes = Array.isArray(json.fixes) ? json.fixes.map(cleanFix).filter((f): f is Fix => !!f) : []
    const note = text(json.note)
    return { verdict, corrected: json.corrected, fixes, ...(note ? { note } : {}), resolved: nums(json.resolved), still: nums(json.still),
      ...(rubric && scored !== undefined ? { rubric, score: scored, reason: text(json.reason) ?? '' } : {}) }
  } catch { return null }
}

/** Claude's instructions for a correction box: a translation or the learner's own short piece, graded by a table when given. */
export function correctionPrompt(zh: string, reference?: string, words?: string[], mode: 'translate' | 'open' = 'translate', previous?: Result, rubric?: RubricId) {
  const tail = (previous?.fixes.length ? ',"resolved":[上次問題中這次已改好的編號],"still":[上次問題中這次還沒改好的編號]' : '')
    + (rubric ? ',"score":照評分表的級分,"reason":"符合第幾級的哪一句描述，以及為什麼沒有到高一級"' : '')
  const table = rubric ? rubrics[rubric] : null
  const json = mode === 'open'
    ? '{"verdict":"good|small|again|changed","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這一句改好後的中文意思","en":"這一句改好後的完整英文","tag":"錯在哪一種文法"}],"note":"一句整體建議（可省略）"' + tail + '}'
    : '{"verdict":"good|small|again|changed","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這個錯誤所在那一句的中文（照題目原文抄）","en":"那一句改好後的完整英文","tag":"錯在哪一種文法"}],"note":"一句整體建議（可省略）"' + tail + '}'
  return [
    mode === 'open'
      ? '你是英文老師，批改台灣護理系學生（英文國中程度）的英文短寫作。這是開放題，內容是他自己想的。'
      : '你是英文老師，批改台灣護理系學生（英文國中程度）的中翻英。',
    '題目：' + zh,
    reference ? (mode === 'open' ? '參考寫法（只是一種例子，不要照這個改他的內容）：' : '參考翻譯（寫法不只一種）：') + reference : '',
    words?.length ? (mode === 'open' ? '這課要練的句型：' : '這段要練的單字：') + words.join(', ') : '',
    '',
    '規則：',
    mode === 'open'
      ? '- 保留他的意思和內容，只改文法、用字和不自然的地方。意思和文法對就不要改成更難的說法。沒用到這課的句型，就在 note 提醒一句。'
      : '- 保留他的寫法，只改錯的地方。意思和文法對就不要改成更難或更漂亮的說法。',
    mode === 'open' ? '' : '- 漏翻的句子要補上。',
    mode === 'open' ? '- verdict：good＝意思清楚、文法對；small／again＝文法或用字要改；changed＝寫出來的意思跟他想說的明顯不一樣。' : '- verdict 先看意思：good＝意思對而且自然（寫法跟參考翻譯不同也算）；small／again＝意思大致清楚但文法或用字要改；changed＝意思跟題目不一樣（例如換貨寫成退款、起床寫成醒來、不可以寫成不應該），就算英文本身沒有文法錯。changed 時第一個 fix 的 why 要說清楚：題目是什麼意思、他寫的變成什麼意思。',
    '- 不確定他的意思對不對時，不要給 good，給 again，並在 note 寫你不確定的地方。',
    ...(table ? [rubricPrompt(table), '- verdict 要跟分數一致：' + table.max + '（最高一級）才是 good；' + (table.max - 1) + ' 是 small；更低是 again，意思跟' + (mode === 'open' ? '他想說的' : '題目') + '不一樣就 changed。'] : []),
    '- why 用繁體中文，一句話講清楚規則，像朋友一樣口語。',
    '- 第一次回覆只輸出 JSON，不要其他文字：' + json,
    '- 同一句有好幾個錯，合成一個 fix 就好；只是標點或大小寫的小問題不用列。',
    '- 全對時 fixes 是空陣列。',
    '- 每個 fix 的 tag 照抄這份清單裡最符合的一個名稱：' + weakLabelPrompt(),
    previous?.fixes.length ? '- 這是他改過後的第二版。上次批改指出的問題（編號從 0 開始）：' + previous.fixes.map((f, i) => i + '. ' + (f.wrong || '漏寫') + ' → ' + f.right).join('；') + '。逐一判斷這次有沒有改好，放進 resolved 或 still；新的問題照樣放 fixes。' : '',
    '- 之後他追問時，用繁體中文正常回答，講清楚規則和例句，段落短一點，不要 JSON、不要 Markdown 標題。',
  ].filter(Boolean).join('\n')
}
