import { useRef, useState } from 'react'
import { Mic, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { dayKey } from '../lib/progress'
import { askTutor, tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import './baseline.css'

import { addResult, cefrOf, forms, nextForm, readResults, retestInfo, wordCount, type BaselineResult, type Q } from '../lib/baseline'
export type { BaselineResult } from '../lib/baseline'

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
  const results = readResults(state.notes)
  const formId = nextForm(results)
  const form = forms[formId]
  const retest = retestInfo(results, dayKey())
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
    const u = new SpeechSynthesisUtterance(form.listen)
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
        if (writing.trim()) writeFeedback = await askTutor(FEEDBACK, [{ role: 'user', content: '題目：' + form.write + '\n作品：' + writing }])
        if (transcript) speakFeedback = await askTutor(FEEDBACK + '（這是口說的語音辨識逐字稿，只評內容與文法，不評發音。）', [{ role: 'user', content: '題目：' + form.speak + '\n逐字稿（約 ' + seconds + ' 秒）：' + transcript }])
      }
    } catch { /* keep whatever we have */ }
    const result: BaselineResult = {
      form: formId, date: dayKey(), listening: score(form.listenQs, listen), reading: score(form.readQs, read),
      writing: { text: writing, feedback: writeFeedback },
      speaking: { transcript, feedback: speakFeedback, seconds },
    }
    update(prev => ({ ...prev, notes: addResult(prev.notes, result) }))
    setBusy(''); setOpen(false); setStep(0)
    setListen([]); setRead([]); setWriting(''); setAudio(null); setSeconds(0); setPlays(0)
  }

  if (results.length && !open) {
    const shown = results.length <= 4 ? results : [results[0], ...results.slice(-3)]
    const first = results[0], last = results[results.length - 1]
    const sign = (n: number) => (n > 0 ? '+' : '') + n
    const name = (r: BaselineResult) => r === first ? '起點' : '第 ' + results.indexOf(r) + ' 次回測'
    return <section className="bl-card">
      <header><strong>英文程度紀錄</strong><span>{retest.due ? '可以回測了' : '下次回測：' + retest.date + '（還有 ' + retest.days + ' 天）'}</span></header>
      <div className="bl-table-wrap"><table className="bl-table">
        <thead><tr><th scope="col"><span className="bl-sr">項目</span></th>{shown.map(r => <th scope="col" key={r.date + r.form}>{name(r)}<small>{r.date.slice(5).replace('-', '/')} · 題本 {r.form ?? 'A'}</small></th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">聽力</th>{shown.map(r => <td key={r.date}>{r.listening} / 3</td>)}</tr>
          <tr><th scope="row">閱讀</th>{shown.map(r => <td key={r.date}>{r.reading} / 3</td>)}</tr>
          <tr><th scope="row">寫作</th>{shown.map(r => <td key={r.date}>{wordCount(r.writing.text)} 字{cefrOf(r.writing.feedback) && <small>{cefrOf(r.writing.feedback)}</small>}</td>)}</tr>
          <tr><th scope="row">口說</th>{shown.map(r => <td key={r.date}>{r.speaking.seconds} 秒{r.speaking.transcript && <small>{wordCount(r.speaking.transcript)} 字{cefrOf(r.speaking.feedback) && ' · ' + cefrOf(r.speaking.feedback)}</small>}</td>)}</tr>
        </tbody>
      </table></div>
      {results.length > 1 && <p className="bl-delta">跟起點比：聽力 {sign(last.listening - first.listening)}、閱讀 {sign(last.reading - first.reading)}、寫作 {sign(wordCount(last.writing.text) - wordCount(first.writing.text))} 字、口說 {sign(last.speaking.seconds - first.speaking.seconds)} 秒</p>}
      <details><summary>看每次的作品和回饋</summary>
        {[...results].reverse().map(r => <div key={r.date + r.form} className="bl-past">
          <p className="bl-label">{name(r)} · {r.date} · 題本 {r.form ?? 'A'}</p>
          <p className="bl-label">寫作</p><p lang="en" className="bl-work">{r.writing.text || '（沒寫）'}</p>
          {r.writing.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
          <p className="bl-label">口說逐字稿</p><p lang="en" className="bl-work">{r.speaking.transcript || '（沒有逐字稿）'}</p>
          {r.speaking.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
        </div>)}
      </details>
      {retest.due
        ? <button type="button" className="bl-main" onClick={() => setOpen(true)}>開始第 {results.length} 次回測（新題本 {formId}，約 15 分鐘）</button>
        : <button type="button" className="bl-early" onClick={() => setOpen(true)}>想提早回測（新題本 {formId}）</button>}
      <small>每次換一份難度相近的新題本。單次小樣本，只拿來和自己比，不代表正式程度或雅思分數。</small>
    </section>
  }

  if (!open) return <section className="bl-card">
    <header><strong>先做一次起點測驗</strong><span>約 15 分鐘</span></header>
    <p>聽力、閱讀各 3 題，再寫幾句、講一分鐘。結果會留下來，12 週後用新題目比較，看自己到底進步多少。</p>
    <button type="button" className="bl-main" onClick={() => setOpen(true)}>開始</button>
  </section>

  const steps = ['聽力', '閱讀', '寫作', '口說']
  return <section className="bl-card">
    <header><strong>{results.length ? '回測（題本 ' + formId + '）' : '起點測驗'} · {steps[step]}</strong><span>{step + 1} / 4</span></header>
    <div className="bl-steps" aria-hidden="true">{steps.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
    {step === 0 && <>
      <p>聽一段語音留言（最多聽 2 次），再回答問題。先不要看文字。</p>
      <button type="button" className="bl-play" onClick={play} disabled={plays >= 2}><Volume2 size={16} />播放（剩 {2 - plays} 次）</button>
      <Quiz qs={form.listenQs} answers={listen} setAnswers={setListen} />
    </>}
    {step === 1 && <>
      <p lang="en" className="bl-passage">{form.read}</p>
      <Quiz qs={form.readQs} answers={read} setAnswers={setRead} />
    </>}
    {step === 2 && <>
      <p lang="en"><b>{form.write}</b></p>
      <p>不要查字典、不要用翻譯，寫得出多少就寫多少。</p>
      <textarea lang="en" rows={5} value={writing} onChange={e => setWriting(e.target.value)} placeholder="Yesterday I…" />
    </>}
    {step === 3 && <>
      <p lang="en"><b>{form.speak}</b></p>
      <p>按下錄音直接講，講完按停止。{openaiKey() ? '會用 OpenAI 轉成文字再請 Claude 給回饋。' : '（沒有 OpenAI 金鑰，只會記下長度。）'}</p>
      <button type="button" className={'bl-rec' + (recording ? ' on' : '')} onClick={record}>{recording ? <><Square size={15} fill="currentColor" />停止</> : <><Mic size={16} />{audio ? '重錄' : '錄音'}</>}</button>
      {audio && !recording && <p>錄好了，約 {seconds} 秒。</p>}
    </>}
    {busy && <p role="status">{busy}</p>}
    <div className="bl-nav">
      <button type="button" onClick={() => step ? setStep(step - 1) : setOpen(false)}>{step ? '上一步' : '取消'}</button>
      {step < 3
        ? <button type="button" className="bl-main" onClick={() => setStep(step + 1)}>下一步</button>
        : <button type="button" className="bl-main" disabled={!!busy && busy !== '麥克風被擋住了，可以先略過口說。'} onClick={finish}>{results.length ? '完成，存這次結果' : '完成，存起點'}</button>}
    </div>
  </section>
}
