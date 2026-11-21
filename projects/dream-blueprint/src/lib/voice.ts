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
}): Promise<VoiceSession> {
  const key = openaiKey()
  if (!key) throw new Error('還沒有 OpenAI 金鑰。')
  opts.onState('connecting')
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const pc = new RTCPeerConnection()
  const audio = new Audio()
  audio.autoplay = true
  pc.ontrack = e => { audio.srcObject = e.streams[0] }
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
