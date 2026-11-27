import DraftVersions from './DraftVersions'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, Mic, Square, Volume2 } from 'lucide-react'
import { updateStoreNow, type PageProps } from '../lib/store'
import { dayKey, daysBetween } from '../lib/progress'
import { askTutor, tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import { useModal } from '../lib/modal'
import { captureDraftCleanup, readDraft, writeDraft } from '../lib/drafts'
import { speakEnglishResult } from '../lib/tts'
import './baseline.css'

import { addResult, cefrOf, emptyCheck, forms, formSeen, identifiedResults, laterKey, makeBaselineId, nextForm, readResults, retestInfo, sectionScore, setResultFeedback, speakingFeedbackOk, wordCount, writingFeedbackOk, type BaselineResult, type Form, type FormId, type Q } from '../lib/baseline'
export type { BaselineResult } from '../lib/baseline'

/** Pops up on the home page when the level test is due. Either button keeps it away for the rest of the day; while it is due,
 *  the 英文練習 page also has a row that opens the test. */
export function TestPrompt({ state, update, today }: Pick<PageProps, 'state' | 'update'> & { today: string }) {
  const last = readResults(state.notes).at(-1)
  const start = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const later = () => update(prev => ({ ...prev, notes: { ...prev.notes, [laterKey]: today } }))
  // The shared dialog handling: the page behind goes inert, Tab stays in the dialog, Escape closes it.
  useModal(box, later, { initial: () => start.current, fallback: () => document.getElementById('content') })
  return <div className="bl-pop" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bl-pop-title">
    <section className="bl-pop-card">
      <span className="bl-pop-icon" aria-hidden="true"><Gauge size={22} /></span>
      <strong id="bl-pop-title">{last ? '英文程度回測的時間到了' : '先做一次起點測驗'}</strong>
      <p>{last
        ? '上次測驗是 ' + last.date + '，已經過了 ' + Math.floor(daysBetween(last.date, today) / 7) + ' 週。花大約 15 分鐘再測一次，看看自己進步了多少。'
        : '聽力、閱讀各 3 題，再寫幾句、講一分鐘，大約 15 分鐘。結果會留下來，12 週後再比一次。'}</p>
      <div className="bl-pop-actions">
        <button type="button" ref={start} className="bl-main" onClick={() => { later(); location.hash = 'leveltest' }}>開始測驗</button>
        <button type="button" onClick={later}>今天先不要</button>
      </div>
    </section>
  </div>
}

/** The listening clip after the test: English, Chinese and the right answers, so he can see what he missed. */
function ListenScript({ form }: { form: (typeof forms)[keyof typeof forms] }) {
  return <>
    <p className="bl-label">聽力稿</p>
    <p lang="en" className="bl-work">{form.listen}</p>
    <p className="bl-work">{form.listenZh}</p>
    <ol className="bl-key">{form.listenQs.map(q => <li key={q.q}><span lang="en">{q.q}</span> → <b lang="en">{q.options[q.answer]}</b></li>)}</ol>
  </>
}

const FEEDBACK ='你是英文老師，評一位台灣護理系學生（英文約國中程度）的作品。用繁體中文、口語、很短：第一行寫「大約 CEFR ○○ 左右（只是單次小樣本，不是正式程度）」；接著兩個做得好的地方、兩個最該先改的地方（附正確寫法）。總共不超過 6 行，不要 Markdown 標題。'

// A transcript shows words and grammar only: no level, no pronunciation, no fluency estimate from it.
const SPEAK_FEEDBACK = '你是英文老師。下面是一位台灣護理系學生（英文約國中程度）口說的語音辨識逐字稿，可能有辨識錯字。用繁體中文、口語、很短：第一行固定寫「只看逐字稿：發音、流暢度和停頓沒有評估」；接著兩個做得好的地方（內容、用字、文法）、兩個最該先改的地方（附正確說法）。不要寫 CEFR、雅思分數或任何等級。總共不超過 6 行，不要 Markdown 標題。'

/** Claude's comment on the test's writing, only in the asked-for form (otherwise nothing is kept and he can ask again). */
async function writingFeedback(form: Form, text: string) {
  const reply = await askTutor(FEEDBACK, [{ role: 'user', content: '題目：' + form.write + '\n作品：' + text }])
  if (!writingFeedbackOk(reply)) throw new Error('Claude 這次沒有照格式回（第一行要寫大約 CEFR 幾級，再列做得好和要改的地方），這次不存，再按一次。')
  return reply.trim()
}
async function speakingFeedback(form: Form, transcript: string, seconds: number) {
  const reply = await askTutor(SPEAK_FEEDBACK, [{ role: 'user', content: '題目：' + form.speak + '\n逐字稿（約 ' + seconds + ' 秒）：' + transcript }])
  if (!speakingFeedbackOk(reply)) throw new Error('Claude 這次沒有照格式回（第一行要寫只看逐字稿，再列做得好和要改的地方），這次不存，再按一次。')
  return reply.trim()
}
/** A comment that didn't come (Claude out of reach, a reply in the wrong form): asked for again on the saved work. */
function AskAgain({ label, ask, onSave }: { label: string; ask: () => Promise<string>; onSave: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return <div className="bl-again">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setErr('')
      try { onSave(await ask()) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
    }}>{busy ? 'Claude 在看……' : label}</button>
    {err && <small role="alert">{err}</small>}
  </div>
}

function Quiz({ qs, answers, setAnswers }: { qs: Q[]; answers: number[]; setAnswers: (a: number[]) => void }) {
  return <ol className="bl-qs">{qs.map((q, i) => <li key={i}>
    <p lang="en">{q.q}</p>
    <div>{q.options.map((o, j) => <label key={j} className={answers[i] === j ? 'on' : ''}>
      <input type="radio" name={'q' + qs[0].q + i} checked={answers[i] === j} onChange={() => { const a = [...answers]; a[i] = j; setAnswers(a) }} />
      <span lang="en">{o}</span>
    </label>)}</div>
  </li>)}</ol>
}

interface PreparedResult {
  result: BaselineResult
  cleanup: () => void
  missed: string[]
}

export default function Baseline({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const results = useMemo(() => identifiedResults(state.notes), [state.notes])
  const [attempt, setAttempt] = useState<{ formId: FormId; retest: boolean } | null>(null)
  const formId = attempt?.formId ?? nextForm(results)
  const form = forms[formId]
  const retest = retestInfo(results, dayKey())
  const [step, setStep] = useState(0)
  const [plays, setPlays] = useState(0)
  // Plays that were heard to the end: pressing 播放 alone is not having listened (a cut-off clip is not counted).
  const [heard, setHeard] = useState(0)
  const listeningPlayback = useRef<AbortController | null>(null)
  const stopListening = useCallback(() => {
    listeningPlayback.current?.abort()
    listeningPlayback.current = null
  }, [])
  const [notice, setNotice] = useState('')
  const [listen, setListen] = useState<number[]>([])
  const [read, setRead] = useState<number[]>([])
  // What he wrote stays on this device until the test is saved (leaving the page or closing the test keeps it).
  const draftKey = 'baseline.write.' + formId
  const [writing, setWriting] = useState('')
  const [recording, setRecording] = useState(false)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [seconds, setSeconds] = useState(0)
  // A message (skipped everything, microphone blocked) and saving are kept apart: a message never locks the button.
  const [busy, setBusy] = useState('')
  const [saving, setSaving] = useState(false)
  const saveInProgress = useRef(false)
  const preparedResult = useRef<PreparedResult | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const started = useRef(0)
  const alive = useRef(true)
  // Each press of 錄音 is one request; going back a step or finishing cancels a request still waiting for permission.
  const asking = useRef(0)
  const activeRequest = useRef<number | null>(null)
  const [requesting, setRequesting] = useState(false)
  const dropRequest = () => { activeRequest.current = null; setRequesting(false) }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopListening()
      activeRequest.current = null
      const current = recorder.current
      recorder.current = null
      if (current?.state === 'recording') current.stop()
      stream.current?.getTracks().forEach(t => t.stop())
      stream.current = null
    }
  }, [stopListening])

  function start() {
    stopListening()
    setAttempt({ formId, retest: results.length > 0 })
    setStep(0); setNotice(''); setBusy('')
    setPlays(0); setHeard(0); setListen([]); setRead([])
    setWriting(readDraft(draftKey))
    setAudio(null); setSeconds(0)
  }
  async function play() {
    if (plays >= 2) return
    stopListening()
    const controller = new AbortController()
    listeningPlayback.current = controller
    setBusy('')
    setPlays(n => n + 1)
    const outcome = await speakEnglishResult(form.listen, 0.9, controller.signal)
    if (listeningPlayback.current !== controller) return
    listeningPlayback.current = null
    if (outcome === 'played') setHeard(n => n + 1)
    else setBusy('這次沒有播完，可以在剩餘次數內再試。')
  }
  function back() {
    dropRequest()
    if (recorder.current?.state === 'recording') recorder.current.stop()
    setBusy('')
    if (step) setStep(step - 1)
    else {
      stopListening()
      setAttempt(null)
    }
  }
  function next() {
    if (step === 0) stopListening()
    setBusy('')
    setStep(step + 1)
  }
  async function record() {
    if (saveInProgress.current || activeRequest.current !== null) return
    if (recorder.current) {
      if (recorder.current.state === 'recording') recorder.current.stop()
      return
    }
    const mine = ++asking.current
    activeRequest.current = mine
    setRequesting(true)
    let media: MediaStream | null = null
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Permission came back after leaving the test, going back a step or finishing: nothing is recorded.
      if (!alive.current || activeRequest.current !== mine || saveInProgress.current) {
        media.getTracks().forEach(t => t.stop())
        return
      }
      const got = media
      const chunks: Blob[] = []
      const r = new MediaRecorder(got)
      r.ondataavailable = e => chunks.push(e.data)
      r.onstop = () => {
        got.getTracks().forEach(t => t.stop())
        if (!alive.current || recorder.current !== r) return
        recorder.current = null
        stream.current = null
        setAudio(new Blob(chunks, { type: r.mimeType }))
        setSeconds(Math.round((Date.now() - started.current) / 1000))
        setRecording(false)
      }
      started.current = Date.now()
      r.start()
      recorder.current = r
      stream.current = got
      dropRequest()
      setRecording(true)
    } catch {
      // The microphone opened but the recorder could not start: close it again.
      media?.getTracks().forEach(t => t.stop())
      if (alive.current && activeRequest.current === mine) {
        dropRequest()
        setBusy('錄音開不起來（麥克風被擋住或這個瀏覽器不能錄），可以先略過口說。')
      }
    }
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
  async function saveResult(prepared: PreparedResult) {
    saveInProgress.current = true
    if (alive.current) { setSaving(true); setBusy('儲存這次結果……') }
    const { result, cleanup, missed } = prepared
    try {
      await updateStoreNow(prev => {
        const saved = identifiedResults(prev.notes)
        if (saved.some(item => item.id === result.id)) return prev
        return { ...prev, notes: addResult(prev.notes, {
          ...result, ...(formSeen(saved, result.form ?? 'A') ? { repeat: true } : {}),
        }) }
      })
    } catch {
      if (alive.current) {
        setBusy('這次結果尚未存入。請確認瀏覽器空間，再按「重新儲存結果」。')
        setSaving(false)
      }
      return
    } finally {
      saveInProgress.current = false
    }
    cleanup()
    preparedResult.current = null
    if (!alive.current) return
    setBusy(''); setSaving(false); setAttempt(null)
    setNotice(missed.length ? '結果存好了，但這次沒拿到：' + missed.join('、') + '。Claude 的回饋可以在下面「看每次的聽力稿、作品和回饋」裡按「請 Claude 看」補上。' : '')
  }

  async function finish() {
    if (!attempt || saveInProgress.current || recorder.current || activeRequest.current !== null) return
    if (preparedResult.current) { await saveResult(preparedResult.current); return }
    // Skipped parts are 缺測 (null), not zero; a listening answer without playing the clip is not a listening score.
    const listening = heard ? sectionScore(form.listenQs, listen) : null
    const reading = sectionScore(form.readQs, read)
    if (emptyCheck({ listening, reading, writing: { text: writing, feedback: '' }, speaking: { transcript: '', feedback: '', seconds: audio ? seconds : 0 } })) {
      setBusy('這次每一項都跳過了：沒有存結果，題本也沒有用掉。回上一步補做一項，就可以存。'); return
    }
    saveInProgress.current = true
    dropRequest()
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    setSaving(true); setBusy('整理結果中……')
    const id = makeBaselineId()
    const cleanup = captureDraftCleanup(draftKey, writing)
    let transcript = '', speakFeedback = '', writeFeedback = ''
    // Each part on its own: a failed transcript or comment never takes the others with it.
    const missed: string[] = []
    if (audio) {
      try { transcript = await transcribe(audio) } catch { /* below */ }
      if (!transcript) missed.push(openaiKey() ? '口說沒有轉成文字（這次只記秒數）' : '沒有 OpenAI 金鑰，口說沒有轉成文字（這次只記秒數）')
    }
    if (tutorKey()) {
      if (writing.trim()) { try { writeFeedback = await writingFeedback(form, writing) } catch { missed.push('寫作的 Claude 回饋') } }
      if (transcript) { try { speakFeedback = await speakingFeedback(form, transcript, seconds) } catch { missed.push('口說的 Claude 回饋') } }
    }
    const prepared = {
      result: {
        id, form: formId, date: dayKey(), listening, plays: heard, reading,
        writing: { text: writing, feedback: writeFeedback },
        speaking: { transcript, feedback: speakFeedback, seconds },
      },
      cleanup,
      missed,
    }
    preparedResult.current = prepared
    await saveResult(prepared)
  }

  if (results.length && !attempt) {
    const shown = results.length <= 4 ? results : [results[0], ...results.slice(-3)]
    const first = results[0], last = results[results.length - 1]
    const sign = (n: number) => (n > 0 ? '+' : '') + n
    const name = (r: (typeof results)[number]) => r === first ? '起點' : '第 ' + results.indexOf(r) + ' 次回測'
    return <section className="bl-card">
      {notice && <p className="bl-note" role="status">{notice}</p>}
      <header><strong>英文程度紀錄</strong><span>{retest.due ? '可以回測了' : '下次回測：' + retest.date + '（還有 ' + retest.days + ' 天）'}</span></header>
      <div className="bl-table-wrap"><table className="bl-table">
        <thead><tr><th scope="col"><span className="bl-sr">項目</span></th>{shown.map(r => <th scope="col" key={r.id}>{name(r)}<small>{r.date.slice(5).replace('-', '/')} · 題本 {r.form ?? 'A'}{r.repeat ? '（做過）' : ''}</small></th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">聽力</th>{shown.map(r => <td key={r.id}>{r.listening === null ? '缺測' : r.listening + ' / 3'}{r.plays !== undefined && r.listening !== null && <small>聽了 {r.plays} 次</small>}</td>)}</tr>
          <tr><th scope="row">閱讀</th>{shown.map(r => <td key={r.id}>{r.reading === null ? '缺測' : r.reading + ' / 3'}</td>)}</tr>
          <tr><th scope="row">寫作</th>{shown.map(r => <td key={r.id}>{r.writing.text.trim() ? wordCount(r.writing.text) + ' 字' : '缺測'}{cefrOf(r.writing.feedback) && <small>{cefrOf(r.writing.feedback)}</small>}</td>)}</tr>
          <tr><th scope="row">口說</th>{shown.map(r => <td key={r.id}>{r.speaking.seconds ? r.speaking.seconds + ' 秒' : '缺測'}{r.speaking.transcript && <small>{wordCount(r.speaking.transcript)} 字</small>}</td>)}</tr>
        </tbody>
      </table></div>
      {results.length > 1 && <p className="bl-delta">跟起點比（題目不同，只當參考；缺測的不比）：{[
        first.listening !== null && last.listening !== null ? '聽力 ' + sign(last.listening - first.listening) : '',
        first.reading !== null && last.reading !== null ? '閱讀 ' + sign(last.reading - first.reading) : '',
        first.writing.text.trim() && last.writing.text.trim() ? '寫作 ' + sign(wordCount(last.writing.text) - wordCount(first.writing.text)) + ' 字' : '',
        first.speaking.seconds && last.speaking.seconds ? '口說 ' + sign(last.speaking.seconds - first.speaking.seconds) + ' 秒' : '',
      ].filter(Boolean).join('、') || '還沒有兩次都做的項目'}{last.repeat ? '。這次的題本以前做過，分數會偏高。' : ''}</p>}
      <details open={last.date === dayKey()}><summary>看每次的聽力稿、作品和回饋</summary>
        {[...results].reverse().map(r => <div key={r.id} className="bl-past">
          <p className="bl-label">{name(r)} · {r.date} · 題本 {r.form ?? 'A'}</p>
          <ListenScript form={forms[r.form ?? 'A']} />
          <p className="bl-label">寫作</p><p lang="en" className="bl-work">{r.writing.text || '（沒寫）'}</p>
          {r.writing.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
          {r.writing.text.trim() && !r.writing.feedback && tutorKey() && <AskAgain label="請 Claude 看這篇寫作" ask={() => writingFeedback(forms[r.form ?? 'A'], r.writing.text)}
            onSave={t => update(prev => ({ ...prev, notes: setResultFeedback(prev.notes, r.id, 'writing', t) }))} />}
          <p className="bl-label">口說逐字稿</p><p lang="en" className="bl-work">{r.speaking.transcript || '（沒有逐字稿）'}</p>
          {r.speaking.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
          {r.speaking.transcript.trim() && !r.speaking.feedback && tutorKey() && <AskAgain label="請 Claude 看這段口說" ask={() => speakingFeedback(forms[r.form ?? 'A'], r.speaking.transcript, r.speaking.seconds)}
            onSave={t => update(prev => ({ ...prev, notes: setResultFeedback(prev.notes, r.id, 'speaking', t) }))} />}
        </div>)}
      </details>
      {retest.due
        ? <button type="button" className="bl-main" onClick={start}>開始第 {results.length} 次回測（{formSeen(results, formId) ? '題本 ' + formId + '，以前做過' : '新題本 ' + formId}，約 15 分鐘）</button>
        : <button type="button" className="bl-early" onClick={start}>想提早回測（{formSeen(results, formId) ? '題本 ' + formId + '，以前做過' : '新題本 ' + formId}）</button>}
      <small>每次換一份新題本，題型、長度和作答條件都一樣（聽力最多聽 2 次、不看字；寫作和口說不查字典、不用翻譯）。題目不同，差一兩題可能只是題目難易，比較「寫得多不多、說得長不長、需要的幫忙有沒有變少」更準。只拿來和自己比，不代表正式程度或雅思分數。</small>
    </section>
  }

  if (!attempt) return <section className="bl-card">
    <header><strong>先做一次起點測驗</strong><span>約 15 分鐘</span></header>
    <p>聽力、閱讀各 3 題，再寫幾句、講一分鐘。結果會留下來，12 週後用新題目比較，看自己到底進步多少。</p>
    <button type="button" className="bl-main" onClick={start}>開始</button>
  </section>

  const steps = ['聽力', '閱讀', '寫作', '口說']
  return <section className="bl-card">
    <header><strong>{attempt.retest ? '回測（題本 ' + formId + '）' : '起點測驗'} · {steps[step]}</strong><span>{step + 1} / 4</span></header>
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
      <textarea lang="en" rows={5} value={writing} onChange={e => { setWriting(e.target.value); writeDraft(draftKey, e.target.value) }} placeholder="Yesterday I…" />
      <DraftVersions id={draftKey} text={writing} onChoose={setWriting} />
    </>}
    {step === 3 && <>
      <p lang="en"><b>{form.speak}</b></p>
      <p>按下錄音直接講，講完按停止。{openaiKey() ? '會用 OpenAI 轉成文字再請 Claude 給回饋。' : '（沒有 OpenAI 金鑰，只會記下長度。）'}</p>
      <button type="button" className={'bl-rec' + (recording ? ' on' : '')} disabled={requesting || saving || !!preparedResult.current} onClick={record}>{recording ? <><Square size={15} fill="currentColor" />停止</> : requesting ? <><Mic size={16} />等麥克風允許……</> : <><Mic size={16} />{audio ? '重錄' : '錄音'}</>}</button>
      {audio && !recording && <p>錄好了，約 {seconds} 秒。</p>}
      {recording && <p>講完先按「停止」，再按完成。</p>}
    </>}
    {busy && <p role="status">{busy}</p>}
    <div className="bl-nav">
      <button type="button" disabled={saving || !!preparedResult.current} onClick={back}>{step ? '上一步' : '取消'}</button>
      {step < 3
        ? <button type="button" className="bl-main" onClick={next}>下一步</button>
        : <button type="button" className="bl-main" disabled={saving || recording || requesting} onClick={finish}>{preparedResult.current && !saving ? '重新儲存結果' : attempt.retest ? '完成，存這次結果' : '完成，存起點'}</button>}
    </div>
  </section>
}
