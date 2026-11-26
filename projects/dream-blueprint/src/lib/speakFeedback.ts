import { weakLabelPrompt } from './weakPoints'

/** After a chat with Emma, Claude reads the transcript and answers in a fixed format, one kind of line each:
 *  how often today's grammar was used, up to three corrections (they go into review by themselves), one sentence for
 *  next time and one line of encouragement. */
export interface SpeakFix { wrong: string; en: string; zh: string; why: string; tag?: string }
export interface SpeakFeedback { used?: { n: number; example: string }; fixes: SpeakFix[]; next?: { en: string; zh: string }; cheer?: string; rest: string }

export function speakFeedbackPrompt(focus: { label: string; rule: string }, name: string) {
  return [
    `你是 ${name} 的口說小幫手。下面是玄燁剛剛跟美國朋友 ${name} 用英文聊天的逐字稿（語音辨識，可能有小錯字，辨識錯的字不要算他錯）。`,
    '這次要注意的文法：' + focus.label + (focus.rule ? '（規則：' + focus.rule + '）' : '') + '。',
    '照下面的固定格式回覆，每一種一行，不要寫其他文字，不要用 Markdown：',
    '[用了] 他這次說對「' + focus.label + '」的次數（只寫阿拉伯數字） ||| 他說對的其中一句英文原句（一次都沒有就寫：無）',
    '[卡] 他說錯或不自然的句子原句 ||| 正確自然的英文 ||| 這句的中文意思 ||| 一句繁體中文原因 ||| 弱點名稱',
    '（[卡] 最多 3 行，挑最值得記住的錯，先挑跟這次文法有關的；沒有錯就不要寫 [卡]）',
    '[下次] 一句下次聊天可以用的英文句子，要用到這次的文法，難度跟他現在差不多 ||| 這句的中文意思',
    '[鼓勵] 一句繁體中文的鼓勵，具體說他這次哪裡做得好，口氣像好朋友',
    '弱點名稱照抄這份清單裡最符合的一個：' + weakLabelPrompt(),
  ].join('\n')
}

const field = (s: string | undefined) => (s ?? '').trim()

/** Reads the fixed format. Lines it does not know are kept in `rest`, so nothing Claude wrote is lost. */
export function parseSpeakFeedback(text: string): SpeakFeedback {
  const out: SpeakFeedback = { fixes: [], rest: '' }
  const rest: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = line.match(/^\[(用了|卡|下次|鼓勵)\]\s*(.*)$/)
    if (!m) { if (line) rest.push(line); continue }
    const parts = m[2].split('|||').map(field)
    if (m[1] === '用了') {
      const n = Number((parts[0].match(/\d+/) ?? ['0'])[0])
      out.used = { n, example: /^無$|^none$/i.test(parts[1] ?? '') ? '' : field(parts[1]) }
    } else if (m[1] === '卡') {
      if (parts.length >= 4 && parts[0] && parts[1] && out.fixes.length < 3)
        out.fixes.push({ wrong: parts[0], en: parts[1], zh: parts[2], why: parts[3], ...(parts[4] ? { tag: parts[4] } : {}) })
    } else if (m[1] === '下次') {
      if (parts[0]) out.next = { en: parts[0], zh: field(parts[1]) }
    } else if (parts[0]) out.cheer = parts.join(' ')
  }
  out.rest = rest.join('\n')
  return out
}

/** Whether Claude's reply is the feedback it was asked for. A chat needs the 用了, 下次 and 鼓勵 lines (a reply cut off
 *  or written as free text has none of them); IELTS Part 2 needs its three judged lines and the fixed line about fluency
 *  and pronunciation. Anything less is no feedback: nothing is saved, and the same transcript can be sent again. */
export function speakFeedbackOk(fb: SpeakFeedback, part2: boolean): boolean {
  if (!part2) return !!fb.used && !!fb.next && !!fb.cheer
  const lines = fb.rest.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.length >= 4 && lines.some(l => l.includes('流暢度和發音'))
}
