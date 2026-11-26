import test from 'node:test'
import assert from 'node:assert/strict'

// A tiny browser: storage, and a window that only takes events.
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } },
  window: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
})
const { createInitialState, getSnapshot, updateStore, STORAGE_KEY } = await import('../src/lib/store.ts')
const { mergeWithCloud } = await import('../src/lib/cloudSync.ts')
const { cloudConflict } = await import('../src/lib/drive.ts')

const url = 'https://script.google.com/macros/s/test/exec'
const session = (id: string, day: string) => ({ id, day, energy: 'normal' as const, period: 'semester' as const, sentenceId: '', words: [], translations: [], spokenIds: [] })

/** The deployed script: one cloud copy with its save time, refusing a save whose base is not that time. */
function fakeScript(cloud: { state: string; savedAt: number }, hooks: { onHistory?: () => void; beforeSave?: (n: number) => void } = {}) {
  let saves = 0
  globalThis.fetch = (async (_u: string, init?: { body?: string }) => {
    const b = JSON.parse(init?.body ?? '{}')
    const reply = (v: object) => ({ json: async () => ({ ok: true, cas: true, ...v }) })
    if (b.type === 'state-get') return reply({ state: cloud.state, savedAt: cloud.savedAt })
    if (b.type === 'history-add') { hooks.onHistory?.(); return reply({ added: true }) }
    if (b.type === 'state') {
      hooks.beforeSave?.(saves++)
      if (!b.snapshot && b.base !== cloud.savedAt) return { json: async () => ({ ok: false, error: 'stale', savedAt: cloud.savedAt }) }
      cloud.state = b.state; cloud.savedAt = b.savedAt
      return reply({ state: true })
    }
    return reply({})
  }) as typeof fetch
}
function connect(base: number, local: number) {
  store.set('dream-blueprint.drive', JSON.stringify({ url, token: 't' }))
  store.set('dream-blueprint.cloud-cas', '1')
  store.set('dream-blueprint.cloud-base', String(base))
  store.set('dream-blueprint.modified', String(local))
  store.delete('dream-blueprint.cloud-conflict')
}

test('自己合併的時候剛好做完一步：那一步不會被合併蓋掉，雲端也有', async () => {
  const here = createInitialState('2026-11-26')
  here.sessions = [session('s-here', '2026-11-26')]
  store.set(STORAGE_KEY, JSON.stringify(here))
  getSnapshot()
  const there = createInitialState('2026-11-26')
  there.sessions = [session('s-ipad', '2026-11-26')]
  const cloud = { state: JSON.stringify(there), savedAt: 2000 }
  connect(1000, 1500)
  // While this device's copy goes into the cloud history (a slow request), he finishes a step.
  fakeScript(cloud, { onHistory: () => updateStore(prev => ({ ...prev, sessions: [...prev.sessions, session('s-step', '2026-11-26')] })) })
  await mergeWithCloud(true)
  const ids = (s: { sessions: { id: string }[] }) => s.sessions.map(x => x.id).sort()
  assert.deepEqual(ids(getSnapshot().state), ['s-here', 's-ipad', 's-step'], '這台、另一台、合併時做的那一步都在')
  assert.deepEqual(ids(JSON.parse(cloud.state)), ['s-here', 's-ipad', 's-step'], '存到雲端的也是完整的')
  assert.equal(cloudConflict(), null)
})

test('合併到一半另一台剛好也存了：再合併一次，不會把另一台剛存的蓋掉', async () => {
  const here = createInitialState('2026-11-26')
  here.sessions = [session('s-here', '2026-11-26')]
  store.set(STORAGE_KEY, JSON.stringify(here))
  updateStore(() => here)
  const there = createInitialState('2026-11-26')
  there.sessions = [session('s-ipad', '2026-11-26')]
  const cloud = { state: JSON.stringify(there), savedAt: 2000 }
  connect(1000, 1500)
  fakeScript(cloud, {
    beforeSave: n => {
      if (n) return
      // The iPad saves again just before this device's first save arrives.
      const later = JSON.parse(cloud.state)
      later.sessions.push(session('s-ipad-2', '2026-11-26'))
      cloud.state = JSON.stringify(later); cloud.savedAt = 3000
    },
  })
  await mergeWithCloud(true)
  const ids = JSON.parse(cloud.state).sessions.map((x: { id: string }) => x.id).sort()
  assert.deepEqual(ids, ['s-here', 's-ipad', 's-ipad-2'], '另一台後來存的也合併進來')
  assert.deepEqual(getSnapshot().state.sessions.map(x => x.id).sort(), ids)
  assert.equal(cloudConflict(), null, '同步沒有暫停')
})

/** Another device saves one more session just before each of this device's saves, `times` times (稽核 R-01). */
function busyCloud(cloud: { state: string; savedAt: number }, times: number, forced: number[]) {
  fakeScript(cloud, {
    beforeSave: n => {
      if (n >= times) return
      const later = JSON.parse(cloud.state)
      later.sessions.push(session('s-ipad-' + (n + 1), '2026-11-26'))
      cloud.state = JSON.stringify(later); cloud.savedAt = 3000 + n
    },
  })
  const plain = globalThis.fetch
  globalThis.fetch = (async (u: string, init?: { body?: string }) => {
    const b = JSON.parse(init?.body ?? '{}')
    if (b.type === 'state' && b.snapshot) forced.push(1)
    return plain(u, init)
  }) as typeof fetch
}
function startBoth() {
  const here = createInitialState('2026-11-26')
  here.sessions = [session('s-here', '2026-11-26')]
  store.set(STORAGE_KEY, JSON.stringify(here))
  updateStore(() => here)
  const there = createInitialState('2026-11-26')
  there.sessions = [session('s-ipad', '2026-11-26')]
  connect(1000, 1500)
  return { state: JSON.stringify(there), savedAt: 2000 }
}
const sessionIds = (json: string) => (JSON.parse(json).sessions as { id: string }[]).map(x => x.id).sort()

test('另一台連續存了三次：第三次也不會硬蓋掉，三筆新紀錄都在雲端', async () => {
  const cloud = startBoth()
  const forced: number[] = []
  busyCloud(cloud, 3, forced)
  await mergeWithCloud(true)
  assert.equal(forced.length, 0, '自己合併時從來不硬蓋雲端')
  assert.deepEqual(sessionIds(cloud.state), ['s-here', 's-ipad', 's-ipad-1', 's-ipad-2', 's-ipad-3'])
  assert.deepEqual(getSnapshot().state.sessions.map(x => x.id).sort(), sessionIds(cloud.state))
  assert.equal(cloudConflict(), null)
})

test('雲端一直有新進度進來：合併好的先留在這台、標成等一下再同步，雲端那份一筆都不少', async () => {
  const cloud = startBoth()
  const forced: number[] = []
  busyCloud(cloud, 99, forced)
  const message = await mergeWithCloud(true)
  assert.equal(forced.length, 0, '沒有硬蓋雲端')
  const inCloud = sessionIds(cloud.state)
  assert.ok(!inCloud.includes('s-here') && inCloud.includes('s-ipad-1'), '雲端還是另一台最新存的那份，沒有被蓋掉')
  const here = getSnapshot().state.sessions.map(x => x.id)
  for (const id of ['s-here', 's-ipad', 's-ipad-1', 's-ipad-2']) assert.ok(here.includes(id), '這台留著合併好的：' + id)
  assert.ok(cloudConflict(), '標成還沒同步，之後會再合併')
  assert.match(message, /再/)
})
