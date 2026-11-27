import { forms, identifiedResults, setResultFeedback, setResultTranscript, speakingFeedbackOk, writingFeedbackOk } from './baseline'
import { claimReview, closeReview, receiveReview, reviewTimeout } from './pendingReview'
import { transcribe } from './speech'
import { readStoreForCloud, updateStoreNow } from './store'
import { askTutor, tutorKey } from './tutor'
import { openaiKey } from './voice'

const writingInstructions = '你是英文老師，評一位台灣護理系學生（英文約國中程度）的作品。用繁體中文、口語、很短：第一行寫「大約 CEFR ○○ 左右（只是單次小樣本，不是正式程度）」；接著兩個做得好的地方、兩個最該先改的地方（附正確寫法）。總共不超過 6 行，不要 Markdown 標題。'
const speakingInstructions = '你是英文老師。下面是一位台灣護理系學生（英文約國中程度）口說的語音辨識逐字稿，可能有辨識錯字。用繁體中文、口語、很短：第一行固定寫「只看逐字稿：發音、流暢度和停頓沒有評估」；接著兩個做得好的地方（內容、用字、文法）、兩個最該先改的地方（附正確說法）。不要寫 CEFR、雅思分數或任何等級。總共不超過 6 行，不要 Markdown 標題。'

type Part = 'writing' | 'speaking'
type Receipt = { state: 'received'; token: string; value: { reply: string } }
// Keep a received reply in this tab too, in case the database was blocked after Claude answered.
const receivedFeedback = new Map<string, Receipt>()
const pendingTranscripts = new Map<string, string>()
const transcribing = new Map<string, Promise<string>>()
// Keep only the most recent failed upload on this open tab. Neither progress nor Drive receives the audio.
let pendingRecording: { id: string; audio: Blob; submittedAt: number } | undefined
const transcriptListeners = new Set<() => void>()
const notifyTranscripts = () => transcriptListeners.forEach(listener => listener())

export function subscribeBaselineTranscripts(listener: () => void) {
  transcriptListeners.add(listener)
  return () => { transcriptListeners.delete(listener) }
}

async function withDeadline<T>(request: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(new Error('等候回覆逾時。')), reviewTimeout)
  try {
    const result = await request(controller.signal)
    controller.signal.throwIfAborted()
    return result
  } finally { clearTimeout(timer) }
}

async function savedResult(id: string) {
  const { state } = await readStoreForCloud()
  const result = identifiedResults(state.notes).find(item => item.id === id)
  if (!result) throw new Error('找不到原本那次作答，請先確認程式中的程度紀錄。')
  return result
}

export function pendingBaselineTranscript(id: string) {
  if (pendingTranscripts.has(id)) return 'save'
  if (pendingRecording?.id === id) return 'upload'
}

export function saveBaselineTranscript(id: string, audio?: Blob) {
  const running = transcribing.get(id)
  if (running) return running
  const pending = transcribeResult(id, audio).finally(() => transcribing.delete(id))
  transcribing.set(id, pending)
  return pending
}

async function transcribeResult(id: string, originalAudio?: Blob) {
  const saved = await savedResult(id)
  let transcript = saved.speaking.transcript.trim() || pendingTranscripts.get(id)
  const audio = originalAudio ?? (pendingRecording?.id === id ? pendingRecording.audio : undefined)
  if (!transcript && audio) {
    try {
      if (!openaiKey()) throw new Error('請先到口說設定連接 OpenAI。')
      transcript = await withDeadline(signal => transcribe(audio, signal))
      if (!/\p{L}|\p{N}/u.test(transcript)) throw new Error('這次沒有辨識出可用的口說文字。')
    } catch (error) {
      const submittedAt = saved.submittedAt ?? 0
      if (!pendingRecording || submittedAt >= pendingRecording.submittedAt) {
        pendingRecording = { id, audio, submittedAt }
        notifyTranscripts()
      }
      throw error
    }
  }
  if (!transcript) throw new Error('已沒有待處理的錄音或逐字稿。')
  if (pendingRecording?.id === id) {
    pendingRecording = undefined
    notifyTranscripts()
  }
  try {
    const state = await updateStoreNow(prev => {
      const notes = setResultTranscript(prev.notes, id, transcript)
      return notes === prev.notes ? prev : { ...prev, notes }
    })
    const written = identifiedResults(state.notes).find(item => item.id === id)?.speaking.transcript
    if (!written) throw new Error('找不到原本那次作答。')
    if (pendingTranscripts.delete(id)) notifyTranscripts()
    return written
  } catch (error) {
    pendingTranscripts.set(id, transcript)
    notifyTranscripts()
    throw error
  }
}

/** Automatic and manual grading claim the same attempt and section before making a paid request. */
export async function requestBaselineFeedback(id: string, part: Part, confirm = false) {
  const key = `${id}:${part}`
  const first = await savedResult(id)
  if (first[part].feedback.trim()) return 'saved'
  const claim = receivedFeedback.get(key) ?? await claimReview(key, confirm, !!tutorKey())
  if (claim.state === 'busy' || claim.state === 'confirm' || claim.state === 'unconfigured') return claim.state

  let feedback: string
  if (claim.state === 'received') feedback = claim.value.reply
  else {
    let work: Awaited<ReturnType<typeof savedResult>>
    try { work = await savedResult(id) }
    catch (error) { await closeReview(key, claim.token).catch(() => undefined); throw error }
    if (work[part].feedback.trim()) {
      await closeReview(key, claim.token).catch(() => undefined)
      return 'saved'
    }
    if (Date.now() >= claim.until - reviewTimeout) {
      await closeReview(key, claim.token).catch(() => undefined)
      throw new Error('等待本機紀錄太久，尚未送出。請從這筆紀錄重試。')
    }
    const form = forms[work.form ?? 'A']
    const writing = part === 'writing'
    const input = writing ? work.writing.text.trim() : work.speaking.transcript.trim()
    if (!input) {
      await closeReview(key, claim.token).catch(() => undefined)
      throw new Error('這一項還沒有可以送出的作品。')
    }
    const entry = writing ? `題目：${form.write}\n作品：${input}` : `題目：${form.speak}\n逐字稿（約 ${work.speaking.seconds} 秒）：${input}`
    try {
      feedback = (await withDeadline(signal => askTutor(writing ? writingInstructions : speakingInstructions,
        [{ role: 'user', content: entry }], signal))).trim()
    } catch (error) {
      await closeReview(key, claim.token, true).catch(() => undefined)
      throw error
    }
    if (!(writing ? writingFeedbackOk(feedback) : speakingFeedbackOk(feedback))) {
      await closeReview(key, claim.token).catch(() => undefined)
      throw new Error('Claude 這次沒有照回饋格式，請再試一次。')
    }
    const receipt = { state: 'received', token: claim.token, value: { reply: feedback } } as const
    receivedFeedback.set(key, receipt)
    await receiveReview(key, claim.token, receipt.value).catch(() => undefined)
  }
  try {
    const state = await updateStoreNow(prev => {
      const notes = setResultFeedback(prev.notes, id, part, feedback)
      return notes === prev.notes ? prev : { ...prev, notes }
    })
    if (!identifiedResults(state.notes).some(item => item.id === id && item[part].feedback.trim())) throw new Error()
  } catch {
    throw new Error('已收到回饋，暫時無法存入。再按一次只會重試儲存這份回覆。')
  }
  receivedFeedback.delete(key)
  await closeReview(key, claim.token).catch(() => undefined)
  return 'saved'
}
