/** GPT-Live-1.1 speaking partner over WebRTC. The OpenAI key stays in this browser only. */
const KEY = 'dream-blueprint.openai-key'
const VOICE = 'dream-blueprint.openai-voice'

export const voices = ['marin', 'quartz', 'ripple', 'vesper', 'willow', 'stone', 'gleam', 'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder', 'nuri', 'juni', 'flitz', 'brise', 'sillage', 'nira', 'harema', 'shida', 'noeul']

function read(name: string) { try { return localStorage.getItem(name) ?? '' } catch { return '' } }
function write(name: string, value: string) { try { value ? localStorage.setItem(name, value) : localStorage.removeItem(name) } catch { /* private mode */ } }
export const openaiKey = () => read(KEY)
export const setOpenaiKey = (v: string) => write(KEY, v.trim())
export const voiceName = () => read(VOICE) || 'marin'
export const setVoiceName = (v: string) => write(VOICE, v)

export type Line = { role: 'user' | 'assistant'; text: string }
export type VoiceSession = { stop: () => void }

export async function startVoice(opts: {
  instructions: string
  onLine: (lines: (prev: Line[]) => Line[]) => void
  onState: (state: 'connecting' | 'live' | 'closed', detail?: string) => void
  onLevel?: (her: number, you: number) => void
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
  if (opts.onLevel) { try { ctx = new AudioContext(); void ctx.resume() } catch { ctx = null } }
  let mic: MediaStream
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch (e) { ctx?.close().catch(() => {}); throw e }
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
  if (opts.onLevel && ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume()
      youAnalyser = ctx.createAnalyser()
      youAnalyser.fftSize = 512
      ctx.createMediaStreamSource(mic).connect(youAnalyser)
      const a = new Uint8Array(512), b = new Uint8Array(512)
      const tick = () => {
        opts.onLevel!(measure(herAnalyser, a), measure(youAnalyser, b))
        frame = requestAnimationFrame(tick)
      }
      tick()
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
  pc.addTrack(mic.getAudioTracks()[0], mic)
  const events = pc.createDataChannel('oai-events')
  let closed = false
  const stop = () => {
    if (closed) return
    closed = true
    try { if (events.readyState === 'open') events.send(JSON.stringify({ type: 'session.close' })) } catch { /* ignore */ }
    setTimeout(() => pc.close(), 300)
    mic.getTracks().forEach(t => t.stop())
    audio.srcObject = null
    cancelAnimationFrame(frame)
    ctx?.close().catch(() => {})
    opts.onLevel?.(0, 0)
    opts.onState('closed')
  }
  const append = (role: Line['role'], delta: string) => opts.onLine(prev => {
    const last = prev[prev.length - 1]
    if (last && last.role === role) return [...prev.slice(0, -1), { role, text: last.text + delta }]
    return [...prev, { role, text: delta.trimStart() }]
  })
  events.onmessage = e => {
    let msg: { type?: string; delta?: string; error?: { message?: string }; message?: string }
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg.type === 'session.started') opts.onState('live')
    else if (msg.type === 'session.input_transcript.delta' && msg.delta) append('user', msg.delta)
    else if (msg.type === 'session.output_transcript.delta' && msg.delta) append('assistant', msg.delta)
    else if (msg.type === 'session.closed') stop()
    else if (msg.type === 'error') opts.onState('closed', msg.error?.message || msg.message || '連線出錯了')
  }
  pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState)) stop() }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const res = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: { model: 'gpt-live-1.1', instructions: opts.instructions, audio: { output: { voice: voiceName() } } },
      transport: { type: 'webrtc', sdp: offer.sdp },
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    stop()
    const msg = data?.error?.message ?? res.statusText
    if (res.status === 401) throw new Error('OpenAI 金鑰不對或被停用了，重新貼一次。')
    if (res.status === 429) throw new Error('OpenAI 額度用完或打太快了。（' + msg + '）')
    throw new Error('OpenAI 連線失敗：' + msg)
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: data.transport.sdp })
  return { stop }
}
