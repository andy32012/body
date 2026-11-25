import test from 'node:test'
import assert from 'node:assert/strict'

// A tiny browser: the address bar, history and storage the sync link touches.
const store = new Map<string, string>()
const loc = { origin: 'https://xitian.page', pathname: '/dream/', search: '', hash: '' }
Object.assign(globalThis, {
  location: loc,
  history: { replaceState: (_s: unknown, _t: string, url: string) => { const i = url.indexOf('#'); loc.hash = i >= 0 ? url.slice(i) : ''; loc.search = '' } },
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } },
})
const { clearSyncLink, decodeSyncCode, sameDrive, syncCode, syncDecision, syncLink, syncPrefix, takeSyncLink } = await import('../src/lib/drive')

const url = 'https://script.google.com/macros/s/AKfycbz3VlaV-EK83CaDTOhojPenjEp3KXpYFhB0c1dFV4WGnrNUFjMXbtgWhidUUFOj12bln/exec'
const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718'
const code = btoa(JSON.stringify({ u: url, t: token }))

test('同步碼解得出網址和金鑰，壞掉或不完整的會講清楚', () => {
  assert.deepEqual(decodeSyncCode(code), { u: url, t: token })
  assert.deepEqual(decodeSyncCode('  ' + code + '\n'), { u: url, t: token })
  assert.throws(() => decodeSyncCode('不是同步碼'), /看不懂/)
  assert.throws(() => decodeSyncCode(btoa(JSON.stringify({ u: url }))), /不完整/)
  assert.throws(() => decodeSyncCode(btoa('null')), /不完整/)
})

test('掃 QR 的連結：同步碼放在 # 後面（不會送到伺服器），打開後馬上從網址列拿掉', () => {
  const link = syncLink(code)
  assert.ok(link.startsWith('https://xitian.page/dream/?sync=1' + syncPrefix))
  const after = link.slice(link.indexOf('#'))
  assert.ok(!/[+/=]/.test(after.slice(syncPrefix.length)), 'base64 的 + / = 要編碼，相機和瀏覽器才不會弄壞')
  loc.search = '?sync=1'; loc.hash = after
  assert.equal(takeSyncLink(), code)
  assert.equal(loc.hash, '#today')
  assert.equal(loc.search, '')
  // React may read it twice on the first render: same answer, until the dialog is closed.
  assert.equal(takeSyncLink(), code)
  clearSyncLink()
  assert.equal(takeSyncLink(), null)
  loc.hash = syncPrefix + '%E0%A4%A'
  assert.equal(takeSyncLink(), null, '壞掉的連結不會讓頁面當掉')
  assert.equal(loc.hash, '#today')
})

test('已經用同一組同步碼連著的裝置，不用重新連（重連會把同步基準歸零）', () => {
  store.clear()
  assert.equal(sameDrive(code), false)
  store.set('dream-blueprint.drive', JSON.stringify({ url, token }))
  assert.equal(sameDrive(code), true)
  assert.equal(syncCode(), code)
  assert.equal(sameDrive(btoa(JSON.stringify({ u: url, t: 'other' }))), false)
  assert.equal(sameDrive('壞掉'), false)
  store.clear()
})

test('連上後要用哪一份：新裝置直接載入雲端，兩邊都改過才停下來問', () => {
  assert.equal(syncDecision(1000, 0, 0), 'pull')
  assert.equal(syncDecision(1000, 0, 500), 'conflict')
  assert.equal(syncDecision(null, 0, 500), 'push')
  assert.equal(syncDecision(1000, 1000, 1000), 'none')
  assert.equal(syncDecision(1000, 1000, 2000), 'push')
})

test('連續存兩次（第一次還沒回來就又改了）：不會把自己存的那份當成另一台，同步不會暫停', async () => {
  const { saveDriveState, cloudConflict, cloudBase } = await import('../src/lib/drive')
  store.set('dream-blueprint.drive', JSON.stringify({ url, token }))
  store.set('dream-blueprint.cloud-cas', '1')
  store.set('dream-blueprint.cloud-base', '1000')
  store.delete('dream-blueprint.cloud-conflict')
  // The script: refuses a save whose base is not what the cloud holds now (unless it is a chosen overwrite), slowly.
  let cloudAt = 1000
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (_u: string, init?: { body?: string }) => {
    const b = JSON.parse(init?.body ?? '{}')
    await new Promise(r => setTimeout(r, 20))
    if (b.type !== 'state') return { json: async () => ({ ok: true }) }
    if (!b.snapshot && b.base !== cloudAt) return { json: async () => ({ ok: false, error: 'stale', savedAt: cloudAt }) }
    cloudAt = b.savedAt
    return { json: async () => ({ ok: true, state: true }) }
  }) as typeof fetch
  Object.assign(globalThis, { window: { dispatchEvent() {} } })
  try {
    await Promise.all([saveDriveState('{"a":1}', 2000), saveDriveState('{"a":2}', 3000)])
    assert.equal(cloudConflict(), null, '沒有暫停同步')
    assert.equal(cloudAt, 3000, '最後那份存上去了')
    assert.equal(cloudBase(), 3000)
  } finally { globalThis.fetch = realFetch }
})
