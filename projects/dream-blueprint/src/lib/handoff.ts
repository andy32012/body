import type { AppState } from './store'
import curriculum from '../data/curriculum.json'
import { activePeriod } from './progress'
import { assistedUnits } from './grammarRetention'
import { certStatus, courseProgress, exams, officialLevel, unitGate } from './cefr'
import { hasPack, readHeld, type HeldPart } from './bridge'

type Sentence = { id: string; zh: string; reference: string[]; grammar: string[] }
const units = curriculum.units
const byId = new Map<string, Sentence>()
for (const unit of units) for (const s of [...unit.days, ...unit.checkpoint, ...unit.backup]) byId.set(s.id, s)
const periodNames: Record<string, string> = { semester: '一般學期', exam: '考週', internship: '實習', vacation: '寒暑假' }
const ratingNames: Record<string, string> = { correct: '對了', minor: '小錯', again: '不會' }

export const teachingRules = [
  '一次只出一句中文，我先自己翻，不要先給答案。',
  '學過的規則寫錯（時態、a/an/the、單複數、be 動詞、第三人稱單數、介系詞、固定句型）：第一次只提示錯的類型和位置；第二次提示清楚一點；還不會才給答案和原因。',
  '沒學過的字或文法：直接用簡單的話教。',
  '文法和意思對就算過，不要改成比較難的寫法（先求順、再求好）。',
  '每句記錄哪些規則穩了、哪些還常錯。',
  '講解要給夠：規則、例句、常見錯誤都講，不要只回一兩句。',
  '題目以日常生活句為主（為了雅思），護理情境只佔一部分。',
  '用繁體中文講解。',
]

/** Plain text another assistant can follow, built from what this device has recorded. */
export function handoffText(state: AppState, today: string) {
  const { unit: unitId, day } = state.curriculum
  const finished = unitId > units.length
  const unit = units.find(u => u.id === unitId)
  const lesson = unit ? (day >= 6 ? null : unit.days[day - 1]) : null
  const checkpoint = unit && day >= 6 ? unit.checkpoint : []
  const recent = state.sessions.flatMap(s => (s.translations ?? []).map(t => ({ ...t, day: s.day }))).slice(-10)
  const weak = new Map<string, number>()
  const solid = new Map<string, number>()
  // Solid only when written alone and checked; a self-marked "correct" nobody confirmed counts neither way.
  for (const t of state.sessions.flatMap(s => s.translations ?? [])) {
    const bucket = t.rating === 'correct' && !t.revealed ? (t.verified === true ? solid : null) : weak
    if (bucket) for (const g of t.grammar) bucket.set(g, (bucket.get(g) ?? 0) + 1)
  }
  const stable = state.curriculum.stableUnits.map(id => units.find(u => u.id === id)?.title).filter(Boolean)
  const lines = [
    '# 玄燁的英文進度（交接用）',
    '請照這份接著教我英文。每次上完課，請把「目前進度」整段更新後給我，方便我下次貼給你或其他老師。',
    '',
    '## 我是誰',
    '- 台灣人，護理系學生，目標去美國當註冊護理師（RN），之後要考雅思（IELTS）。',
    '- 英文大約國中程度。方法是「一次一句中翻英」加「背 7000 單」（大考中心 108 年版詞彙表，六級 6,012 個）。',
    '',
    '## 目前進度（' + today + '，' + (periodNames[activePeriod(today, state.settings.periods)] ?? '') + '）',
    '- 課表共 ' + units.length + ' 個文法單元（42 個主線＋B1→B2 橋接），每單元 6 天：第 1–5 天各一句中翻英，第 6 天三句小關卡。',
    finished ? '- ' + units.length + ' 個單元都做完了。照計畫：全民英檢中高級（或雅思學術組 5.5）等 7000 單第 5–6 級看完再考，之後用雅思閱讀、寫作、口說往 C1 練（B2→C1 每日課還在寫）。'
      : '- 現在：單元 ' + unitId + '（' + unit?.title + '）第 ' + day + ' 天。',
    levelLine(state),
    unit ? '- 這個單元的規則：' + unit.rule : null,
    packLine(state),
    lesson ? '- 今天這句：「' + lesson.zh + '」（不要先給答案）' : null,
    lesson && lesson.newWords.length ? '- 今天的新字：' + lesson.newWords.map(w => w.en + ' ' + w.zh).join('、') : null,
    checkpoint.length ? '- 今天是小關卡，三句：' + checkpoint.map(s => '「' + s.zh + '」').join('、') + '。對兩句以上就過關，進下一個單元。' : null,
    stable.length ? '- 已過關的單元（沒看提示自己寫對）：' + stable.join('、') : null,
    assistedUnits(state.notes).length ? '- 做完但有看提示、之後要再確認：' + assistedUnits(state.notes).map(id => units.find(u => u.id === id)?.title).filter(Boolean).join('、') : null,
    '- 單字：已認得 ' + state.knownWords.length + ' 個，待學 ' + state.learningWords.length + ' 個。',
    '',
    '## 最近做過的句子',
    ...(recent.length ? recent.map(t => {
      const s = byId.get(t.sentenceId)
      return '- ' + t.day + '「' + (s?.zh ?? t.sentenceId) + '」→ ' + (ratingNames[t.rating] ?? t.rating) + (t.revealed ? '（有看提示）' : '') + (s ? '；參考：' + s.reference[0] : '')
    }) : ['- 這台裝置還沒有作答紀錄。']),
    '',
    '## 文法狀態',
    '- 比較穩：' + ([...solid.keys()].filter(g => !weak.has(g)).join('、') || '還沒有足夠紀錄'),
    '- 還常錯：' + ([...weak.keys()].join('、') || '還沒有足夠紀錄'),
    '',
    '## 教我的規則（請照做）',
    ...teachingRules.map((rule, i) => (i + 1) + '. ' + rule),
    '',
    '## 單字的背法',
    '- 第 1、2 級先快篩：認得的跳過，不認得的才背。',
    '- 一個字先記最常用的意思，其他意思在句子裡遇到再學。',
  ]
  const kept = lines.filter((line): line is string => line !== null)
  return kept.filter((line, i) => line !== '' || kept[i - 1] !== '').join('\n')
}
/** The CEFR ladder for whoever takes over: the level a certificate shows, the step being studied and its exam. */
function levelLine(state: AppState) {
  const level = officialLevel(state.notes)
  const { step } = courseProgress(state.curriculum.unit)
  const status = certStatus(state.notes, step.to)
  const gate = unitGate(state.notes, state.curriculum.unit)
  return '- 程度：證照上是 ' + level + '；課程在 ' + step.from + '→' + step.to + '，這一段結束要考' + exams[step.exams[0]].name
    + (status.state === 'waiting' && status.next ? '（已報名，' + status.next.date + ' 考）' : '')
    + (gate ? '。單元 ' + state.curriculum.unit + ' 要等' + exams[gate.exams[0]].name + '報名或考過才開。' : '。')
    + '每天 1.5 小時（週一到六），寒假 3–4 小時。'
}

/** A bridge unit also has a skills pack and a held-out test; the first test result tells another teacher how well it carries over. */
function packLine(state: AppState) {
  const u = state.curriculum.unit
  if (!hasPack(u)) return null
  const h = readHeld(state.notes, u)
  const part = (name: string, p?: HeldPart) => p ? name + ' ' + p.correct + '/' + p.total : null
  const done = [part('閱讀', h.reading), part('聽力', h.listening)].filter(Boolean)
  return '- 這是 B1→B2 橋接單元，另有一包讀聽說寫（兩篇閱讀、一段聽力、兩題段落寫作、兩個口說任務）和一次沒看過的回測' + (done.length ? '；回測第一次成績：' + done.join('、') : '（第 6 天開放）') + '。'
}
