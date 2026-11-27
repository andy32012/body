import test from 'node:test'
import assert from 'node:assert/strict'

// A tiny browser for the call setup: a microphone, a connection and the network, all fake.
const stopped: string[] = []
let peers = 0
class FakePeer {
  ontrack: unknown = null
  onconnectionstatechange: unknown = null
  connectionState = 'new'
  constructor() { peers++ }
  async createOffer() { return { sdp: 'offer' } }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  addTrack() {}
  createDataChannel() { return { readyState: 'connecting', send() {}, onmessage: null } }
  close() {}
}
const storage = new Map<string, string>([['dream-blueprint.openai-key', 'sk-test']])
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
  Audio: class { autoplay = false; srcObject: unknown = null; setAttribute() {} play() { return Promise.resolve() } },
  AudioContext: class { constructor() { throw new Error('no audio in tests') } },
  RTCPeerConnection: FakePeer,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
})
Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => ({
  getTracks: () => [{ stop: () => stopped.push('mic') }],
  getAudioTracks: () => [{ enabled: true, stop: () => stopped.push('mic') }],
}) } }, configurable: true })
const { startVoice } = await import('../src/lib/voice.ts')
const base = { instructions: 'x', onLine() {}, onState() {} }

test('第一次連線被拒（400），正在讀回覆時按了結束：不會再送第二次建立連線的請求（稽核 SV-01）', async () => {
  const controller = new AbortController()
  const sent: { afterAbort: boolean; signal: boolean }[] = []
  globalThis.fetch = (async (_u: string, init?: { signal?: AbortSignal }) => {
    sent.push({ afterAbort: controller.signal.aborted, signal: !!init?.signal })
    return { status: 400, ok: false, statusText: 'Bad Request', json: () => new Promise(r => setTimeout(() => { controller.abort(); r({}) }, 5)) }
  }) as unknown as typeof fetch
  stopped.length = 0
  await assert.rejects(startVoice({ ...base, opening: 'Hi', signal: controller.signal }), (e: Error) => e.name === 'AbortError')
  assert.equal(sent.length, 1, '結束以後沒有再送出請求')
  assert.equal(sent[0].signal, true, '請求帶著取消訊號，結束時可以中途取消')
  assert.ok(stopped.includes('mic'), '麥克風關掉了')
})

test('瀏覽器開不了連線：已經拿到的麥克風馬上關掉（稽核 SV-01）', async () => {
  const states: string[] = []
  stopped.length = 0
  const Real = globalThis.RTCPeerConnection
  Object.assign(globalThis, { RTCPeerConnection: class { constructor() { throw new Error('not supported') } } })
  await assert.rejects(startVoice({ ...base, onState: s => states.push(s) }))
  Object.assign(globalThis, { RTCPeerConnection: Real })
  assert.ok(stopped.includes('mic'))
  assert.ok(!states.includes('live'), '沒有連上就不會顯示通話中')
})
