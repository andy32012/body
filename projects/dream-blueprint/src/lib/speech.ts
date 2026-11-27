/**
 * Speech to text for reading aloud and answering spoken questions.
 * With the OpenAI key (the one Emma uses) the answer is recorded and transcribed by OpenAI, the same on every device;
 * without it, the browser's own speech recognition is used where there is one (Chrome, Safari).
 * Neither scores pronunciation: they only say which words came through.
 */
import { openaiKey } from './voice'

export type ListenEngine = 'openai' | 'browser'
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
const BrowserRecognition = (): (new () => Recognition) | undefined => {
  const g = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return g.SpeechRecognition ?? g.webkitSpeechRecognition
}

/** Which way this device can listen, or null when it cannot. */
export function listenEngine(): ListenEngine | null {
  if (typeof window === 'undefined') return null
  if (openaiKey() && typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') return 'openai'
  return BrowserRecognition() ? 'browser' : null
}
export const engineNames: Record<ListenEngine, string> = { openai: 'OpenAI 語音辨識', browser: '瀏覽器內建的語音辨識' }

export interface Listening {
  engine: ListenEngine
  /** Resolves when the microphone stops, before any upload and transcription finish. */
  captured: Promise<void>
  /** The words heard, once listening has stopped (and, with OpenAI, the recording has been transcribed). */
  done: Promise<string>
  /** Time spent listening, frozen when recording ends, before any upload or transcription. */
  readonly durationMs: number
  readonly recording: boolean
  /** Stop and keep what was said. */
  stop(): void
  /** Stop and throw it away. */
  cancel(): void
}

const micError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  return new Error(/Permission|NotAllowed|not-allowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
}

/** Starts listening. `maxMs` stops by itself (an answer time); `onPartial` gets words as they come (browser only).
 *  `signal`: leaving the page (or the question) cancels it, also while the browser is still asking for the microphone. */
export async function listen(opts: { maxMs?: number; onPartial?: (text: string) => void; signal?: AbortSignal } = {}): Promise<Listening> {
  opts.signal?.throwIfAborted()
  const engine = listenEngine()
  if (!engine) throw new Error('這個瀏覽器不能做語音辨識。到口說頁的設定填 OpenAI 金鑰，或改用 Chrome、Safari。')
  const listening = await (engine === 'openai' ? recordAndTranscribe(opts.maxMs, opts.signal) : browserListen(opts.maxMs, opts.onPartial))
  if (opts.signal) {
    const signal = opts.signal
    const cancel = () => listening.cancel()
    const detach = () => signal.removeEventListener('abort', cancel)
    void listening.done.then(detach, detach)
    if (signal.aborted) { cancel(); signal.throwIfAborted() }
    signal.addEventListener('abort', cancel, { once: true })
  }
  return listening
}

async function recordAndTranscribe(maxMs?: number, signal?: AbortSignal): Promise<Listening> {
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch (e) { throw micError(e) }
  // Every way this can fail once the microphone is open closes it again.
  let captureEnded: () => void
  const captured = new Promise<void>(resolve => { captureEnded = resolve })
  const release = () => {
    stream.getTracks().forEach(t => t.stop())
    captureEnded()
  }
  if (signal?.aborted) { release(); throw new DOMException('ended', 'AbortError') }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) ?? ''
  let recorder: MediaRecorder
  try { recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined) }
  catch (e) { release(); throw new Error('這個瀏覽器不能錄音（' + (e instanceof Error ? e.message : String(e)) + '）。') }
  const chunks: Blob[] = []
  const request = new AbortController()
  const startedAt = performance.now()
  let stoppedAt: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let uploadTimer: ReturnType<typeof setTimeout> | undefined
  let resolveDone: (text: string) => void
  let rejectDone: (error: Error) => void
  const done = new Promise<string>((resolve, reject) => { resolveDone = resolve; rejectDone = reject })
  function finishCapture() {
    stoppedAt ??= performance.now()
    clearTimeout(timer)
    recorder.ondataavailable = recorder.onerror = recorder.onstop = null
    release()
  }
  function failCapture() {
    // A recorder error may be followed by final data and a stop event. Neither belongs in a transcription.
    request.abort()
    chunks.length = 0
    finishCapture()
    rejectDone(new Error('錄音中斷了，再試一次。'))
  }
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  recorder.onerror = failCapture
  recorder.onstop = () => {
    finishCapture()
    if (request.signal.aborted) { resolveDone(''); return }
    const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' })
    chunks.length = 0
    if (blob.size < 1200) { resolveDone(''); return }
    uploadTimer = setTimeout(() => {
      rejectDone(new Error('等不到 OpenAI 語音辨識結果。請檢查網路，再試一次。'))
      request.abort()
    }, 45_000)
    void transcribe(blob, request.signal).then(text => {
      clearTimeout(uploadTimer)
      resolveDone(text)
    }, e => {
      clearTimeout(uploadTimer)
      if (request.signal.aborted) resolveDone('')
      else rejectDone(e)
    })
  }
  try { recorder.start(250) }
  catch (e) {
    finishCapture()
    throw new Error('錄音開不起來（' + (e instanceof Error ? e.message : String(e)) + '），再試一次。')
  }
  const stop = () => {
    if (recorder.state === 'inactive') return
    stoppedAt ??= performance.now()
    clearTimeout(timer)
    try { recorder.stop() } catch { failCapture() }
  }
  function cancel() {
    clearTimeout(uploadTimer)
    request.abort()
    chunks.length = 0
    // Cancel can also run after capture ended while the network request is still pending.
    finishCapture()
    resolveDone('')
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* The stream is already closed. */ }
    }
  }
  if (maxMs) timer = setTimeout(stop, maxMs)
  return {
    engine: 'openai', captured, done, stop, cancel,
    get durationMs() { return (stoppedAt ?? performance.now()) - startedAt },
    get recording() { return stoppedAt === undefined },
  }
}

/** The current OpenAI file transcription model, with the older one as a fallback while it is still served. */
const models = ['gpt-transcribe', 'gpt-4o-mini-transcribe']
export async function transcribe(blob: Blob, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const key = openaiKey()
  if (!key) throw new Error('還沒有 OpenAI 金鑰。')
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const call = async (model: string, language: boolean) => {
    signal?.throwIfAborted()
    const form = new FormData()
    form.append('file', new File([blob], 'speech.' + ext, { type: blob.type || 'audio/webm' }))
    form.append('model', model)
    if (language) form.append('language', 'en')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal })
    signal?.throwIfAborted()
    const data = await res.json().catch(() => null) as { text?: string; error?: { message?: string } } | null
    signal?.throwIfAborted()
    return { res, data }
  }
  let res: Response | null = null
  let data: { text?: string; error?: { message?: string } } | null = null
  try {
    for (const model of models) {
      ({ res, data } = await call(model, true))
      // A field this model does not take: the same model without it. A model that is not there: the next one.
      if (res.status === 400 && /language/i.test(data?.error?.message ?? '')) {
        ({ res, data } = await call(model, false))
      }
      if (res.ok || !(res.status === 404 || (res.status === 400 && /model/i.test(data?.error?.message ?? '')))) break
    }
  } catch {
    signal?.throwIfAborted()
    throw new Error('連不上 OpenAI：檢查網路後再試一次。')
  }
  if (!res || !res.ok) {
    if (res?.status === 401) throw new Error('OpenAI 金鑰不對或被停用了，到口說頁的設定重新貼一次。')
    if (res?.status === 429) throw new Error('OpenAI 額度用完或打太快了，等一下再試。')
    throw new Error('語音辨識失敗：' + (data?.error?.message ?? res?.statusText ?? ''))
  }
  return String(data?.text ?? '').trim()
}

async function browserListen(maxMs?: number, onPartial?: (text: string) => void): Promise<Listening> {
  const Rec = BrowserRecognition()!
  const r = new Rec()
  r.lang = 'en-US'
  r.continuous = true
  r.interimResults = true
  r.maxAlternatives = 1
  let finals = ''
  let stopped = false, cancelled = false, failed: Error | null = null
  const startedAt = performance.now()
  let stoppedAt: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let finish: () => void
  const done = new Promise<string>((resolve, reject) => {
    finish = () => {
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      clearTimeout(endTimer)
      r.onresult = r.onerror = r.onend = null
      if (failed && !cancelled) reject(failed)
      else resolve(cancelled ? '' : finals.trim())
    }
    r.onresult = e => {
      if (cancelled || failed) return
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finals += t + ' '
        else interim += t
      }
      onPartial?.((finals + interim).trim())
    }
    r.onerror = e => {
      if (cancelled || e.error === 'no-speech') return
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') failed = micError(new Error('not-allowed'))
      else if (e.error === 'network') failed = new Error('瀏覽器的語音辨識要連網路，檢查網路後再試。')
      else if (e.error === 'audio-capture') failed = new Error('瀏覽器無法使用麥克風，請確認麥克風再試一次。')
      else failed = new Error('瀏覽器的語音辨識中斷了，再試一次。')
      endIfStalled()
    }
    r.onend = () => {
      // The browser stops by itself after a pause: keep listening until asked to stop.
      if (!stopped && !cancelled && !failed) {
        try { r.start(); return } catch (e) { failed = micError(e) }
      }
      finish()
    }
  })
  try { r.start() } catch (e) { throw micError(e) }
  function abortCapture() {
    try { r.abort() } catch { /* The recognizer may already have disconnected. */ }
  }
  function endIfStalled() {
    clearTimeout(endTimer)
    endTimer = setTimeout(() => {
      abortCapture()
      if (!cancelled) failed ??= new Error('瀏覽器的語音辨識沒有結束，再試一次。')
      finish()
    }, 8000)
  }
  const stop = () => {
    if (stopped || cancelled || failed || !r.onend) return
    stopped = true
    stoppedAt ??= performance.now()
    clearTimeout(timer)
    endIfStalled()
    try { r.stop() } catch {
      failed = new Error('無法停止瀏覽器的語音辨識，再試一次。')
      abortCapture()
      finish()
    }
  }
  if (maxMs) timer = setTimeout(stop, maxMs)
  const captured = done.then(() => undefined, () => undefined)
  return {
    engine: 'browser', captured, done, stop,
    get durationMs() { return (stoppedAt ?? performance.now()) - startedAt },
    get recording() { return stoppedAt === undefined },
    cancel() {
      if (cancelled || !r.onend) return
      cancelled = true
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      endIfStalled()
      abortCapture()
    },
  }
}
