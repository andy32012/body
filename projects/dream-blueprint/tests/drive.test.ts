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

/** The deployed script's rule (v4): refuse a save whose base is older than what the cloud holds, unless it is a chosen
 *  overwrite. Each state carries its content so a test can see whose progress ended up in the cloud. */
function fakeScript(start: { at: number; state: string }) {
  const cloud = { ...start }
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (_u: string, init?: { body?: string }) => {
    const b = JSON.parse(init?.body ?? '{}')
    await new Promise(r => setTimeout(r, b.delay ?? 5))
    if (b.type !== 'state') return { json: async () => ({ ok: true }) }
    if (!b.snapshot && typeof b.base === 'number' && cloud.at > b.base) return { json: async () => ({ ok: false, error: 'stale', savedAt: cloud.at }) }
    cloud.at = b.savedAt; cloud.state = b.state
    return { json: async () => ({ ok: true, state: true }) }
  }) as typeof fetch
  Object.assign(globalThis, { window: { dispatchEvent() {} } })
  return { cloud, restore: () => { globalThis.fetch = realFetch } }
}

test('同一個瀏覽器兩個分頁：舊分頁慢回來的存檔被拒絕時，不會硬蓋掉另一個分頁剛存的新進度（審核 R002）', async () => {
  const { saveDriveState, cloudConflict } = await import('../src/lib/drive')
  store.set('dream-blueprint.drive', JSON.stringify({ url, token }))
  store.set('dream-blueprint.cloud-cas', '1')
  store.delete('dream-blueprint.cloud-conflict')
  store.set('dream-blueprint.cloud-own', JSON.stringify([5000]))
  const fake = fakeScript({ at: 5000, state: '{"answers":1}' })
  try {
    // The other tab already saved the newer progress (two answers) as its own save.
    fake.cloud.at = 5200; fake.cloud.state = '{"answers":2}'
    store.set('dream-blueprint.cloud-own', JSON.stringify([5000, 5200]))
    // This tab's old snapshot (one answer, started from 5000) arrives late.
    await saveDriveState('{"answers":1}', 5100, 5000)
    assert.equal(fake.cloud.state, '{"answers":2}', '雲端留著兩筆作答的新進度')
    assert.equal(fake.cloud.at, 5200, '版本沒有倒退')
    assert.equal(cloudConflict(), null)
  } finally { fake.restore() }
})

test('手機和電腦時鐘不一樣：時鐘慢的那台存上去的版本也比它接手的那一版新，另一台看得出雲端變了（審核 R030）', async () => {
  const { saveDriveState, cloudBase, syncDecision, saveVersion } = await import('../src/lib/drive')
  assert.equal(saveVersion(1500, 2000), 2001, '時鐘慢：比接手的版本大一')
  assert.equal(saveVersion(3000, 2000), 3000, '時鐘正常：照時間')
  store.set('dream-blueprint.drive', JSON.stringify({ url, token }))
  store.set('dream-blueprint.cloud-cas', '1')
  store.delete('dream-blueprint.cloud-conflict')
  store.set('dream-blueprint.cloud-own', '[]')
  store.set('dream-blueprint.cloud-base', '2000')
  const fake = fakeScript({ at: 2000, state: '{"from":"A"}' })
  try {
    // Device B (clock behind) continues from A's 2000 and saves at its own time 1500.
    await saveDriveState('{"from":"B"}', 1500)
    assert.ok(fake.cloud.at > 2000, '雲端版本往前進，不會變成 1500')
    assert.equal(cloudBase(), fake.cloud.at)
    // Device A still thinks the cloud is at 2000: it sees the change and does not just push over it.
    assert.equal(syncDecision(fake.cloud.at, 2000, 2000), 'pull')
    assert.equal(syncDecision(fake.cloud.at, 2000, 2100), 'conflict')
  } finally { fake.restore() }
  assert.equal(syncDecision(1500, 2000, 1800), 'pull', '舊版留下比較小的雲端時間，也算雲端變了')
})
