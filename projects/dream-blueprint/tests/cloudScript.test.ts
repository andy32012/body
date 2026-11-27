import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// The cloud script runs on Google's servers; here it runs against small stand-ins for the Google services it uses.
const store = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } } })
const { appsScriptCode, appsScriptVersion, archiveFolderUrl, archiveToDrive, cloudArchive } = await import('../src/lib/drive')

type Cell = string | number
function google(options: { noKey?: boolean } = {}) {
  let clock = Date.parse('2026-11-24T10:00:00Z')
  const props = new Map<string, string>()
  // Ways to make Google fail, for the tests of a save that breaks halfway.
  const fail = { rows: false, truncate: false, files: false }
  class Range {
    constructor(private sheet: Sheet, private row: number, private col: number, private rows = 1, private cols = 1) {}
    getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.sheet.cells.get((this.row + r) + ':' + (this.col + c)) ?? '')) }
    getValue() { return this.getValues()[0][0] }
    setValues(v: Cell[][]) {
      // The progress rows (row 2 on): a lost connection after the first row, or rows silently cut short.
      if (this.row >= 2 && fail.rows) { this.sheet.cells.set(this.row + ':' + this.col, v[0][0]); throw new Error('Service timed out') }
      const rows = this.row >= 2 && fail.truncate ? v.map(r => r.map(x => typeof x === 'string' ? x.slice(0, 5) : x)) : v
      rows.forEach((row, r) => row.forEach((x, c) => this.sheet.cells.set((this.row + r) + ':' + (this.col + c), x))); return this
    }
    setValue(x: Cell) { return this.setValues([[x]]) }
    setNumberFormat() { return this }
  }
  class Sheet {
    cells = new Map<string, Cell>()
    constructor(public name: string) {}
    setName(n: string) { this.name = n; return this }
    getLastRow() { let last = 0; for (const k of this.cells.keys()) last = Math.max(last, Number(k.split(':')[0])); return last }
    getRange(row: number, col: number, rows?: number, cols?: number) { return new Range(this, row, col, rows, cols) }
    appendRow(values: Cell[]) { const r = this.getLastRow() + 1; values.forEach((x, c) => this.cells.set(r + ':' + (c + 1), x)) }
    clear() { this.cells.clear() }
  }
  const sheets: Sheet[] = [new Sheet('Sheet1')]
  const book = {
    getSheets: () => sheets, getId: () => 'book1', getUrl: () => 'https://docs.google.com/book1',
    getSheetByName: (n: string) => sheets.find(s => s.name === n) ?? null,
    insertSheet: (n: string) => { const s = new Sheet(n); sheets.push(s); return s },
  }
  type File = { id: string; name: string; created: number; content: string; trashed: boolean; folder: string; mime: string; description: string }
  const files: File[] = []
  type Folder = ReturnType<typeof makeFolder>
  const folders = new Map<string, Folder>()
  function makeFolder(id: string, name: string) {
    return {
      getId: () => id, getName: () => name, isTrashed: () => false, getUrl: () => 'https://drive.google.com/drive/folders/' + id,
      createFile: (fileName: string, content: string, mime = 'text/plain') => {
        if (fail.files) throw new Error('Drive quota')
        const f: File = { id: 'f' + files.length, name: fileName, created: clock, content, trashed: false, folder: id, mime, description: '' }
        files.push(f)
        return fileApi(f)
      },
      getFiles: () => { const live = files.filter(f => !f.trashed && f.folder === id); let i = 0; return { hasNext: () => i < live.length, next: () => fileApi(live[i++]) } },
      getFilesByName: (fileName: string) => { const live = files.filter(f => !f.trashed && f.folder === id && f.name === fileName); let i = 0; return { hasNext: () => i < live.length, next: () => fileApi(live[i++]) } },
    }
  }
  const fileApi = (f: File): Record<string, (...a: never[]) => unknown> => ({
    getMimeType: () => f.mime, getDescription: () => f.description, setDescription: (d: string) => { f.description = d; return fileApi(f) },
    getId: () => f.id, getName: () => f.name, getDateCreated: () => new Date(f.created), getSize: () => f.content.length, isTrashed: () => f.trashed,
    setTrashed: (t: boolean) => { f.trashed = t }, getBlob: () => ({ getDataAsString: () => f.content }),
    getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return folders.get(f.folder)! } } },
  })
  const services = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v) } }) },
    SpreadsheetApp: { create: () => book, openById: () => book, flush: () => {} },
    DriveApp: {
      createFolder: (name: string) => { const f = makeFolder('folder' + (folders.size + 1), name); folders.set(f.getId(), f); return f },
      getFolderById: (id: string) => { const f = folders.get(id); if (!f) throw new Error('missing'); return f },
      getFileById: (id: string) => {
        // The script makes sure its spreadsheet is not in the trash before writing to it.
        if (id === book.getId()) return { getId: () => id, isTrashed: () => false }
        const f = files.find(x => x.id === id && !x.trashed); if (!f) throw new Error('missing'); return fileApi(f)
      },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: {
      formatDate: (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14), getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      // Like Apps Script: signed bytes, and web-safe base64 with padding.
      computeDigest: (_alg: string, data: string) => [...createHash('sha256').update(data, 'utf8').digest()].map(b => b > 127 ? b - 256 : b),
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map(b => b & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    MimeType: { PLAIN_TEXT: 'text/plain' },
  }
  const Date_ = class extends Date {
    constructor(...a: []) { super(...(a.length ? a : [clock]) as []) }
    static now() { return clock }
  }
  const run = new Function(...Object.keys(services), 'Date', appsScriptCode + '\nreturn { doPost, setupHistory }')(...Object.values(services), Date_)
  // The owner ran setupHistory once and typed its sync key into the site (v9 no longer trusts the first key it sees).
  if (!options.noKey) props.set('TOKEN', 't')
  const post = (body: object) => run.doPost({ postData: { contents: JSON.stringify({ token: 't', ...body }) } })
  const inFolder = (name: string) => files.filter(f => !f.trashed && folders.get(f.folder)?.getName() === name)
  // A save that starts from the copy the cloud holds now. v9 numbers each save itself (its own clock, always after the copy
  // it replaces), so the next save starts from the number in the answer, not from the phone's clock.
  const save = (state: string, extra: object = {}) => post({ type: 'state', state, savedAt: 1, base: post({ type: 'state-get' }).savedAt, ...extra })
  return { post, save, files, setup: run.setupHistory as () => void, folders, inFolder, tick: (ms: number) => { clock += ms }, live: () => files.filter(f => !f.trashed), fail, props, sheets }
}

test('雲端小程式 v3：蓋掉舊進度前先留一份，最多每小時一份；選版本時一定留', () => {
  const g = google()
  assert.equal(g.save('{"v":1}').state, true)
  assert.equal(g.live().length, 0, '第一次存，沒有舊的可以留')
  const first = g.post({ type: 'state-get' }).savedAt
  g.tick(60_000)
  g.save('{"v":2}')
  assert.equal(g.live().length, 1, '舊的那份留下來了')
  assert.ok(g.live()[0].content.includes('"savedAt":' + first))
  g.tick(60_000)
  g.save('{"v":3}')
  assert.equal(g.live().length, 1, '一小時內不再多留')
  g.save('{"v":4}', { snapshot: true })
  assert.equal(g.live().length, 2, '選版本或還原（snapshot）一定留')
  g.tick(3_700_000)
  const before = g.post({ type: 'state-get' }).savedAt
  g.save('{"v":5}')
  assert.equal(g.live().length, 3, '過了一小時又會留')
  const now = g.post({ type: 'state-get' }).savedAt
  assert.ok(now > before, '每次存的編號都往前')
  assert.deepEqual(g.post({ type: 'state', state: '{"v":6}', savedAt: 600, base: first }), { ok: false, error: 'stale', savedAt: now, cas: true, archive: true, atomic: true, guarded: true, scriptVersion: appsScriptVersion }, '舊的出發點還是會被擋')
})

test('雲端小程式 v3：列出歷史版本、讀回某一份、另外加一份；最多留 30 份', () => {
  const g = google()
  for (let i = 1; i <= 35; i++) { g.tick(3_700_000); g.save('{"v":' + i + '}') }
  const list = g.post({ type: 'history-list' }).history as { id: string; name: string; at: number }[]
  assert.equal(list.length, 30)
  assert.ok(list[0].at > list[29].at, '新的在前面')
  const newest = g.post({ type: 'history-get', id: list[0].id })
  assert.deepEqual([newest.ok, newest.state], [true, '{"v":34}'])
  assert.ok(newest.savedAt > 0 && newest.savedAt < g.post({ type: 'state-get' }).savedAt, '讀回的那份帶著它原本的編號')
  assert.equal(g.post({ type: 'history-get', id: 'nope' }).ok, false)
  g.tick(1000)
  assert.equal(g.post({ type: 'history-add', state: '{"mine":1}', savedAt: 9, label: 'before-restore' }).added, true)
  const after = g.post({ type: 'history-list' }).history as { name: string }[]
  assert.equal(after.length, 30)
  assert.match(after[0].name, /^before-restore-/)
  assert.equal(g.post({ type: 'state-get' }).state, '{"v":35}', '另外加的那份不會改到現在的進度')
})

test('雲端小程式 v4：舊紀錄存進「夢想藍圖・封存」，回答 archived；封存永遠不會被歷史版本的 30 份上限刪掉', () => {
  const g = google()
  g.setup()
  assert.deepEqual([...g.folders.values()].map(f => f.getName()).sort(), ['夢想藍圖・封存', '夢想藍圖・歷史版本'], 'setupHistory 兩個資料夾都開好')
  const r = g.post({ type: 'archive-add', data: '{"events":[1]}' })
  assert.deepEqual([r.ok, r.archived, r.archive], [true, true, true])
  assert.match(r.folder, /^https:\/\/drive\.google\.com\//)
  for (let i = 1; i <= 35; i++) { g.tick(3_700_000); g.save('{"v":' + i + '}') }
  for (let i = 0; i < 40; i++) g.post({ type: 'archive-add', data: '{"n":' + i + '}' })
  assert.equal(g.inFolder('夢想藍圖・歷史版本').length, 30)
  assert.equal(g.inFolder('夢想藍圖・封存').length, 41, '封存一份都沒少')
  assert.equal(g.inFolder('夢想藍圖・封存')[0].content, '{"events":[1]}')
  assert.match(g.inFolder('夢想藍圖・封存')[0].name, /^舊紀錄-/)
  assert.equal(g.post({ type: 'archive-add', data: '' }).archived, undefined, '空的不存')
  assert.equal(g.post({ type: 'state-get' }).archive, true, '每個回答都說自己是 v4')
})

test('網站這邊：v4 確認收到才算封存好；舊版小程式回 ok 但沒存，就不算', async () => {
  const g = google()
  const drive = { url: 'https://script.google.com/macros/s/x/exec', token: 't' }
  store.set('dream-blueprint.drive', JSON.stringify(drive))
  let reply = (body: Record<string, unknown>) => g.post(body)
  Object.assign(globalThis, { fetch: async (_url: string, init: { body: string }) => ({ json: async () => reply(JSON.parse(init.body)) }) })
  assert.equal(cloudArchive(), false)
  assert.equal(await archiveToDrive('{"old":1}', drive), true)
  assert.equal(cloudArchive(), true)
  assert.match(archiveFolderUrl(), /^https:\/\/drive\.google\.com\//)
  assert.equal(g.inFolder('夢想藍圖・封存').length, 1)
  reply = () => ({ ok: true, cas: true, url: 'https://docs.google.com/book1' })
  await assert.rejects(archiveToDrive('{"old":2}', drive), 'v3 不認得 archive-add：不算封存好')
  reply = () => { throw new Error('offline') }
  await assert.rejects(archiveToDrive('{"old":3}', drive), '沒連上也不算')
  await assert.rejects(archiveToDrive('{"old":4}', { ...drive, token: 'other' }), '連線換了就不送')
  assert.equal(g.inFolder('夢想藍圖・封存').length, 1)
})

test('雲端小程式 v5：存到一半斷線或寫不完整，雲端還是原本完整的那一份；寫好、讀回來一樣才換過去', () => {
  const g = google()
  const big = JSON.stringify({ text: 'x'.repeat(120_000) })
  assert.equal(g.save(big).state, true)
  const at = g.post({ type: 'state-get' }).savedAt
  assert.ok(g.post({ type: 'state-get' }).state === big)
  // The connection drops after the first row of the new copy.
  g.fail.rows = true
  const broken = g.save(big + ' ')
  assert.deepEqual([broken.ok, broken.error], [false, 'write'])
  g.fail.rows = false
  assert.ok(g.post({ type: 'state-get' }).state === big, '原本那份完整留著')
  assert.equal(g.post({ type: 'state-get' }).savedAt, at, '編號也沒變')
  // Rows silently cut short: the read-back check catches it.
  g.fail.truncate = true
  assert.equal(g.save('{"v":2}').error, 'write')
  g.fail.truncate = false
  assert.ok(g.post({ type: 'state-get' }).state === big)
  // A good save after that works, and the next device starts from it.
  assert.equal(g.save('{"v":3}').state, true)
  assert.equal(g.post({ type: 'state-get' }).state, '{"v":3}')
  assert.ok(g.post({ type: 'state-get' }).savedAt > at)
  assert.equal(g.post({ type: 'state-get' }).atomic, true, '每個回答都說自己是 v5')
})

test('雲端小程式 v5：要先留備份的覆蓋（還原、選版本），備份存不了就不蓋掉；回答照實說這次有沒有留', () => {
  const g = google()
  g.save('{"v":1}')
  g.tick(3_700_000)
  const kept = g.save('{"v":2}')
  assert.deepEqual([kept.state, kept.kept], [true, true], '留了一份')
  g.tick(60_000)
  assert.equal(g.save('{"v":3}').kept, false, '一小時內沒有再留，照實說')
  g.fail.files = true
  const refused = g.save('{"v":4}', { snapshot: true })
  assert.deepEqual([refused.ok, refused.error], [false, 'history'])
  assert.equal(g.post({ type: 'state-get' }).state, '{"v":3}', '備份存不了，雲端那份沒有被蓋掉')
  g.tick(3_700_000)
  const plain = g.save('{"v":5}')
  assert.deepEqual([plain.state, plain.kept], [true, false], '一般存檔照存，但說沒有留到備份')
})

test('雲端小程式 v5：從 v4 換過來，原本「進度」工作表裡的進度照樣讀得到；之後兩張輪流用', () => {
  const g = google()
  // What a v4 script left: the progress on the 進度 sheet, no slot recorded.
  assert.equal(g.save('{"old":1}').state, true)
  g.props.delete('STATE_SLOT')
  const v4 = g.sheets.find(x => x.name === '進度')!
  v4.clear()
  v4.getRange(1, 1, 1, 2).setValues([['學習進度', 77]])
  v4.getRange(2, 1, 1, 1).setValues([['~{"from":"v4"}']])
  assert.deepEqual([g.post({ type: 'state-get' }).state, g.post({ type: 'state-get' }).savedAt], ['{"from":"v4"}', 77])
  assert.equal(g.post({ type: 'state', state: '{"v":5}', savedAt: 90, base: 77 }).state, true)
  assert.equal(g.props.get('STATE_SLOT'), '進度・另一份')
  assert.equal(g.save('{"v":6}').state, true)
  assert.equal(g.props.get('STATE_SLOT'), '進度')
  assert.equal(g.post({ type: 'state-get' }).state, '{"v":6}')
})

test('網站這邊：v5 的錯誤說清楚是哪一種，雲端那份沒壞', async () => {
  const { saveDriveState, cloudStatus, cloudAtomic } = await import('../src/lib/drive')
  store.set('dream-blueprint.drive', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', token: 't' }))
  store.set('dream-blueprint.cloud-cas', '1')
  store.set('dream-blueprint.cloud-guarded', '1')
  store.delete('dream-blueprint.cloud-conflict')
  Object.assign(globalThis, { window: { dispatchEvent() {} } })
  Object.assign(globalThis, { fetch: async () => ({ json: async () => ({ ok: false, error: 'write', cas: true, archive: true, atomic: true, guarded: true, scriptVersion: 9 }) }) })
  await assert.rejects(saveDriveState({ state: '{"x":1}', modified: 1000, base: 0 }))
  assert.match(cloudStatus()?.message ?? '', /沒有存完整，雲端還是原本那一份/)
  assert.equal(cloudAtomic(), true)
})

test('雲端小程式 v9：沒先設定同步密鑰、或密鑰不對，一律拒絕，不讀也不寫（第一輪 67）', () => {
  const fresh = google({ noKey: true })
  assert.deepEqual([fresh.post({ type: 'state-get' }).ok, fresh.post({ type: 'state-get' }).error], [false, 'setup'])
  assert.equal(fresh.post({ type: 'state', state: '{"v":1}', savedAt: 1, base: 0 }).error, 'setup', '第一個連上的人不會自動變成主人')
  fresh.setup()
  const key = fresh.props.get('TOKEN')!
  assert.match(key, /^[0-9a-f-]{72}$/, 'setupHistory 產生一把長密鑰')
  assert.equal(fresh.post({ type: 'state-get' }).error, 'token', '網址被別人拿到，沒有密鑰也讀不到')
  const g = google()
  assert.equal(g.post({ type: 'state', state: '{"v":1}', savedAt: 1, base: 0 }).state, true)
  assert.equal(g.post({ type: 'state-get', token: 'guess' }).error, 'token')
})
