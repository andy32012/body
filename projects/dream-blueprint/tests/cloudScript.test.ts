import test from 'node:test'
import assert from 'node:assert/strict'

// The cloud script runs on Google's servers; here it runs against small stand-ins for the Google services it uses.
const store = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } } })
const { appsScriptCode } = await import('../src/lib/drive')

type Cell = string | number
function google() {
  let clock = Date.parse('2026-11-24T10:00:00Z')
  const props = new Map<string, string>()
  class Range {
    constructor(private sheet: Sheet, private row: number, private col: number, private rows = 1, private cols = 1) {}
    getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.sheet.cells.get((this.row + r) + ':' + (this.col + c)) ?? '')) }
    getValue() { return this.getValues()[0][0] }
    setValues(v: Cell[][]) { v.forEach((row, r) => row.forEach((x, c) => this.sheet.cells.set((this.row + r) + ':' + (this.col + c), x))); return this }
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
  type File = { id: string; name: string; created: number; content: string; trashed: boolean }
  const files: File[] = []
  const folder = {
    getId: () => 'folder1', isTrashed: () => false,
    createFile: (name: string, content: string) => { files.push({ id: 'f' + files.length, name, created: clock, content, trashed: false }) },
    getFiles: () => { const live = files.filter(f => !f.trashed); let i = 0; return { hasNext: () => i < live.length, next: () => fileApi(live[i++]) } },
  }
  const fileApi = (f: File) => ({
    getId: () => f.id, getName: () => f.name, getDateCreated: () => new Date(f.created), getSize: () => f.content.length,
    setTrashed: (t: boolean) => { f.trashed = t }, getBlob: () => ({ getDataAsString: () => f.content }),
    getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return folder } } },
  })
  const services = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v) } }) },
    SpreadsheetApp: { create: () => book, openById: () => book },
    DriveApp: {
      createFolder: () => folder, getFolderById: () => folder,
      getFileById: (id: string) => { const f = files.find(x => x.id === id && !x.trashed); if (!f) throw new Error('missing'); return fileApi(f) },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { formatDate: (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    MimeType: { PLAIN_TEXT: 'text/plain' },
  }
  const Date_ = class extends Date {
    constructor(...a: []) { super(...(a.length ? a : [clock]) as []) }
    static now() { return clock }
  }
  const run = new Function(...Object.keys(services), 'Date', appsScriptCode + '\nreturn { doPost, setupHistory }')(...Object.values(services), Date_)
  const post = (body: object) => run.doPost({ postData: { contents: JSON.stringify({ token: 't', ...body }) } })
  return { post, files, tick: (ms: number) => { clock += ms }, live: () => files.filter(f => !f.trashed) }
}

test('雲端小程式 v3：蓋掉舊進度前先留一份，最多每小時一份；選版本時一定留', () => {
  const g = google()
  assert.equal(g.post({ type: 'state', state: '{"v":1}', savedAt: 100, base: 0 }).state, true)
  assert.equal(g.live().length, 0, '第一次存，沒有舊的可以留')
  g.tick(60_000)
  g.post({ type: 'state', state: '{"v":2}', savedAt: 200, base: 100 })
  assert.equal(g.live().length, 1, '舊的那份留下來了')
  assert.match(g.live()[0].content, /"savedAt":100/)
  g.tick(60_000)
  g.post({ type: 'state', state: '{"v":3}', savedAt: 300, base: 200 })
  assert.equal(g.live().length, 1, '一小時內不再多留')
  g.post({ type: 'state', state: '{"v":4}', savedAt: 400, snapshot: true })
  assert.equal(g.live().length, 2, '選版本或還原（snapshot）一定留')
  g.tick(3_700_000)
  g.post({ type: 'state', state: '{"v":5}', savedAt: 500, base: 400 })
  assert.equal(g.live().length, 3, '過了一小時又會留')
  assert.deepEqual(g.post({ type: 'state', state: '{"v":6}', savedAt: 600, base: 100 }), { ok: false, error: 'stale', savedAt: 500, cas: true }, '舊的出發點還是會被擋')
})

test('雲端小程式 v3：列出歷史版本、讀回某一份、另外加一份；最多留 30 份', () => {
  const g = google()
  for (let i = 1; i <= 35; i++) { g.tick(3_700_000); g.post({ type: 'state', state: '{"v":' + i + '}', savedAt: i, ...(i > 1 ? { base: i - 1 } : {}) }) }
  const list = g.post({ type: 'history-list' }).history as { id: string; name: string; at: number }[]
  assert.equal(list.length, 30)
  assert.ok(list[0].at > list[29].at, '新的在前面')
  const newest = g.post({ type: 'history-get', id: list[0].id })
  assert.deepEqual([newest.ok, newest.state, newest.savedAt], [true, '{"v":34}', 34])
  assert.equal(g.post({ type: 'history-get', id: 'nope' }).ok, false)
  g.tick(1000)
  assert.equal(g.post({ type: 'history-add', state: '{"mine":1}', savedAt: 9, label: 'before-restore' }).added, true)
  const after = g.post({ type: 'history-list' }).history as { name: string }[]
  assert.equal(after.length, 30)
  assert.match(after[0].name, /^before-restore-/)
  assert.equal(g.post({ type: 'state-get' }).state, '{"v":35}', '另外加的那份不會改到現在的進度')
})
