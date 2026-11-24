/** How Claude checks a short piece of writing (a passage translation, a sentence with a word, an open task).
 *  With self-fix on, the first two checks give hints only — the kind of mistake and where, then a clearer hint —
 *  and never the corrected text; the full correction comes on the third check or when the learner asks for it. */

export type Verdict = 'good' | 'small' | 'again' | 'changed'
export type Stage = 'hint1' | 'hint2' | 'full'
export type Fix = {
  wrong: string; right?: string; why?: string; zh?: string; en?: string
  /** Hint-only checks: the kind of mistake, a hint that does not give the answer, and whether the rule was taught. */
  type?: string; hint?: string; learned?: boolean
}
export type Result = { verdict: Verdict; corrected: string; fixes: Fix[]; note?: string; resolved?: number[]; still?: number[]
  /** A hint-only check: no corrected text and no right answers in it. */
  partial?: boolean }
export const verdictNames: Record<Verdict, string> = { good: '全對', small: '小錯', again: '要再練', changed: '意思不一樣' }

/** The message that asks for the full correction after hints. */
export const FULL_ASK = '我想看完整批改：照完整格式輸出 JSON（含 corrected，以及每個 fix 的 right 和 why）。'

export function stageFor(attempt: number, selfFix: boolean): Stage {
  if (!selfFix) return 'full'
  return attempt <= 1 ? 'hint1' : attempt === 2 ? 'hint2' : 'full'
}

const fullJson = (mode: 'translate' | 'open', tail: string) => mode === 'open'
  ? '{"verdict":"good|small|again|changed","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這一句改好後的中文意思","en":"這一句改好後的完整英文"}],"note":"一句整體建議（可省略）"' + tail + '}'
  : '{"verdict":"good|small|again|changed","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這個錯誤所在那一句的中文（照題目原文抄）","en":"那一句改好後的完整英文"}],"note":"一句整體建議（可省略）"' + tail + '}'
const hintJson = (tail: string) =>
  '{"verdict":"good|small|again|changed","fixes":[{"wrong":"原本的片段（照他寫的抄）","type":"錯誤類型，例如：時態、冠詞、單複數、be 動詞、第三人稱單數、介系詞、用字、漏寫","hint":"提示","learned":true}],"note":"一句整體建議（可省略）"' + tail + '}'

/** The hint rules shared by every check that gives hints before answers (short writing and the writing ladder). */
export function hintRuleLines(stage: Stage) {
  return [
    '- 這次只給提示，讓他自己改。不要寫出正確的英文，不要給整段修改，不要在 hint、note 或其他欄位裡出現正確答案或參考答案的句子。',
    '- learned：這個錯用到的規則他學過就是 true，沒學過就是 false（照上面「他學過什麼」判斷）。',
    stage === 'hint1'
      ? '- 學過的規則寫錯（learned true）：hint 只說錯的類型和大概位置，一句話，例如「這裡的時態再想一下」。'
      : '- 這是他改過後再批改：還沒改好的學過的規則（learned true），hint 說清楚一點：講出規則和要怎麼想，但仍然不要寫出正確的英文。',
    '- 沒學過的字或文法（learned false）：hint 直接用繁體中文簡單教這個規則，再給一句短的英文例子；例子要用別的句子，不能是他這一題的答案。',
    '- 文法和意思對就不要列成問題，也不要改成更難的寫法（先求順、再求好）。',
    '- hint 用繁體中文，口語、像朋友一樣。',
  ]
}

export interface CorrectionInput {
  zh: string; reference?: string; words?: string[]; mode?: 'translate' | 'open'; previous?: Result; stage: Stage
  /** What he has been taught (learnedLines), so a mistake on a taught rule gets a hint and an untaught one is taught. */
  learned?: string[]
}

export function correctionSystem({ zh, reference, words, mode = 'translate', previous, stage, learned = [] }: CorrectionInput) {
  const tail = previous?.fixes.length ? ',"resolved":[上次問題中這次已改好的編號],"still":[上次問題中這次還沒改好的編號]' : ''
  const hinting = stage !== 'full'
  return [
    mode === 'open'
      ? '你是英文老師，批改台灣護理系學生（英文國中程度）的英文短寫作。這是開放題，內容是他自己想的。'
      : '你是英文老師，批改台灣護理系學生（英文國中程度）的中翻英。',
    '題目：' + zh,
    reference ? (mode === 'open' ? '參考寫法（只是一種例子，不要照這個改他的內容，也不可以說給他聽）：' : '參考翻譯（寫法不只一種；只供你判斷，不可以說給他聽）：') + reference : '',
    words?.length ? (mode === 'open' ? '這課要練的句型：' : '這段要練的單字：') + words.join(', ') : '',
    ...(learned.length ? ['', ...learned] : []),
    '',
    '規則：',
    mode === 'open'
      ? '- 保留他的意思和內容，只看文法、用字和不自然的地方。意思和文法對就不要改成更難的說法。沒用到這課的句型，就在 note 提醒一句。'
      : '- 保留他的寫法，只看錯的地方。意思和文法對就不要改成更難或更漂亮的說法。',
    mode === 'open' ? '' : '- 漏翻的句子要列出來。',
    mode === 'open' ? '- verdict：good＝意思清楚、文法對；small／again＝文法或用字要改；changed＝寫出來的意思跟他想說的明顯不一樣。' : '- verdict 先看意思：good＝意思對而且自然（寫法跟參考翻譯不同也算）；small／again＝意思大致清楚但文法或用字要改；changed＝意思跟題目不一樣（例如換貨寫成退款、起床寫成醒來、不可以寫成不應該），就算英文本身沒有文法錯。',
    '- 不確定他的意思對不對時，不要給 good，給 again，並在 note 寫你不確定的地方。',
    ...(hinting ? [
      ...hintRuleLines(stage),
      '- 第一次回覆只輸出 JSON，不要其他文字：' + hintJson(tail),
      '- 他說「' + FULL_ASK.slice(0, 7) + '」時，改用完整格式只輸出 JSON：' + fullJson(mode, tail),
    ] : [
      '- why 用繁體中文，一句話講清楚規則，像朋友一樣口語。',
      '- 第一次回覆只輸出 JSON，不要其他文字：' + fullJson(mode, tail),
    ]),
    mode === 'open' ? '' : '- verdict 是 changed 時，第一個 fix 要說清楚：題目是什麼意思、他寫的變成什麼意思。',
    '- 同一句有好幾個錯，合成一個 fix 就好；只是標點或大小寫的小問題不用列。',
    '- 全對時 fixes 是空陣列。',
    previous?.fixes.length ? '- 這是他改過後的版本。上次批改指出的問題（編號從 0 開始）：' + previous.fixes.map((f, i) => i + '. ' + (f.wrong || '漏寫') + (f.right ? ' → ' + f.right : f.type ? '（' + f.type + '）' : '')).join('；') + '。逐一判斷這次有沒有改好，放進 resolved 或 still；新的問題照樣放 fixes。' : '',
    '- 之後他追問時，用繁體中文正常回答，講清楚規則和例句，段落短一點，不要 JSON、不要 Markdown 標題。',
  ].filter(Boolean).join('\n')
}

const nums = (v: unknown) => Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : undefined
const isVerdict = (v: unknown): v is Verdict => typeof v === 'string' && v in verdictNames

/** Claude's JSON. A hint check has no corrected text: `partial` marks it, and any right answer that slipped in is dropped. */
export function parseCorrection(text: string, stage: Stage): Result | null {
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const verdict = isVerdict(json.verdict) ? json.verdict : 'small'
    const raw: unknown[] = Array.isArray(json.fixes) ? json.fixes : []
    const fixes = raw.filter((f): f is Record<string, unknown> => !!f && typeof f === 'object').map(f => ({
      wrong: typeof f.wrong === 'string' ? f.wrong : '',
      ...(typeof f.right === 'string' ? { right: f.right } : {}), ...(typeof f.why === 'string' ? { why: f.why } : {}),
      ...(typeof f.zh === 'string' ? { zh: f.zh } : {}), ...(typeof f.en === 'string' ? { en: f.en } : {}),
      ...(typeof f.type === 'string' ? { type: f.type } : {}), ...(typeof f.hint === 'string' ? { hint: f.hint } : {}),
      ...(typeof f.learned === 'boolean' ? { learned: f.learned } : {}),
    }))
    const base = { verdict, note: typeof json.note === 'string' ? json.note : undefined, resolved: nums(json.resolved), still: nums(json.still) }
    if (stage !== 'full') {
      // Keep only what a hint may show: the place, the kind of mistake and the hint.
      return { ...base, corrected: '', partial: true,
        fixes: fixes.map(({ wrong, type, hint, why, learned }) => {
          const h = hint ?? why ?? ''
          return { wrong, ...(type ? { type } : {}), hint: h, why: h, ...(learned !== undefined ? { learned } : {}) }
        }) }
    }
    if (typeof json.corrected !== 'string') return null
    return { ...base, corrected: json.corrected, fixes }
  } catch { return null }
}

/** A hint must not hand over the answer: true when it contains the corrected text or a reference sentence. */
export function hintGivesAway(hint: string, answers: readonly string[]) {
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '')
  const h = squash(hint)
  return answers.some(a => squash(a).length > 6 && h.includes(squash(a)))
}

/** The follow-up chat to show: the request for the full correction and its JSON reply are left out. */
export function chatTurns<T extends { role: string; content: string }>(turns: readonly T[]): T[] {
  return turns.filter((t, i) => t.content !== FULL_ASK && !(t.role === 'assistant' && turns[i - 1]?.content === FULL_ASK))
}
