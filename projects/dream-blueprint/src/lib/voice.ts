/** GPT-Live-1.1 speaking partner over WebRTC. The OpenAI key stays in this browser only. */
import { guardStart, guardStep, quietHeard, quietStart, quietStep } from './voiceTurns'

const KEY = 'dream-blueprint.openai-key'
const VOICE = 'dream-blueprint.openai-voice'
const GUARD = 'dream-blueprint.echo-guard'

export const voices = ['marin', 'quartz', 'ripple', 'vesper', 'willow', 'stone', 'gleam', 'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder', 'nuri', 'juni', 'flitz', 'brise', 'sillage', 'nira', 'harema', 'shida', 'noeul']

function read(name: string) { try { return localStorage.getItem(name) ?? '' } catch { return '' } }
function write(name: string, value: string) { try { value ? localStorage.setItem(name, value) : localStorage.removeItem(name) } catch { /* private mode */ } }
export const openaiKey = () => read(KEY)
export const setOpenaiKey = (v: string) => write(KEY, v.trim())
export const voiceName = () => read(VOICE) || 'marin'
export const setVoiceName = (v: string) => write(VOICE, v)
/** On unless switched off: with speakers her own voice reaches the microphone and she stops after a word. */
export const echoGuard = () => read(GUARD) !== 'off'
export const setEchoGuard = (on: boolean) => write(GUARD, on ? '' : 'off')

export type Line = { role: 'user' | 'assistant'; text: string }
export type VoiceSession = { stop: () => void }

export async function startVoice(opts: {
  instructions: string
  /** Sent as a developer message when the session is created, so that she speaks first. */
  opening?: string
  /** After `afterMs` without a sound from either side she is told `say` (at most `times` in a row without a word from him). */
  quiet?: { afterMs: number; times: number; say: string }
  /** Close the microphone while her voice is heard (see voiceTurns.ts). */
  guard?: boolean
  onLine: (lines: (prev: Line[]) => Line[]) => void
  onState: (state: 'connecting' | 'live' | 'closed', detail?: string) => void
  onLevel?: (her: number, you: number) => void
  /** Ending the call (or leaving the page) before it is connected: the setup stops and the microphone is released,
   *  also when permission is granted only afterwards. */
  signal?: AbortSignal
}): Promise<VoiceSession> {
  const key = openaiKey()
  if (!key) throw new Error('還沒有 OpenAI 金鑰。')
  opts.onState('connecting')
  // iPad / iPhone Safari only lets sound start inside the tap, so the player and the level meter are set up
  // before the first await (asking for the microphone ends the tap).
  const audio = new Audio()
  audio.autoplay = true
  audio.setAttribute('playsinline', '')
  let ctx: AudioContext | null = null
  try { ctx = new AudioContext(); void ctx.resume() } catch { ctx = null }
  let mic: MediaStream
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch (e) { ctx?.close().catch(() => {}); throw e }
  if (opts.signal?.aborted) { mic.getTracks().forEach(t => t.stop()); ctx?.close().catch(() => {}); opts.onState('closed'); throw new DOMException('ended', 'AbortError') }
  const pc = new RTCPeerConnection()
  // Levels for the wave: "her" is Emma's voice, "you" is the microphone (both 0–1).
  let frame = 0
  let herAnalyser: AnalyserNode | null = null
  let youAnalyser: AnalyserNode | null = null
  const measure = (a: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>) => {
    if (!a) return 0
    a.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2)
  }
  if (ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume()
      youAnalyser = ctx.createAnalyser()
      youAnalyser.fftSize = 512
      ctx.createMediaStreamSource(mic).connect(youAnalyser)
      if (opts.onLevel) {
        const a = new Uint8Array(512), b = new Uint8Array(512)
        const tick = () => {
          opts.onLevel!(measure(herAnalyser, a), measure(youAnalyser, b))
          frame = requestAnimationFrame(tick)
        }
        tick()
      }
    } catch { /* level meter is optional */ }
  }
  pc.ontrack = e => {
    audio.srcObject = e.streams[0]
    audio.play().catch(() => { /* Safari allows sound while the microphone is on; ignore other refusals */ })
    if (!ctx) return
    try {
      herAnalyser = ctx.createAnalyser()
      herAnalyser.fftSize = 512
      ctx.createMediaStreamSource(e.streams[0]).connect(herAnalyser)
    } catch { /* optional */ }
  }
  const micTrack = mic.getAudioTracks()[0]
  pc.addTrack(micTrack, mic)
  const events = pc.createDataChannel('oai-events')
  let closed = false
  // Turn-taking help (voiceTurns.ts). Runs on a timer, not on animation frames, so it keeps going in a background tab.
  // Without a working level meter both simply stay out of the way: the microphone stays open, and the quiet watch
  // goes by the transcript alone.
  let live = false
  let guard = guardStart()
  let quiet = quietStart(performance.now())
  let nudging = !!opts.quiet
  let nudges = 0
  const wa = new Uint8Array(512), wb = new Uint8Array(512)
  const watch = setInterval(() => {
    if (closed) return
    const now = performance.now()
    const her = measure(herAnalyser, wa)
    if (opts.guard && herAnalyser) {
      guard = guardStep(guard, her, now)
      if (micTrack.enabled === guard.muted) micTrack.enabled = !guard.muted
    }
    if (!live || !nudging || !opts.quiet || events.readyState !== 'open') return
    const next = quietStep(quiet, { her, you: measure(youAnalyser, wb), now }, opts.quiet.afterMs, opts.quiet.times)
    quiet = next.state
    if (!next.nudge) return
    try { events.send(JSON.stringify({ type: 'session.instructions.append', event_id: 'nudge_' + ++nudges, delegation_id: null, content: opts.quiet.say })) }
    catch { nudging = false }
  }, 50)
  // Ends the call once, however it ends (hang up, the service closing, an error, a lost connection): the page's
  // wrap-up (feedback from Claude) runs once. `detail` is the reason when it ended by an error.
  const stop = (detail?: string) => {
    if (closed) return
    closed = true
    try { if (events.readyState === 'open') events.send(JSON.stringify({ type: 'session.close' })) } catch { /* ignore */ }
    setTimeout(() => pc.close(), 300)
    mic.getTracks().forEach(t => t.stop())
    audio.srcObject = null
    cancelAnimationFrame(frame)
    clearInterval(watch)
    ctx?.close().catch(() => {})
    opts.onLevel?.(0, 0)
    opts.onState('closed', detail)
  }
  opts.signal?.addEventListener('abort', () => stop(), { once: true })
  const append = (role: Line['role'], delta: string) => opts.onLine(prev => {
    const last = prev[prev.length - 1]
    if (last && last.role === role) return [...prev.slice(0, -1), { role, text: last.text + delta }]
    return [...prev, { role, text: delta.trimStart() }]
  })
  events.onmessage = e => {
    let msg: { type?: string; delta?: string; error?: { message?: string; client_event_id?: string }; message?: string }
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg.type === 'session.started') { live = true; quiet = quietStart(performance.now()); opts.onState('live') }
    else if (msg.type === 'session.input_transcript.delta' && msg.delta) { quiet = quietHeard(quiet, 'user', performance.now()); append('user', msg.delta) }
    else if (msg.type === 'session.output_transcript.delta' && msg.delta) { quiet = quietHeard(quiet, 'assistant', performance.now()); append('assistant', msg.delta) }
    else if (msg.type === 'session.closed') stop()
    // The reminder to speak is an extra: if the service refuses it, the call goes on without reminders.
    else if (msg.type === 'error' && msg.error?.client_event_id?.startsWith('nudge_')) nudging = false
    // Any other provider error ends the session the same way as hanging up: microphone off, connection closed.
    else if (msg.type === 'error') stop(msg.error?.message || msg.message || '連線出錯了')
  }
  pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState)) stop() }
  const aborted = () => { if (opts.signal?.aborted) throw new DOMException('ended', 'AbortError') }

  // Every failure while connecting (no network, an HTTP error, a bad answer) goes through the same clean-up.
  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const create = (opening?: string) => fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: 'gpt-live-1.1', instructions: opts.instructions, audio: { output: { voice: voiceName() } },
          ...(opening ? { input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: opening }] }] } : {}),
        },
        transport: { type: 'webrtc', sdp: offer.sdp },
      }),
    })
    aborted()
    let res = await create(opts.opening)
    aborted()
    let data = await res.json().catch(() => null)
    // The opening message is an extra: if the service does not take the request with it, the call starts without it.
    if (opts.opening && (res.status === 400 || res.status === 422)) {
      res = await create()
      data = await res.json().catch(() => null)
    }
    if (!res.ok) {
      const msg = data?.error?.message ?? res.statusText
      if (res.status === 401) throw new Error('OpenAI 金鑰不對或被停用了，重新貼一次。')
      if (res.status === 429) throw new Error('OpenAI 額度用完或打太快了。（' + msg + '）')
      throw new Error('OpenAI 連線失敗：' + msg)
    }
    if (!data?.transport?.sdp) throw new Error('OpenAI 回傳的連線資料不完整，等一下再試。')
    aborted()
    await pc.setRemoteDescription({ type: 'answer', sdp: data.transport.sdp })
  } catch (e) {
    stop()
    throw e instanceof TypeError ? new Error('連不上 OpenAI：檢查網路後再試一次。') : e
  }
  return { stop }
}
