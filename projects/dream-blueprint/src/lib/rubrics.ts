/** The published scoring tables Claude grades by: the official 全民英檢 (GEPT) scoring descriptions from LTTC and the
 *  IELTS Writing band descriptors. Each level is a close paraphrase of the official wording (the official pages are
 *  linked and shown to him), so Claude has to pick a level from the table and say which description fits — it never
 *  makes up its own scale. Used by the writing ladder, every Claude correction box, 中翻英 and the GEPT speaking practice. */

export type RubricId = 'gept-sentence' | 'gept-paragraph' | 'gept-essay' | 'gept-translation'
  | 'gept-speak-elementary' | 'gept-speak-intermediate' | 'ielts-task1' | 'ielts-task2'
export type Verdict = 'good' | 'small' | 'again' | 'changed'

export interface Level { score: number; text: string }
/** One scale: a whole piece (全民英檢 scores holistically) or one criterion (IELTS has four). */
export interface Scale { name: string; levels: Level[] }
export interface Rubric {
  id: RubricId
  /** The test and the part, as he sees it. */
  title: string
  source: { name: string; url: string }
  /** Scores run from 0 to `max` in steps of `step`. */
  max: number
  step: number
  scales: Scale[]
  /** How the official test sets its pass mark, as a share of the full score. */
  pass?: { share: number; note: string }
  /** Official rules that go with the table. */
  rules?: string[]
  /** What can't be judged from text alone. */
  limits?: string
}

const geptElementary = { name: '全民英檢官方網站：初級測驗介紹（寫作／口說能力測驗分數說明）', url: 'https://www.gept.org.tw/exam_intro/t01_introduction.asp' }
const geptIntermediate = { name: '全民英檢官方網站：中級測驗介紹（寫作／口說能力測驗分數說明）', url: 'https://www.gept.org.tw/exam_intro/t02_introduction.asp' }
const ieltsWriting = { name: 'IELTS Writing Band Descriptors（官方公開版，2023 年 5 月更新）', url: 'https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-band-descriptors.pdf' }

const levels = (texts: string[]): Level[] => texts.map((text, i) => ({ score: texts.length - 1 - i, text }))
/** IELTS criteria run from band 9 down to band 1 (band 0 is only for no attempt). */
const bands = (texts: string[]): Level[] => texts.map((text, i) => ({ score: 9 - i, text }))

const ieltsShared: Scale[] = [
  { name: 'Coherence and Cohesion（連貫與銜接）', levels: bands([
    '讀起來毫不費力；銜接自然到幾乎察覺不到；分段純熟。',
    '順序合乎邏輯，銜接處理得好；偶爾有小疏失。',
    '整篇推進清楚；連接詞用得靈活，但偶爾用錯、用太多或太少。',
    '大致連貫，整體推進清楚；連接詞有時用錯，或用得很機械。',
    '看得出有組織，但不完全合邏輯；句子之間連得不好；連接詞很有限或用太多。',
    '想法沒有連貫地排好；連接詞很基本、重複或用錯；幾乎沒有分段。',
    '看不出邏輯；幾乎沒有連接詞；看不出代名詞指的是誰。',
    '幾乎看不出組織能力。',
    '沒有傳達任何訊息。',
  ]) },
  { name: 'Lexical Resource（字彙）', levels: bands([
    '字彙廣、精準、自然；拼字和詞形錯誤極少。',
    '用字靈活精準；會熟練地用較少見的字和慣用說法；搭配偶爾有小錯。',
    '字彙足以靈活、精準地表達；用了一些較少見的字；風格或搭配偶爾有問題。',
    '字彙大致夠用；範圍有限但意思清楚；有些拼字錯，不影響理解。',
    '字彙有限，勉強夠用；簡單、正確但變化少；拼字錯誤明顯。',
    '字彙基本、重複；用字或詞塊不恰當，可能影響理解。',
    '字彙不夠（可能字數也不夠）；錯誤占多數，嚴重影響理解。',
    '字彙極少；除了背起來的片語，幾乎沒有看得懂的字串；拼字和詞形完全沒掌握。',
    '只有零星幾個字。',
  ]) },
  { name: 'Grammatical Range and Accuracy（文法範圍與正確度）', levels: bands([
    '句型廣泛、完全掌控；文法和標點幾乎完美。',
    '句型廣泛，用得靈活又正確；大部分句子沒有錯。',
    '用了多種複雜句，有一定彈性；沒有錯的句子很常見；少數錯誤會一再出現。',
    '簡單句和複雜句都有，但不夠靈活；複雜句比較常錯。',
    '句型有限、重複；複雜句常常錯；文法錯誤頻繁，可能讓人讀不太懂。',
    '句型非常有限，很少用從屬子句；文法錯誤頻繁，可能影響理解。',
    '錯誤占多數，除了背起來的片語，大部分意思看不懂；也可能太短，看不出掌控能力。',
    '除了背起來的片語，幾乎沒有句子結構。',
    '沒有可以評分的語言。',
  ]) },
]
const ieltsRules = [
  '每一項給整數 band（1–9）；band 0 只給完全沒作答、不是英文或證實整篇是背的。',
  '20 個字以下，四項都是 band 1。',
  '要完全符合某一級的描述才能給那一級；有比那一級更差的特徵，就不能給那一級。',
  '從題目抄來的字句不算他的語言。',
  '這一題的分數＝四項平均，照雅思的進位：小數 .25 進到 .5、.75 進到下一個整數。',
]

export const rubrics: Record<RubricId, Rubric> = {
  'gept-sentence': {
    id: 'gept-sentence', title: '全民英檢初級寫作・單句寫作', source: geptElementary, max: 2, step: 1,
    scales: [{ name: '每一句', levels: levels([
      '完全正確，沒有錯。',
      '有錯，但這句要練的重點句型是對的。',
      '錯太多、沒寫，或寫了等於沒寫。',
    ]) }],
    pass: { share: 0.7, note: '初級寫作滿分 100 分，70 分通過：要拿到七成的分數' },
  },
  'gept-paragraph': {
    id: 'gept-paragraph', title: '全民英檢初級寫作・段落寫作', source: geptElementary, max: 5, step: 1,
    scales: [{ name: '整篇', levels: levels([
      '題目的要求都正確表達出來；文法、用字幾乎沒有錯。',
      '大致正確表達題目的要求；文法、用字有錯，但不影響讀者理解。',
      '大致回答了題目，但沒有完全表達清楚；文法、用字有錯，稍微影響理解。',
      '只回答到一部分；有讓人看不懂或誤會的地方；文法、用字都有錯，讀者要很耐心才看得懂。',
      '只回答到一個問題或重點；文法、用字錯太多，嚴重影響理解。',
      '沒寫，或寫了等於沒寫。',
    ]) }],
    pass: { share: 0.7, note: '初級寫作滿分 100 分，70 分通過：這一部分要 4 級分以上' },
  },
  'gept-essay': {
    id: 'gept-essay', title: '全民英檢中級寫作・英文作文', source: geptIntermediate, max: 5, step: 1,
    scales: [{ name: '整篇', levels: levels([
      '內容適切回答題目要求，清楚有條理；組織很好；字彙和句型用得靈活；文法、拼字、標點只有偶爾的錯。',
      '內容符合題目要求，大致清楚；組織大致完整；字彙和句型用得正確；文法、拼字、標點雖然有錯，但不影響理解。',
      '內容大致符合題目要求，但沒有完全表達清楚；組織還可以；字彙和句型掌握得不好；文法、拼字、標點錯得偏多，影響理解。',
      '只有一部分符合題目要求，大多看不太懂；組織不好；能用的字彙和句型有限；文法、拼字、標點錯很多。',
      '內容不符合題目要求，看不懂；沒有組織；能用的字彙和句型非常有限；文法、拼字、標點錯得太多。',
      '沒寫，或寫了等於沒寫。',
    ]) }],
    pass: { share: 0.8, note: '中級寫作滿分 100 分，80 分通過：要 4 級分以上' },
  },
  'gept-translation': {
    id: 'gept-translation', title: '全民英檢中級寫作・中譯英', source: geptIntermediate, max: 5, step: 1,
    scales: [{ name: '整段', levels: levels([
      '完整譯出原文的意思；段落組織和連貫都很好，句型掌握得好；用字、文法、拼字、標點、大小寫幾乎沒有錯。',
      '意思譯得恰當；組織、連貫和句型大致良好；用字、文法、拼字、標點、大小寫偶爾有錯，但不妨礙意思。',
      '沒有完全譯出原文的意思；組織鬆散、不夠連貫，句型沒有完全掌握；用字和文法常有錯，已經妨礙意思，拼字、標點、大小寫也有錯。',
      '只譯出一部分意思；組織不好、不連貫，句型掌握差，大多看不懂；用字、文法、拼字、標點、大小寫錯得很嚴重。',
      '沒有譯出原文的意思；句型掌握很差，看不懂；錯誤又多又嚴重。',
      '沒寫，或寫了等於沒寫。',
    ]) }],
    pass: { share: 0.8, note: '中級寫作滿分 100 分，80 分通過：要 4 級分以上' },
  },
  'gept-speak-elementary': {
    id: 'gept-speak-elementary', title: '全民英檢初級口說・語法與字彙', source: geptElementary, max: 5, step: 0.5,
    scales: [{ name: '語法與字彙', levels: levels([
      '說的內容符合題目要求，基本的文法和字彙大致掌握得住。',
      '內容大致符合題目要求，基本文法和字彙大致正確，但還不能自在地用。',
      '說的內容很多地方聽不懂，文法常錯、字彙有限，影響表達。',
      '內容很難懂，文法錯很多，句子多半是片段，字彙不夠，說得很吃力。',
      '幾乎沒有句型和文法可言，字彙嚴重不足，很難表達。',
      '沒有回答，或回答了等於沒回答。',
    ]) }],
    pass: { share: 0.8, note: '初級口說滿分 100 分，80 分通過（4 級分）' },
    limits: '官方另一半分數看發音、語調和流暢度；逐字稿聽不到聲音，這裡只評語法和字彙，也就是只評官方的一半。',
  },
  'gept-speak-intermediate': {
    id: 'gept-speak-intermediate', title: '全民英檢中級口說', source: geptIntermediate, max: 5, step: 0.5,
    scales: [{ name: '內容與語言', levels: levels([
      '內容切題、表達流暢；文法和字彙用得自如，雖然偶爾有錯，但不影響溝通。（官方另外看發音、語調清楚自然）',
      '內容切題；文法和字彙雖然有錯，但不影響溝通。（官方另外看發音、語調大致正確自然）',
      '基本句型掌握得住，但文法還是有錯；字彙、片語有限，影響表達。（官方：發音、語調有時錯，影響理解）',
      '文法、字彙常常錯，沒辦法有效溝通。（官方：發音、語調錯很多）',
      '文法錯很多、會的字和片語有限，沒辦法清楚表達，幾乎不能溝通。',
      '沒有回答，或回答了等於沒回答。',
    ]) }],
    pass: { share: 0.8, note: '中級口說滿分 100 分，80 分通過（4 級分）' },
    limits: '官方會同時看發音和語調；逐字稿聽不到聲音，這裡只評內容、文法和字彙。',
  },
  'ielts-task1': {
    id: 'ielts-task1', title: 'IELTS 寫作 Task 1', source: ieltsWriting, max: 9, step: 1,
    scales: [{ name: 'Task Achievement（任務完成度）', levels: bands([
      '完全、恰當地達成所有要求；內容幾乎沒有疏漏。',
      '要求都恰當、充分地涵蓋；重點特徵清楚呈現；偶爾有遺漏。',
      '涵蓋要求；有清楚的總覽（overview），挑出重點特徵，但說明得不夠完整。',
      '格式恰當、有重點；涵蓋重點特徵並附一些數據；有些細節不相關或不正確。',
      '大致回應題目，但格式可能不恰當；重點特徵寫得不夠；只有細節、沒有總覽。',
      '有嘗試回應，但只寫到少數重點；有些內容不相關或不正確。',
      '沒有回應題目（可能看錯圖表）；大多不相關。',
      '內容幾乎跟題目無關。',
      '完全跟題目無關。',
    ]) }, ...ieltsShared],
    rules: ieltsRules,
  },
  'ielts-task2': {
    id: 'ielts-task2', title: 'IELTS 寫作 Task 2', source: ieltsWriting, max: 9, step: 1,
    scales: [{ name: 'Task Response（回應題目）', levels: bands([
      '深入回應題目；立場清楚、完整發展；論點有充分的支持。',
      '充分回應題目；立場清楚、發展得好；論點相關、有支持。',
      '回應了題目的主要部分；立場清楚；論點有延伸，但可能太籠統。',
      '回應了題目的主要部分；立場相關，但結論可能不清楚或重複；有些支持薄弱。',
      '題目的主要部分只回應了一部分；有立場但沒有發展；有些內容不相關或重複。',
      '只勉強或偏離地回應題目；很難找到立場；主要論點很難看出來。',
      '沒有任何部分好好回應，或誤解題目；沒有清楚的立場；論點少而且沒有發展。',
      '幾乎跟題目無關；沒有立場；只有一兩個沒發展的想法。',
      '完全跟題目無關。',
    ]) }, ...ieltsShared],
    rules: ieltsRules,
  },
}

/** A score Claude may give on this table: a number from 0 to max, in the table's steps. */
export const validRubricScore = (r: Rubric, v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= r.max && Math.abs(v / r.step - Math.round(v / r.step)) < 1e-9

/** The table's description for a score; a half score sits between two levels. */
export function levelText(r: Rubric, score: number, scale = 0): string {
  const ls = r.scales[scale]?.levels ?? []
  const exact = ls.find(l => l.score === score)
  if (exact) return exact.text
  const lower = ls.find(l => l.score === Math.floor(score)), upper = ls.find(l => l.score === Math.ceil(score))
  return lower && upper ? '介於 ' + upper.score + ' 和 ' + lower.score + ' 之間' : ''
}

/** IELTS rounds the average of the four criteria: .25 goes up to .5, .75 up to the next whole band. */
export function ieltsOverall(scores: readonly number[]) {
  if (!scores.length) return 0
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const whole = Math.floor(mean + 1e-9), part = mean - whole
  return part >= 0.75 - 1e-9 ? whole + 1 : part >= 0.25 - 1e-9 ? whole + 0.5 : whole
}

/** Whether a score passes the way the official test counts it (GEPT); IELTS has no pass mark. */
export const passes = (r: Rubric, score: number) => !!r.pass && score >= r.max * r.pass.share - 1e-9

/** The correction verdict follows the table, so a check can't say 「全對」 with errors the table counts: the top level is
 *  全對, one level down (errors that don't get in the way) is 小錯, anything lower is 要再練 — or 意思不一樣 when Claude
 *  said the meaning changed. */
export function verdictFor(r: Rubric, score: number, claimed: Verdict): Verdict {
  if (score >= r.max) return 'good'
  if (score >= r.max - 1) return 'small'
  return claimed === 'changed' ? 'changed' : 'again'
}

/** 中翻英 is judged twice — the verdict that drives the lesson and the 單句寫作 score (0–2) — and they must agree:
 *  2 only with 對了, 對了 only with 2, 小錯 is 1; 再試一次 and 意思不同 are at most 1. A missing score follows the verdict. */
export function settleSentence(verdict: Verdict, score: number | null): { verdict: Verdict; score: number | null } {
  if (verdict === 'good') return score === null || score === 2 ? { verdict, score: 2 } : { verdict: 'small', score: 1 }
  if (verdict === 'small') return { verdict, score: 1 }
  return { verdict, score: score === null ? null : Math.min(Math.max(0, Math.round(score)), 1) }
}

/** The table as Claude reads it, with how to use it. `parts` are the things to score (one score each). */
export function rubricPrompt(r: Rubric, parts?: readonly string[]) {
  const range = r.step < 1 ? '0–' + r.max + '，可以用 .5' : (r.id.startsWith('ielts') ? '1–' + r.max + ' 的整數 band' : '0–' + r.max + ' 的整數')
  return [
    '評分表：' + r.title + '（來源：' + r.source.name + '）。分數只能是這張表上的級分（' + range + '）。照這張表給分，不可以用自己的標準，也不可以為了鼓勵而給高分：',
    ...r.scales.flatMap(s => [...(r.scales.length > 1 ? ['【' + s.name + '】'] : []), ...s.levels.map(l => l.score + '：' + l.text)]),
    ...(r.rules ?? []).map(x => '規則：' + x),
    ...(r.limits ? ['限制：' + r.limits] : []),
    ...(parts?.length ? ['要給分的項目（每一項一個分數）：' + parts.join('；')] : []),
    '給分方法：從最高一級往下對照，給「描述全部符合」的那一級；在兩級之間拿不定，就給低的那一級。reason 一定要寫兩件事：符合第幾級的哪一句描述（用表上的話），還有為什麼沒有到高一級。',
  ].join('\n')
}
