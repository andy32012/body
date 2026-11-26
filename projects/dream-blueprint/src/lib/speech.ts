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
  const release = () => stream.getTracks().forEach(t => t.stop())
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
  const done = new Promise<string>((resolve, reject) => {
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    recorder.onerror = () => { clearTimeout(timer); release(); reject(new Error('錄音中斷了，再試一次。')) }
    recorder.onstop = () => {
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      release()
      if (request.signal.aborted) { resolve(''); return }
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' })
      if (blob.size < 1200) { resolve(''); return }
      transcribe(blob, request.signal).then(resolve, e => {
        if (request.signal.aborted) resolve('')
        else reject(e)
      })
    }
  })
  try { recorder.start(250) }
  catch (e) { release(); throw new Error('錄音開不起來（' + (e instanceof Error ? e.message : String(e)) + '），再試一次。') }
  const stop = () => {
    if (recorder.state === 'inactive') return
    stoppedAt ??= performance.now()
    clearTimeout(timer)
    recorder.stop()
  }
  if (maxMs) timer = setTimeout(stop, maxMs)
  return {
    engine: 'openai', done, stop,
    get durationMs() { return (stoppedAt ?? performance.now()) - startedAt },
    get recording() { return stoppedAt === undefined },
    cancel() { request.abort(); stop(); release() },
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
  const done = new Promise<string>((resolve, reject) => {
    r.onresult = e => {
      if (cancelled) return
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finals += t + ' '
        else interim += t
      }
      onPartial?.((finals + interim).trim())
    }
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') failed = micError(new Error('not-allowed'))
      else if (e.error === 'network') failed = new Error('瀏覽器的語音辨識要連網路，檢查網路後再試。')
    }
    r.onend = () => {
      // The browser stops by itself after a pause: keep listening until asked to stop.
      if (!stopped && !cancelled && !failed) { try { r.start(); return } catch { /* finish below */ } }
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      if (failed && !finals.trim()) reject(failed)
      else resolve(cancelled ? '' : finals.trim())
    }
  })
  try { r.start() } catch (e) { throw micError(e) }
  const stop = () => {
    stopped = true
    stoppedAt ??= performance.now()
    clearTimeout(timer)
    try { r.stop() } catch { /* already stopped */ }
  }
  if (maxMs) timer = setTimeout(stop, maxMs)
  return {
    engine: 'browser', done, stop,
    get durationMs() { return (stoppedAt ?? performance.now()) - startedAt },
    get recording() { return stoppedAt === undefined },
    cancel() {
      cancelled = true
      stoppedAt ??= performance.now()
      clearTimeout(timer)
      try { r.abort() } catch { /* already stopped */ }
    },
  }
}
