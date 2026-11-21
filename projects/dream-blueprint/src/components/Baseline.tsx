import { useRef, useState } from 'react'
import { Mic, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { addDays, dayKey } from '../lib/progress'
import { askTutor, tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import './baseline.css'

/** A short starting-point check (listening, reading, writing, speaking) to compare against in 12 weeks. */
export const baselineKey = 'baseline.v1'
export type BaselineResult = {
  date: string
  listening: number
  reading: number
  writing: { text: string; feedback: string }
  speaking: { transcript: string; feedback: string; seconds: number }
}
export function readBaseline(notes: Record<string, string>): BaselineResult | null {
  try { return notes[baselineKey] ? JSON.parse(notes[baselineKey]) : null } catch { return null }
}

type Q = { q: string; options: string[]; answer: number }
const LISTEN_TEXT = 'Hi, this is Amy from Green Valley Clinic. I am calling about your appointment on Thursday at ten a.m. The doctor is sick that day, so we need to change the time. We have two choices: Friday at two p.m., or next Monday at nine a.m. Please call us back before Wednesday at five p.m. Thank you.'
const LISTEN_QS: Q[] = [
  { q: 'Why is the clinic calling?', options: ['To change an appointment', 'To ask about your medicine', 'To talk about your bill'], answer: 0 },
  { q: 'Which time is NOT one of the new choices?', options: ['Friday at 2 p.m.', 'Monday at 9 a.m.', 'Thursday at 10 a.m.'], answer: 2 },
  { q: 'When should you call back?', options: ['On Thursday morning', 'Before Wednesday at 5 p.m.', 'Next Monday'], answer: 1 },
]
const READ_TEXT = 'Drinking enough water is important for your health. Most adults need about eight cups of water a day, but people who exercise or live in hot places may need more. If you do not drink enough, you can feel tired, get headaches, or have trouble thinking clearly. Some easy ways to drink more water are to carry a water bottle, drink a glass with every meal, and eat fruits like watermelon and oranges. However, people with some heart or kidney problems should ask their doctor how much water is right for them.'
const READ_QS: Q[] = [
  { q: 'What is the main idea?', options: ['Fruit is better than water', 'Water is good for you, and here is how to drink more', 'Everyone needs exactly the same amount of water'], answer: 1 },
  { q: 'Who may need more water?', options: ['People who sleep a lot', 'Only children', 'People who exercise'], answer: 2 },
  { q: 'Who should ask a doctor first?', options: ['People who like oranges', 'People with heart or kidney problems', 'People who carry a bottle'], answer: 1 },
]
const WRITE_PROMPT = 'Write 3–5 sentences: What did you do yesterday? How did you feel?'
const SPEAK_PROMPT = 'Talk for about one minute: introduce yourself — your name, your school, and why you want to be a nurse.'

const FEEDBACK = '你是英文老師，評一位台灣護理系學生（英文約國中程度）的作品。用繁體中文、口語、很短：第一行寫「大約 CEFR ○○ 左右（只是單次小樣本，不是正式程度）」；接著兩個做得好的地方、兩個最該先改的地方（附正確寫法）。總共不超過 6 行，不要 Markdown 標題。'

function Quiz({ qs, answers, setAnswers }: { qs: Q[]; answers: number[]; setAnswers: (a: number[]) => void }) {
  return <ol className="bl-qs">{qs.map((q, i) => <li key={i}>
    <p lang="en">{q.q}</p>
    <div>{q.options.map((o, j) => <label key={j} className={answers[i] === j ? 'on' : ''}>
      <input type="radio" name={'q' + qs[0].q + i} checked={answers[i] === j} onChange={() => { const a = [...answers]; a[i] = j; setAnswers(a) }} />
      <span lang="en">{o}</span>
    </label>)}</div>
  </li>)}</ol>
}

export default function Baseline({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const saved = readBaseline(state.notes)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [plays, setPlays] = useState(0)
  const [listen, setListen] = useState<number[]>([])
  const [read, setRead] = useState<number[]>([])
  const [writing, setWriting] = useState('')
  const [recording, setRecording] = useState(false)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const started = useRef(0)

  function play() {
    if (!('speechSynthesis' in window) || plays >= 2) return
    const u = new SpeechSynthesisUtterance(LISTEN_TEXT)
    u.lang = 'en-US'; u.rate = 0.9
    speechSynthesis.cancel(); speechSynthesis.speak(u)
    setPlays(plays + 1)
  }
  async function record() {
    if (recording) { recorder.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = e => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setAudio(new Blob(chunks, { type: r.mimeType }))
        setSeconds(Math.round((Date.now() - started.current) / 1000))
        setRecording(false)
      }
      recorder.current = r; started.current = Date.now(); r.start(); setRecording(true)
    } catch { setBusy('麥克風被擋住了，可以先略過口說。') }
  }
  async function transcribe(blob: Blob) {
    if (!openaiKey()) return ''
    const form = new FormData()
    form.append('file', blob, 'speaking.webm')
    form.append('model', 'gpt-4o-mini-transcribe')
    form.append('language', 'en')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + openaiKey() }, body: form })
    if (!res.ok) return ''
    return ((await res.json()).text as string) || ''
  }
  async function finish() {
    setBusy('整理結果中……')
    const score = (qs: Q[], a: number[]) => qs.filter((q, i) => a[i] === q.answer).length
    let transcript = '', speakFeedback = '', writeFeedback = ''
    try {
      if (audio) transcript = await transcribe(audio)
      if (tutorKey()) {
        if (writing.trim()) writeFeedback = await askTutor(FEEDBACK, [{ role: 'user', content: '題目：' + WRITE_PROMPT + '\n作品：' + writing }])
        if (transcript) speakFeedback = await askTutor(FEEDBACK + '（這是口說的語音辨識逐字稿，只評內容與文法，不評發音。）', [{ role: 'user', content: '題目：' + SPEAK_PROMPT + '\n逐字稿（約 ' + seconds + ' 秒）：' + transcript }])
      }
    } catch { /* keep whatever we have */ }
    const result: BaselineResult = {
      date: dayKey(), listening: score(LISTEN_QS, listen), reading: score(READ_QS, read),
      writing: { text: writing, feedback: writeFeedback },
      speaking: { transcript, feedback: speakFeedback, seconds },
    }
    update(prev => ({ ...prev, notes: { ...prev.notes, [baselineKey]: JSON.stringify(result) } }))
    setBusy(''); setOpen(false); setStep(0)
  }

  if (saved && !open) return <section className="bl-card">
    <header><strong>起點紀錄</strong><span>{saved.date} · 12 週後回測：{addDays(saved.date, 84)}</span></header>
    <div className="bl-scores">
      <div><b>{saved.listening}/3</b><small>聽力</small></div>
      <div><b>{saved.reading}/3</b><small>閱讀</small></div>
      <div><b>{saved.writing.text.trim().split(/\s+/).filter(Boolean).length}</b><small>寫作字數</small></div>
      <div><b>{saved.speaking.seconds}s</b><small>口說長度</small></div>
    </div>
    <details><summary>看我的作品和回饋</summary>
      <p className="bl-label">寫作</p><p lang="en" className="bl-work">{saved.writing.text || '（沒寫）'}</p>
      {saved.writing.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
      <p className="bl-label">口說逐字稿</p><p lang="en" className="bl-work">{saved.speaking.transcript || '（沒有逐字稿）'}</p>
      {saved.speaking.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
      <small>這是單次小樣本，只拿來和 12 週後比較，不代表正式程度或雅思分數。</small>
    </details>
  </section>

  if (!open) return <section className="bl-card">
    <header><strong>先做一次起點測驗</strong><span>約 15 分鐘</span></header>
    <p>聽力、閱讀各 3 題，再寫幾句、講一分鐘。結果會留下來，12 週後用新題目比較，看自己到底進步多少。</p>
    <button type="button" className="bl-main" onClick={() => setOpen(true)}>開始</button>
  </section>

  const steps = ['聽力', '閱讀', '寫作', '口說']
  return <section className="bl-card">
    <header><strong>起點測驗 · {steps[step]}</strong><span>{step + 1} / 4</span></header>
    <div className="bl-steps" aria-hidden="true">{steps.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
    {step === 0 && <>
      <p>聽一段語音留言（最多聽 2 次），再回答問題。先不要看文字。</p>
      <button type="button" className="bl-play" onClick={play} disabled={plays >= 2}><Volume2 size={16} />播放（剩 {2 - plays} 次）</button>
      <Quiz qs={LISTEN_QS} answers={listen} setAnswers={setListen} />
    </>}
    {step === 1 && <>
      <p lang="en" className="bl-passage">{READ_TEXT}</p>
      <Quiz qs={READ_QS} answers={read} setAnswers={setRead} />
    </>}
    {step === 2 && <>
      <p lang="en"><b>{WRITE_PROMPT}</b></p>
      <p>不要查字典、不要用翻譯，寫得出多少就寫多少。</p>
      <textarea lang="en" rows={5} value={writing} onChange={e => setWriting(e.target.value)} placeholder="Yesterday I…" />
    </>}
    {step === 3 && <>
      <p lang="en"><b>{SPEAK_PROMPT}</b></p>
      <p>按下錄音直接講，講完按停止。{openaiKey() ? '會用 OpenAI 轉成文字再請 Claude 給回饋。' : '（沒有 OpenAI 金鑰，只會記下長度。）'}</p>
      <button type="button" className={'bl-rec' + (recording ? ' on' : '')} onClick={record}>{recording ? <><Square size={15} fill="currentColor" />停止</> : <><Mic size={16} />{audio ? '重錄' : '錄音'}</>}</button>
      {audio && !recording && <p>錄好了，約 {seconds} 秒。</p>}
    </>}
    {busy && <p role="status">{busy}</p>}
    <div className="bl-nav">
      <button type="button" onClick={() => step ? setStep(step - 1) : setOpen(false)}>{step ? '上一步' : '取消'}</button>
      {step < 3
        ? <button type="button" className="bl-main" onClick={() => setStep(step + 1)}>下一步</button>
        : <button type="button" className="bl-main" disabled={!!busy && busy !== '麥克風被擋住了，可以先略過口說。'} onClick={finish}>完成，存起點</button>}
    </div>
  </section>
}
