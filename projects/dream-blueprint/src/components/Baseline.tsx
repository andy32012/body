import DraftVersions from './DraftVersions'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Gauge, Mic, Square, Volume2 } from 'lucide-react'
import { updateStoreNow, type PageProps } from '../lib/store'
import { dayKey, daysBetween } from '../lib/progress'
import { tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import { useModal } from '../lib/modal'
import { captureDraftCleanup, readDraft, writeDraft } from '../lib/drafts'
import { speakEnglishResult } from '../lib/tts'
import { pendingBaselineTranscript, requestBaselineFeedback, saveBaselineTranscript, subscribeBaselineTranscripts } from '../lib/baselineFeedback'
import './baseline.css'

import { addResult, cefrOf, emptyCheck, forms, formSeen, identifiedResults, laterKey, makeBaselineId, nextForm, readResults, retestInfo, sectionScore, wordCount, type BaselineResult, type FormId, type Q } from '../lib/baseline'
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

/** A retry on saved work will use a received reply before attempting a new request. */
function AskAgain({ id, part }: { id: string; part: 'writing' | 'speaking' }) {
  const active = useRef(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const label = part === 'writing' ? '請 Claude 看這篇寫作' : '請 Claude 看這段口說'
  return <div className="bl-again">
    <button type="button" disabled={busy} onClick={async () => {
      if (active.current) return
      active.current = true
      setBusy(true); setErr('')
      try {
        const result = await requestBaselineFeedback(id, part, confirm)
        setConfirm(result === 'confirm')
        if (result === 'confirm') setErr('上一次請求沒有確認回覆，重新送出會再使用 Claude 額度。')
        if (result === 'busy') setErr('這份作答的回饋仍在處理，稍後到這裡查看。')
        if (result === 'unconfigured') setErr('目前沒有待存的回饋。要請 Claude 批改，請先在設定連接 Claude。')
      } catch (error) {
        setConfirm(false)
        setErr(error instanceof Error ? error.message : String(error))
      } finally { active.current = false; setBusy(false) }
    }}>{busy ? '處理回饋中……' : confirm ? '確認重新送出' : tutorKey() ? label : '找回待存的回饋'}</button>
    {err && <small role="alert">{err}</small>}
  </div>
}

function SaveTranscript({ id }: { id: string }) {
  const action = useSyncExternalStore(subscribeBaselineTranscripts, () => pendingBaselineTranscript(id), () => undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!action) return null
  return <div className="bl-again">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { await saveBaselineTranscript(id) }
      catch (error) {
        setError(pendingBaselineTranscript(id) === 'save' ? '逐字稿暫時無法存入，請確認儲存空間後再試。'
          : error instanceof Error ? error.message : '目前無法轉文字。')
      }
      finally { setBusy(false) }
    }}>{busy ? '處理逐字稿中……' : action === 'save' ? '重新儲存逐字稿' : '送這段錄音轉文字'}</button>
    {action === 'upload' && <small>這段錄音暫留在本分頁。按下會使用 OpenAI 額度。</small>}
    {error && <small role="alert">{error}</small>}
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
  result: BaselineResult & { id: string }
  cleanup: () => void
  audio: Blob | null
}

export default function Baseline({ state }: Pick<PageProps, 'state' | 'update'>) {
  const results = useMemo(() => identifiedResults(state.notes), [state.notes])
  const [attempt, setAttempt] = useState<{ formId: FormId; retest: boolean } | null>(null)
  const formId = attempt?.formId ?? nextForm(results)
  const form = forms[formId]
  const retest = retestInfo(results, dayKey())
  const [step, setStep] = useState(0)
  const [plays, setPlays] = useState(0)
  // Plays that were heard to the end: pressing 播放 alone is not having listened (a cut-off clip is not counted).
  const [heard, setHeard] = useState(0)
  const [playing, setPlaying] = useState(false)
  const listeningPlayback = useRef<AbortController | null>(null)
  const stopListening = useCallback(() => {
    listeningPlayback.current?.abort()
    listeningPlayback.current = null
  }, [])
  const [notice, setNotice] = useState('')
  const noticedResult = useRef<string | null>(null)
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
  const stopped = useRef<number | null>(null)
  const alive = useRef(true)
  // Each press of 錄音 is one request; going back a step or finishing cancels a request still waiting for permission.
  const asking = useRef(0)
  const activeRequest = useRef<number | null>(null)
  const [requesting, setRequesting] = useState(false)
  const dropRequest = () => { activeRequest.current = null; setRequesting(false) }
  const discardCapture = useCallback(() => {
    const current = recorder.current
    recorder.current = null
    try { if (current?.state === 'recording') current.stop() }
    catch { /* The audio device may have stopped independently. */ }
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
  }, [])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopListening()
      activeRequest.current = null
      discardCapture()
    }
  }, [discardCapture, stopListening])

  function start() {
    noticedResult.current = null
    stopListening()
    setAttempt({ formId, retest: results.length > 0 })
    setStep(0); setNotice(''); setBusy('')
    setPlaying(false); setPlays(0); setHeard(0); setListen([]); setRead([])
    setWriting(readDraft(draftKey))
    setAudio(null); setSeconds(0)
  }
  async function play() {
    if (plays >= 2 || listeningPlayback.current) return
    const controller = new AbortController()
    listeningPlayback.current = controller
    setBusy('')
    setPlaying(true)
    setPlays(n => n + 1)
    const outcome = await speakEnglishResult(form.listen, 0.9, controller.signal).catch(() => 'failed' as const)
    if (listeningPlayback.current !== controller) return
    listeningPlayback.current = null
    setPlaying(false)
    if (outcome === 'played') setHeard(n => n + 1)
    else setBusy('這次沒有播完，可以在剩餘次數內再試。')
  }
  function back() {
    if (saveInProgress.current || preparedResult.current) return
    dropRequest()
    discardCapture()
    setRecording(false)
    setBusy('')
    if (step) setStep(step - 1)
    else {
      stopListening()
      setPlaying(false)
      setAttempt(null)
    }
  }
  function next() {
    if (step === 0) { stopListening(); setPlaying(false) }
    setBusy('')
    setStep(step + 1)
  }
  async function record() {
    if (saveInProgress.current || activeRequest.current !== null) return
    if (recorder.current) {
      if (recorder.current.state === 'recording') {
        stopped.current = performance.now()
        try { recorder.current.stop() }
        catch {
          discardCapture()
          setRecording(false)
          setBusy('這次錄音中斷了。可以重錄或略過口說。')
        }
      }
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
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      function end() {
        got.getTracks().forEach(t => t.stop())
        if (!alive.current || recorder.current !== r) return false
        recorder.current = null
        stream.current = null
        setRecording(false)
        return true
      }
      r.onerror = () => { if (end()) setBusy('這次錄音中斷了。可以重錄或略過口說。') }
      r.onstop = () => {
        if (!end()) return
        const duration = Math.round(((stopped.current ?? performance.now()) - started.current) / 1000)
        if (!chunks.length || duration < 1) { setBusy('這次沒有足夠的錄音，可以重錄。'); return }
        setAudio(new Blob(chunks, { type: r.mimeType || chunks[0].type }))
        setSeconds(duration)
      }
      started.current = performance.now()
      stopped.current = null
      r.start()
      recorder.current = r
      stream.current = got
      dropRequest()
      setBusy('')
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
  async function enrichResult({ result, audio }: PreparedResult) {
    const { id } = result
    const issue = (label: string, error?: unknown) => error instanceof Error ? `${label}：${error.message}` : label
    async function feedback(part: 'writing' | 'speaking') {
      const label = part === 'writing' ? '寫作回饋' : '口說回饋'
      try {
        const outcome = await requestBaselineFeedback(id, part)
        if (outcome === 'confirm') return `${label}仍待確認，可以從紀錄處理。`
        if (outcome === 'unconfigured') return `${label}未取得，請先連接 Claude。`
      } catch (error) { return issue(label, error) }
    }
    async function speaking() {
      if (!audio) return
      try { await saveBaselineTranscript(id, audio) }
      catch (error) {
        if (pendingBaselineTranscript(id) === 'save') return '已取得逐字稿，可以從紀錄重新儲存。'
        return issue('口說已先記下秒數', error)
      }
      if (tutorKey()) return feedback('speaking')
    }
    const missed = (await Promise.all([result.writing.text.trim() && tutorKey() ? feedback('writing') : undefined, speaking()])).filter(Boolean)
    if (alive.current && noticedResult.current === id) setNotice(missed.length ? '結果已存。' + missed.join(' ') : '')
  }
  async function saveResult(prepared: PreparedResult) {
    saveInProgress.current = true
    if (alive.current) { setSaving(true); setBusy('儲存這次結果……') }
    const { result, cleanup, audio } = prepared
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
    if (alive.current) {
      noticedResult.current = result.id
      setBusy(''); setSaving(false); setAttempt(null)
      setAudio(null)
      setNotice(audio || (result.writing.text.trim() && tutorKey()) ? '作品和分數已存，逐字稿和回饋會在完成後補到這次紀錄。' : '')
    }
    void enrichResult(prepared)
  }

  async function finish() {
    if (!attempt || saveInProgress.current || recorder.current) return
    if (preparedResult.current) { await saveResult(preparedResult.current); return }
    if (activeRequest.current !== null) dropRequest()
    // Skipped parts are 缺測 (null), not zero; a listening answer without playing the clip is not a listening score.
    const listening = heard ? sectionScore(form.listenQs, listen) : null
    const reading = sectionScore(form.readQs, read)
    if (emptyCheck({ listening, reading, writing: { text: writing, feedback: '' }, speaking: { transcript: '', feedback: '', seconds: audio ? seconds : 0 } })) {
      setBusy('這次每一項都跳過了：沒有存結果，題本也沒有用掉。回上一步補做一項，就可以存。'); return
    }
    const prepared: PreparedResult = {
      result: {
        id: makeBaselineId(), form: formId, date: dayKey(), submittedAt: Date.now(), listening, plays: heard, reading,
        writing: { text: writing, feedback: '' },
        speaking: { transcript: '', feedback: '', seconds: audio ? seconds : 0 },
      },
      audio,
      cleanup: captureDraftCleanup(draftKey, writing),
    }
    preparedResult.current = prepared
    await saveResult(prepared)
  }

  if (results.length && !attempt) {
    const shown = results.length <= 4 ? results : [results[0], ...results.slice(-3)]
    const first = results[0], last = results[results.length - 1]
    const sameForm = (first.form ?? 'A') === (last.form ?? 'A')
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
      {results.length > 1 && <p className="bl-delta">跟起點比（{sameForm ? '與起點為同一份題本，可能受記憶影響' : '與起點題目不同，只當參考'}；缺測的不比）：{[
        first.listening !== null && last.listening !== null ? '聽力 ' + sign(last.listening - first.listening) : '',
        first.reading !== null && last.reading !== null ? '閱讀 ' + sign(last.reading - first.reading) : '',
        first.writing.text.trim() && last.writing.text.trim() ? '寫作 ' + sign(wordCount(last.writing.text) - wordCount(first.writing.text)) + ' 字' : '',
        first.speaking.seconds && last.speaking.seconds ? '口說 ' + sign(last.speaking.seconds - first.speaking.seconds) + ' 秒' : '',
      ].filter(Boolean).join('、') || '還沒有兩次都做的項目'}{!sameForm && last.repeat ? '。這次的題本在其他回測做過，分數也可能受記憶影響。' : ''}</p>}
      <details open={last.date === dayKey()}><summary>看每次的聽力稿、作品和回饋</summary>
        {[...results].reverse().map(r => <div key={r.id} className="bl-past">
          <p className="bl-label">{name(r)} · {r.date} · 題本 {r.form ?? 'A'}</p>
          <ListenScript form={forms[r.form ?? 'A']} />
          <p className="bl-label">寫作</p><p lang="en" className="bl-work">{r.writing.text || '（沒寫）'}</p>
          {r.writing.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
          {r.writing.text.trim() && !r.writing.feedback && <AskAgain id={r.id} part="writing" />}
          <p className="bl-label">口說逐字稿</p><p lang="en" className="bl-work">{r.speaking.transcript || '（沒有逐字稿）'}</p>
          {r.speaking.feedback.split('\n').map((l, i) => l.trim() ? <p key={i}>{l}</p> : null)}
          {!r.speaking.transcript && <SaveTranscript id={r.id} />}
          {r.speaking.transcript.trim() && !r.speaking.feedback && <AskAgain id={r.id} part="speaking" />}
        </div>)}
      </details>
      {retest.due
        ? <button type="button" className="bl-main" onClick={start}>開始第 {results.length} 次回測（{formSeen(results, formId) ? '題本 ' + formId + '，以前做過' : '新題本 ' + formId}，約 15 分鐘）</button>
        : <button type="button" className="bl-early" onClick={start}>想提早回測（{formSeen(results, formId) ? '題本 ' + formId + '，以前做過' : '新題本 ' + formId}）</button>}
      <small>回測優先使用沒做過的題本，三份都做過以後會輪流使用。題型、長度和作答條件都一樣（聽力最多聽 2 次、不看字；寫作和口說不查字典、不用翻譯）。分數差異也會受題目難易或熟悉程度影響。只拿來和自己比，不代表正式程度或雅思分數。</small>
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
      <button type="button" className="bl-play" onClick={play} disabled={playing || plays >= 2}><Volume2 size={16} />{playing ? '正在播放' : `播放（剩 ${2 - plays} 次）`}</button>
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
        : <button type="button" className="bl-main" disabled={saving || recording} onClick={finish}>{preparedResult.current && !saving ? '重新儲存結果' : attempt.retest ? '完成，存這次結果' : '完成，存起點'}</button>}
    </div>
  </section>
}
