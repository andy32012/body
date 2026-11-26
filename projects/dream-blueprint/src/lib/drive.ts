/**
 * Google Drive memory through the learner's own Apps Script web app.
 * The script saves conversations and memory notes into a spreadsheet in their Drive.
 * The web app URL and the token configured by the owner stay in this browser.
 */
import { memoryTimes, type MemoryRecords } from './memory'

const KEY = 'dream-blueprint.drive'
type Drive = { url: string; token: string; sheet?: string; generation?: string; settled?: boolean }

function read(): Drive | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.url && v.token ? v : null } catch { return null }
}
function write(v: Drive | null) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* private mode */ }
}
export const driveConfig = read
export const driveConnected = () => !!read()
export const cloudScope = (d = read()) => d ? d.generation ?? d.url : null
export function readyCloudScope() {
  const d = read()
  return d?.settled === false ? null : cloudScope(d)
}
export function driveStorageChanged(event: StorageEvent) {
  return event.storageArea === localStorage && (event.key === null || event.key === KEY || event.key.startsWith('dream-blueprint.cloud-'))
}
let connectionAttempt = 0
function withStoreLock<T>(action: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('dream-blueprint.v2', action)
  return Promise.resolve().then(action)
}
export async function disconnectDrive() {
  connectionAttempt++
  await withStoreLock(() => {
    write(null)
    if (read()) throw new Error('瀏覽器沒有完成中斷連線，請再試一次。')
    resetCloudTracking()
  })
}

export function sameConnection(d: Drive) {
  const current = read()
  return current?.url === d.url && current.token === d.token && cloudScope(current) === cloudScope(d)
}

/** An initial pull, push or explicit choice has finished. The persisted connection notifies other tabs. */
export async function completeDriveConnection(d: Drive) {
  await withStoreLock(() => {
    const current = read()
    if (!current || !sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
    if (current.settled === false) {
      write({ ...current, settled: true })
      if (readyCloudScope() !== cloudScope(d)) throw new Error('瀏覽器無法保存雲端連線狀態，請再試一次。')
    }
    window.dispatchEvent(new Event(driveReadyEvent))
  })
}

function rememberCapabilities(json: { url?: string; cas?: boolean; archive?: boolean; folder?: string; atomic?: boolean; guarded?: boolean; scriptVersion?: number }, d: Drive) {
  const current = read()
  if (!current || !sameConnection(d)) return
  if (json.url && json.url !== current.sheet) write({ ...current, sheet: json.url })
  if (json.cas) markCas()
  if (json.archive) markArchive(typeof json.folder === 'string' ? json.folder : '')
  if (json.atomic) markAtomic()
  try {
    const guarded = localStorage.getItem(GUARDED) === '1'
    const version = typeof json.scriptVersion === 'number' && Number.isSafeInteger(json.scriptVersion) ? json.scriptVersion : 0
    if (cloudScriptVersion() !== version || !!json.guarded !== guarded) {
      if (version) localStorage.setItem(SCRIPT_VERSION, String(version))
      else localStorage.removeItem(SCRIPT_VERSION)
      if (!!json.guarded !== guarded) {
        if (json.guarded) localStorage.setItem(GUARDED, '1')
        else localStorage.removeItem(GUARDED)
      }
      window.dispatchEvent(new Event('dream-blueprint:cloud'))
    }
  } catch { /* optional */ }
}

async function post(body: object, d = read()) {
  if (!d) return null
  const res = await fetch(d.url, { method: 'POST', body: JSON.stringify({ ...body, token: d.token }) })
  const json = await res.json()
  // "stale" is an answer, not a failure: the cloud has a newer snapshot than the one this device started from.
  if (!json.ok && json.error !== 'stale') throw new Error(json.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。'
    : json.error === 'setup' ? '請先在 Apps Script 執行 setupHistory，再用執行記錄裡的同步密鑰連接。'
    : json.error === 'write' ? '雲端這次沒有存完整，雲端還是原本那一份'
    : json.error === 'history' ? '雲端硬碟沒辦法先留一份備份，這次先不蓋掉雲端那份'
    : '雲端硬碟回傳錯誤')
  await withStoreLock(() => rememberCapabilities(json, d))
  return json
}
/** Reads go by POST so the sync token is never in a URL; an older script that only reads by GET still works. */
async function get(type: 'state' | 'memory', d = read()) {
  if (!d) return null
  const json = await post({ type: type + '-get' }, d)
  if (json && (type === 'state' ? 'state' in json : Array.isArray(json.notes))) return json
  const res = await fetch(d.url + (type === 'state' ? '?type=state&' : '?') + 'token=' + encodeURIComponent(d.token))
  const old = await res.json()
  if (!old.ok) throw new Error(old.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。' : '雲端硬碟回傳錯誤')
  await withStoreLock(() => rememberCapabilities(old, d))
  return old
}

export async function connectDrive(url: string, token: string) {
  const clean = url.trim()
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(clean)) throw new Error('網址格式不對，要是 https://script.google.com/macros/s/…/exec')
  const previous = read()
  const key = token.trim()
  const same = previous?.url === clean && previous.token === key
  const generation = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
  const candidate = same ? previous : { url: clean, token: key, generation: generation(), settled: false }
  if (!candidate.token) throw new Error('請填入 Apps Script 執行記錄裡的同步密鑰。')
  const attempt = ++connectionAttempt
  const response = await get('memory', candidate)
  if (!response?.ok) throw new Error('雲端硬碟沒有確認連線，請檢查網址和同步密鑰。')
  await withStoreLock(() => {
    if (attempt !== connectionAttempt || (previous ? !sameConnection(previous) : read() !== null)) {
      throw new Error('這台裝置的雲端連線已變更，請重新確認。')
    }
    const existing = sameConnection(candidate)
    if (!existing) write(candidate)
    if (!sameConnection(candidate)) throw new Error('瀏覽器無法保存雲端連線設定。')
    if (!existing) resetCloudTracking()
    rememberCapabilities(response, candidate)
  })
  return readDriveMemory(response)
}

export type DriveMemory = MemoryRecords & { revision: number | null }
function readDriveMemory(json: { notes?: unknown; deleted?: unknown; updated?: unknown; memoryRevision?: unknown }): DriveMemory {
  return {
    notes: Array.isArray(json.notes) ? json.notes.map(String) : [],
    deleted: Array.isArray(json.deleted) ? json.deleted.map(String) : [],
    updated: memoryTimes(json.updated),
    revision: typeof json.memoryRevision === 'number' ? json.memoryRevision : null,
  }
}
export async function loadDriveMemory(d = read()): Promise<DriveMemory | null> {
  if (!d) return null
  const json = await get('memory', d)
  if (!sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
  return json ? readDriveMemory(json) : null
}

/** The new script merges under its lock. Legacy scripts use the merged copy prepared by the caller. */
export async function saveDriveMemory(memory: MemoryRecords, revision: number | null, d = read()) {
  if (!d) return null
  if (!sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
  const json = await post({ type: 'memory', ...memory, ...(revision === null ? {} : { memoryBase: revision }) }, d)
  if (!sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
  if (!json) return null
  if (json.error === 'stale' || Array.isArray(json.notes)) return { stale: json.error === 'stale', memory: readDriveMemory(json) }
  return { stale: false, memory: null }
}

/** Conversation transcripts go to the sheet only when turned on for this device (off by default). */
const LOGS = 'dream-blueprint.drive-logs'
export function driveLogsOn() { try { return localStorage.getItem(LOGS) === '1' } catch { return false } }
export function setDriveLogs(on: boolean) { try { on ? localStorage.setItem(LOGS, '1') : localStorage.removeItem(LOGS) } catch { /* optional */ } }
export function driveLog(source: string, rows: { role: string; text: string }[]) {
  const clean = rows.filter(r => r.text.trim())
  if (!read() || !clean.length || !driveLogsOn()) return
  post({ type: 'log', source, rows: clean.map(r => ({ role: r.role === 'user' ? '玄燁' : r.role, text: r.text })) }).catch(() => { /* best effort */ })
}

const STATUS = 'dream-blueprint.cloud-status'
export type CloudStatus = { at: number; ok: boolean; message: string }
export function cloudStatus(): CloudStatus | null {
  try { return JSON.parse(localStorage.getItem(STATUS) || 'null') } catch { return null }
}
function setStatus(ok: boolean, message: string) {
  try { localStorage.setItem(STATUS, JSON.stringify({ at: Date.now(), ok, message })) } catch { /* optional */ }
  window.dispatchEvent(new Event('dream-blueprint:cloud'))
}

/** The cloud snapshot this device last loaded or saved (its savedAt). A save says which snapshot it started from;
 *  if the cloud has moved on since, nothing is overwritten and both copies are kept until the learner chooses. */
const BASE = 'dream-blueprint.cloud-base'
const CONFLICT = 'dream-blueprint.cloud-conflict'
const CAS = 'dream-blueprint.cloud-cas'
const GUARDED = 'dream-blueprint.cloud-guarded'
const SCRIPT_VERSION = 'dream-blueprint.cloud-script-version'
export function cloudGuarded() { try { return localStorage.getItem(GUARDED) === '1' } catch { return false } }
export function cloudScriptVersion() { try { return Number(localStorage.getItem(SCRIPT_VERSION)) || 0 } catch { return 0 } }
function resetCloudTracking() {
  try {
    for (const key of [BASE, CONFLICT, CAS, HISTORY, ARCHIVE, ATOMIC, GUARDED, SCRIPT_VERSION, STATUS]) localStorage.removeItem(key)
  } catch { /* optional */ }
  window.dispatchEvent(new Event('dream-blueprint:cloud'))
}
export function cloudBase() { try { return Number(localStorage.getItem(BASE)) || 0 } catch { return 0 } }
export function setCloudBase(at: number) { try { localStorage.setItem(BASE, String(at)) } catch { /* optional */ } }
export type CloudConflict = { remoteAt: number; found: number; auto?: boolean }
export function cloudConflict(): CloudConflict | null { try { return JSON.parse(localStorage.getItem(CONFLICT) || 'null') } catch { return null } }
export function markConflict(remoteAt: number, auto = true) {
  try { localStorage.setItem(CONFLICT, JSON.stringify({ remoteAt, found: Date.now(), auto })) } catch { /* optional */ }
  setStatus(false, '雲端硬碟有另一台裝置存的新進度，這台也有改動：先暫停同步、兩份都保留，請到設定 → 雲端硬碟選要留哪一份。')
}
/** A merge that kept meeting newer saves from another device: the merged progress stays on this device, nothing in the
 *  cloud is overwritten, and syncing stays paused until the next merge (when the app opens or comes back). */
export function markMergeWaiting(remoteAt: number) {
  try { localStorage.setItem(CONFLICT, JSON.stringify({ remoteAt, found: Date.now() })) } catch { /* optional */ }
  setStatus(false, '另一台裝置一直有新進度存進雲端：這台合併好的進度先留在這台，兩份都保留，等一下會自己再合併一次。')
}
export function clearConflict() { try { localStorage.removeItem(CONFLICT) } catch { /* optional */ } ; window.dispatchEvent?.(new Event('dream-blueprint:cloud')) }
function markCas() { try { localStorage.setItem(CAS, '1') } catch { /* optional */ } }
/** Whether the deployed script refuses stale saves by itself (the updated version does). */
export function cloudCas() { try { return localStorage.getItem(CAS) === '1' } catch { return false } }
/** Whether the deployed script keeps history versions (v3). */
const HISTORY = 'dream-blueprint.cloud-history'
function markHistory() { try { localStorage.setItem(HISTORY, '1') } catch { /* optional */ } }
export function cloudHistory() { try { return localStorage.getItem(HISTORY) === '1' } catch { return false } }

export type HistoryEntry = { id: string; name: string; at: number; size: number }
/** The saved versions (newest first), or null when the deployed script is older than v3 and keeps none. */
export async function loadHistory(): Promise<HistoryEntry[] | null> {
  const json = await post({ type: 'history-list' })
  if (!json || !Array.isArray(json.history)) return null
  markHistory()
  return (json.history as HistoryEntry[]).filter(h => h && typeof h.id === 'string')
}
export async function loadHistoryVersion(id: string, d = read()): Promise<{ state: string; savedAt: number }> {
  let json: { state?: unknown; savedAt?: unknown } | null
  try { json = await post({ type: 'history-get', id }, d) } catch { json = null }
  if (d && !sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
  if (!json || typeof json.state !== 'string' || !json.state) throw new Error('這個版本讀不到了，換另一份試試。')
  return { state: json.state, savedAt: Number(json.savedAt) || 0 }
}
/** Puts a copy into the history without changing the current cloud progress. False when the script cannot. */
export async function addHistory(state: string, savedAt: number, label: string, d = read()) {
  if (!d || !sameConnection(d)) return false
  try { const json = await post({ type: 'history-add', state, savedAt, label }, d); return json?.added === true } catch { return false }
}
/** Whether the deployed script keeps old records in the Drive archive folder (v4); the value is that folder's link once known. */
const ARCHIVE = 'dream-blueprint.cloud-archive'
function markArchive(folder: string) {
  try { if (folder || localStorage.getItem(ARCHIVE) === null) localStorage.setItem(ARCHIVE, folder || '1') } catch { /* optional */ }
}
export function cloudArchive() { try { return !!localStorage.getItem(ARCHIVE) } catch { return false } }
/** Whether the deployed script saves safely (v5): the new copy is written apart and checked before it replaces the old. */
const ATOMIC = 'dream-blueprint.cloud-atomic'
function markAtomic() { try { localStorage.setItem(ATOMIC, '1') } catch { /* optional */ } }
export function cloudAtomic() { try { return localStorage.getItem(ATOMIC) === '1' } catch { return false } }
export function archiveFolderUrl() { try { const v = localStorage.getItem(ARCHIVE) || ''; return v.startsWith('https://') ? v : '' } catch { return '' } }
/** Saves old records as a file in the Drive archive folder. True only when the script confirms it kept them
 *  (an older script answers ok without keeping anything). */
export async function archiveToDrive(file: string, d: Drive) {
  if (!sameConnection(d)) return false
  try { const json = await post({ type: 'archive-add', data: file }, d); return json?.archived === true && sameConnection(d) } catch { return false }
}

/** What to do when the app opens: take the cloud copy, push this one, or stop because both changed. Pure, for testing. */
export function syncDecision(remoteAt: number | null, base: number, localAt: number): 'pull' | 'push' | 'conflict' | 'none' {
  // Any other version than the one this device started from means another device saved (an old app version on a
  // device with its clock behind could leave a smaller number), so it is never just pushed over.
  if (remoteAt !== null && remoteAt !== base) return localAt > base ? 'conflict' : 'pull'
  return remoteAt === null || localAt > base ? 'push' : 'none'
}

/** The version a save is stored as: its time, but always after the version it started from. Devices' clocks differ, so
 *  a device whose clock is behind would otherwise store a smaller number than the one it continued from, and another
 *  device would take the cloud for older than what it last saw and save over it. */
export const saveVersion = (savedAt: number, base: number) => Math.max(savedAt, base + 1)
/** A local change's time, after the cloud version this device holds, so a change made after syncing is always seen as
 *  not yet in the cloud, whatever the clock says. */
export const localStamp = (now: number, base: number) => Math.max(now, base + 1)

/** Whole progress, stored in chunks on the 「進度」 sheet. */
export async function loadDriveState(d = read()): Promise<{ state: string | null; savedAt: number } | null> {
  const json = await get('state', d)
  if (!json) return null
  if (d && !sameConnection(d)) throw new Error('雲端連線已經切換，請再試一次。')
  return { state: typeof json.state === 'string' && json.state ? json.state : null, savedAt: Number(json.savedAt) || 0 }
}
/** Saves run one at a time. Two saves in flight together used to send the same `base`: the second was refused as stale
 *  by the cloud holding the first one — this device's own save — and syncing paused as a "conflict" with itself. */
let saving: Promise<void> = Promise.resolve()
type WriteRequest = { state: string; modified: number; base: number; backup?: boolean }
type WriteResult = { kind: 'saved' | 'stale'; savedAt: number }
/** Bind the cloud revision and local edit timestamp to the specific state that is sent. */
export function saveDriveState(request: WriteRequest, connection = read()): Promise<WriteResult> {
  const run = saving.then(() => saveNow(request, connection))
  saving = run.then(() => {}, () => {})
  return run
}
async function saveNow({ state, modified, base, backup }: WriteRequest, connection: Drive | null): Promise<WriteResult> {
  if (!connection || !sameConnection(connection)) throw new Error('雲端連線已經中斷或切換。')
  try {
    // Earlier scripts cannot check equality under their lock. Verify against their current copy first.
    if (!cloudGuarded()) {
      const remote = await loadDriveState(connection)
      const current = remote?.savedAt ?? 0
      if (current !== base) return { kind: 'stale', savedAt: current }
    }
    const version = saveVersion(modified || Date.now(), base)
    const json = await post({ type: 'state', state, savedAt: version, base, ...(backup ? { snapshot: true } : {}) }, connection)
    if (!sameConnection(connection)) throw new Error('雲端連線已經切換，請再試一次。')
    if (json?.history === true) markHistory()
    if (json?.error === 'stale') return { kind: 'stale', savedAt: Number(json.savedAt) || 0 }
    if (!json || json.state !== true) throw new Error('雲端小程式還是舊版，需要更新部署')
    const storedVersion = Number(json.savedAt) || version
    return { kind: 'saved', savedAt: storedVersion }
  } catch (e) {
    if (sameConnection(connection)) noteSyncFailure(e)
    throw e
  }
}
export function noteSynced(message: string) { setStatus(true, message) }
export function noteSyncFailure(error: unknown) {
  setStatus(false, '同步失敗：' + (error instanceof Error ? error.message : String(error)))
}

/** One string to copy to another device. */
export function syncCode() {
  const d = read()
  return d ? btoa(JSON.stringify({ u: d.url, t: d.token })) : ''
}
/** The web app URL and token inside a sync code. Pure, for testing. */
export function decodeSyncCode(code: string): { u: string; t: string } {
  let v: { u?: unknown; t?: unknown }
  try { v = JSON.parse(atob(code.trim())) } catch { throw new Error('同步碼看不懂，整段重新複製一次。') }
  if (typeof v?.u !== 'string' || typeof v?.t !== 'string' || !v.u || !v.t) throw new Error('同步碼不完整。')
  return { u: v.u, t: v.t }
}
export async function importSyncCode(code: string) {
  const v = decodeSyncCode(code)
  return connectDrive(v.u, v.t)
}
/** Whether this device is already connected with exactly this sync code (then connecting again would only reset it). */
export function sameDrive(code: string) {
  const d = read()
  if (!d) return false
  try { const v = decodeSyncCode(code); return v.u.trim() === d.url && v.t === d.token } catch { return false }
}

/** One scan connects another device: a link carrying the sync code after #, which is never sent to the server. */
export const syncPrefix = '#sync='
export function syncLink(code = syncCode()) {
  // ?sync=1 makes Safari load the page fresh even when the site is already open in a tab
  // (a link that only differs after # would just jump inside the old page).
  return location.origin + location.pathname + '?sync=1' + syncPrefix + encodeURIComponent(code)
}
/** Read a sync link from the address bar and remove it right away, so the code doesn't stay in history. */
let takenSync: string | null = null
export function takeSyncLink(): string | null {
  if (location.hash.startsWith(syncPrefix)) {
    try { takenSync = decodeURIComponent(location.hash.slice(syncPrefix.length)).trim() || null } catch { takenSync = null }
    history.replaceState(null, '', location.pathname + '#today')
  }
  // The same link read twice on one load (React may run the first render twice) gives the same answer.
  return takenSync
}
export const clearSyncLink = () => { takenSync = null }
/** Sent once a device that connected while the app was open has settled which progress it uses: autosave may start. */
export const driveReadyEvent = 'dream-blueprint:drive-ready'

export const appsScriptVersion = 7
export const appsScriptCode = `// 夢想藍圖・雲端記憶 v${appsScriptVersion}（貼到 script.google.com 的專案，部署成網頁應用程式）
// v2：存進度前會檢查雲端是不是已經有另一台裝置存的新版本，不會互相蓋掉；刪掉的記憶也會同步刪除。
// v3：每次蓋掉雲端的進度之前，最多每小時把舊的那份存進雲端硬碟的「夢想藍圖・歷史版本」資料夾，留最新 30 份，可以在網站還原。
// v4：手機要整理掉的舊紀錄（兩個月前的複習紀錄、幾週前的每日小紀錄、四個月前上完的課的批改全文）先存進雲端硬碟的「夢想藍圖・封存」資料夾，存好了手機才拿掉；封存的檔案不會被刪。
// v5：存進度時先寫到另一張工作表，整份讀回來確認一模一樣才換過去用；存到一半失敗（斷線、逾時），雲端還是原本完整的那份。要先留備份時，備份沒存成功就不蓋掉。
// v7：對話欄位以文字寫入；歷史清理只處理這個專案已標記的快照。
// 擁有者在編輯器執行 setupHistory 設定同步密鑰。進度在鎖內比對版本，並由雲端發行新版號。
// setupHistory 保留原有密鑰與資料夾。第一次設定請從 Apps Script 執行記錄複製密鑰，再部署。
function props(){return PropertiesService.getScriptProperties()}
function book(){
  var id=props().getProperty('SHEET');
  if(id){try{return SpreadsheetApp.openById(id)}catch(e){}}
  var ss=SpreadsheetApp.create('夢想藍圖・記憶');
  ss.getSheets()[0].setName('對話紀錄').appendRow(['時間','來源','誰','內容']);
  ss.insertSheet('記憶').appendRow(['記住的事']);
  props().setProperty('SHEET',ss.getId());
  return ss;
}
function accessError(t){
  var saved=props().getProperty('TOKEN');
  if(!saved)return 'setup';
  return typeof t==='string'&&saved===t?'':'token';
}
function out(o){o.cas=true;o.archive=true;o.atomic=true;o.guarded=true;o.scriptVersion=${appsScriptVersion};return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function tab(name){var ss=book();return ss.getSheetByName(name)||ss.insertSheet(name)}
function column(name){var sh=tab(name),n=sh.getLastRow()-1;return n>0?sh.getRange(2,1,n,1).getValues().map(function(r){return String(r[0])}).filter(String):[]}
// The progress lives on one of two sheets; STATE_SLOT says which one is current (the first one before v5).
var SLOTS=['進度','進度・另一份'];
function activeSlot(){var s=props().getProperty('STATE_SLOT');return SLOTS.indexOf(s)>=0?s:SLOTS[0]}
function readSlot(name){
  var p=tab(name),rows=p.getLastRow()-1;
  var parts=rows>0?p.getRange(2,1,rows,1).getValues().map(function(r){return String(r[0]).slice(1)}):[];
  return {state:parts.join('')||null,savedAt:Number(p.getRange(1,2).getValue())||0};
}
function readState(){var s=readSlot(activeSlot());return {ok:true,state:s.state,savedAt:s.savedAt}}
// Writes the new copy on the other sheet, reads it back, and only then makes it the current one.
function writeState(state,savedAt){
  var target=activeSlot()===SLOTS[0]?SLOTS[1]:SLOTS[0],p=tab(target);
  p.clear();
  p.getRange(1,1,1,2).setValues([['學習進度（網站自動同步，請勿手動修改）',savedAt]]);
  var chunks=[];for(var i=0;i<state.length;i+=45000)chunks.push(['~'+state.slice(i,i+45000)]);
  if(chunks.length)p.getRange(2,1,chunks.length,1).setNumberFormat('@').setValues(chunks);
  SpreadsheetApp.flush();
  var back=readSlot(target);
  if(back.state!==state||back.savedAt!==savedAt)return false;
  props().setProperty('STATE_SLOT',target);
  return true;
}
function readMemory(){
  var sh=tab('記憶'),n=sh.getLastRow()-1,rev=Number(sh.getRange(1,3).getValue())||0;
  if(!rev)return {ok:true,notes:column('記憶'),deleted:column('已刪除的記憶'),memoryRevision:0,url:book().getUrl()};
  var rows=n>0?sh.getRange(2,1,n,5).getValues():[],updated=Object.create(null);
  rows.forEach(function(r){
    if(r[0]&&r[3])updated[String(r[0])]=memoryTime(r[3]);
    if(r[1]&&r[4])updated[String(r[1])]=memoryTime(r[4]);
  });
  return {ok:true,notes:rows.map(function(r){return String(r[0])}).filter(String),deleted:rows.map(function(r){return String(r[1])}).filter(String),updated:updated,memoryRevision:rev,url:book().getUrl()};
}
function memoryStrings(list){return (Array.isArray(list)?list:[]).filter(function(n){return typeof n==='string'&&n!==''})}
function memoryTime(value){return Number.isSafeInteger(value)&&value>0?value:0}
function cellText(value){return value&&value.charAt(0)==='='?"'"+value:value}
function mergeMemory(d){
  var old=readMemory();
  if(typeof d.memoryBase==='number'&&d.memoryBase!==old.memoryRevision){old.ok=false;old.error='stale';return old}
  var next=new Map();
  function add(list,deleted,times){
    list.forEach(function(n){
      var time=memoryTime(times&&times[n]),prev=next.get(n);
      if(!prev||time>prev.time||(time===prev.time&&deleted))next.set(n,{deleted:deleted,time:time});
    });
  }
  add(old.notes,false,old.updated);add(old.deleted,true,old.updated);
  add(memoryStrings(d.notes),false,d.updated);add(memoryStrings(d.deleted),true,d.updated);
  var notes=[],deleted=[];
  next.forEach(function(value,n){(value.deleted?deleted:notes).push(n)});
  function byTime(a,b){return next.get(a).time-next.get(b).time}
  notes=notes.sort(byTime).slice(-60);deleted=deleted.sort(byTime).slice(-200);
  var changed=notes.concat(deleted).some(function(n){return next.get(n).time!==memoryTime(old.updated&&old.updated[n])});
  if(!changed&&JSON.stringify(notes)===JSON.stringify(old.notes)&&JSON.stringify(deleted)===JSON.stringify(old.deleted))return old;
  var sh=tab('記憶'),rev=old.memoryRevision+1,max=Math.max(sh.getLastRow()-1,notes.length,deleted.length);
  var rows=[['記住的事','刪掉的記憶（別台裝置不會再加回來）',rev,'記住時間','刪除時間']];
  for(var i=0;i<max;i++){
    var note=notes[i],removed=deleted[i];
    rows.push([cellText(note||''),cellText(removed||''),'',note?next.get(note).time:'',removed?next.get(removed).time:'']);
  }
  sh.getRange(1,1,rows.length,5).setValues(rows);
  SpreadsheetApp.flush();
  return readMemory();
}
function historyFolder(){
  var id=props().getProperty('HISTORY');
  if(id){try{var f=DriveApp.getFolderById(id);if(!f.isTrashed())return f}catch(e){}}
  var folder=DriveApp.createFolder('夢想藍圖・歷史版本');
  props().setProperty('HISTORY',folder.getId());
  return folder;
}
function archiveFolder(){
  var id=props().getProperty('ARCHIVE');
  if(id){try{var f=DriveApp.getFolderById(id);if(!f.isTrashed())return f}catch(e){}}
  var folder=DriveApp.createFolder('夢想藍圖・封存');
  props().setProperty('ARCHIVE',folder.getId());
  return folder;
}
function setupHistory(){
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    historyFolder();archiveFolder();
    var saved=props().getProperty('TOKEN');
    if(!saved){saved=Utilities.getUuid()+Utilities.getUuid();props().setProperty('TOKEN',saved)}
    console.log('同步密鑰（請勿分享）：'+saved);
  }finally{lock.releaseLock()}
}
function stampName(prefix,at){return prefix+'-'+Utilities.formatDate(new Date(at||Date.now()),Session.getScriptTimeZone(),'yyyy-MM-dd-HHmmss')+'.json'}
function historyMark(folderId,fileId){return 'dream-blueprint:history:'+folderId+':'+fileId}
function insideFolder(f,folderId){
  var parents=f.getParents();while(parents.hasNext())if(parents.next().getId()===folderId)return true;
  return false;
}
function historyPayload(f){
  try{
    var d=JSON.parse(f.getBlob().getDataAsString());
    return d&&typeof d.state==='string'&&d.state&&typeof d.savedAt==='number'?d:null;
  }catch(e){return null}
}
function keepVersion(prefix,state,savedAt){
  var folder=historyFolder(),folderId=folder.getId();
  var latest=folder.createFile(stampName(prefix,Date.now()),JSON.stringify({savedAt:savedAt||0,state:state}),MimeType.PLAIN_TEXT);
  // An unmarked copy remains available as a legacy snapshot even if tagging fails.
  try{
    var latestId=latest.getId();
    latest.setDescription(historyMark(folderId,latestId));
    var previous=[],it=folder.getFiles();
    while(it.hasNext()){
      var f=it.next(),id=f.getId(),mark=historyMark(folderId,id);
      if(id!==latestId&&!f.isTrashed()&&f.getMimeType()===MimeType.PLAIN_TEXT&&f.getDescription()===mark){
        previous.push({file:f,mark:mark,at:f.getDateCreated().getTime()});
      }
    }
    previous.sort(function(a,b){return b.at-a.at});
    for(var i=29;i<previous.length;i++){
      var item=previous[i];
      if(insideFolder(item.file,folderId)&&item.file.getDescription()===item.mark)item.file.setTrashed(true);
    }
  }catch(e){console.warn('新歷史快照已保存，清理未完成。')}
}
function listHistory(){
  var folder=historyFolder(),folderId=folder.getId(),possible=[],it=folder.getFiles();
  var legacyName=/^[a-z-]*-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}[.]json$/;
  while(it.hasNext()){
    var f=it.next();
    if(f.isTrashed()||f.getMimeType()!==MimeType.PLAIN_TEXT)continue;
    var marked=f.getDescription()===historyMark(folderId,f.getId());
    if(marked||legacyName.test(f.getName()))possible.push({file:f,marked:marked,at:f.getDateCreated().getTime()});
  }
  possible.sort(function(a,b){return b.at-a.at});
  var list=[];
  for(var i=0;i<possible.length&&list.length<30;i++){
    var item=possible[i],file=item.file;
    if(item.marked||historyPayload(file))list.push({id:file.getId(),name:file.getName(),at:item.at,size:file.getSize()});
  }
  return {ok:true,history:list};
}
function readVersion(id){
  var folder=historyFolder(),f;
  try{f=DriveApp.getFileById(String(id))}catch(e){return {ok:false,error:'missing'}}
  if(f.isTrashed()||f.getMimeType()!==MimeType.PLAIN_TEXT)return {ok:false,error:'missing'};
  if(!insideFolder(f,folder.getId()))return {ok:false,error:'missing'};
  var d=historyPayload(f);
  return d?{ok:true,state:d.state,savedAt:d.savedAt}:{ok:false,error:'missing'};
}
function logText(value){return SpreadsheetApp.newRichTextValue().setText(value).build()}
function doGet(e){
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var denied=accessError(e.parameter.token);
    if(denied)return out({ok:false,error:denied});
    return out(e.parameter.type==='state'?readState():readMemory());
  }finally{lock.releaseLock()}
}
function doPost(e){
  var d=JSON.parse((e.postData&&e.postData.contents)||'{}');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var denied=accessError(d.token);
    if(denied)return out({ok:false,error:denied});
    var ss=book();
    if(d.type==='state-get')return out(readState());
    if(d.type==='memory-get')return out(readMemory());
    if(d.type==='history-list')return out(listHistory());
    if(d.type==='history-get')return out(readVersion(d.id));
    if(d.type==='history-add'&&typeof d.state==='string'&&d.state){keepVersion(String(d.label||'saved').replace(/[^a-z-]/g,''),d.state,Number(d.savedAt)||0);return out({ok:true,added:true})}
    // Old records the phone is about to tidy away: kept as a file in the archive folder, never trashed.
    if(d.type==='archive-add'&&typeof d.data==='string'&&d.data){var af=archiveFolder();af.createFile(stampName('舊紀錄',Date.now()),d.data,MimeType.PLAIN_TEXT);return out({ok:true,archived:true,folder:af.getUrl()})}
    if(d.type==='log'&&Array.isArray(d.rows)&&d.rows.length){
      var sh=ss.getSheetByName('對話紀錄'),now=new Date(),first=sh.getLastRow()+1,source=logText(String(d.source||''));
      var body=d.rows.map(function(r){return [source,logText(String(r.role||'')),logText(String(r.text||'').slice(0,5000))]});
      sh.getRange(first,2,body.length,3).setRichTextValues(body);
      sh.getRange(first,1,body.length,1).setValues(body.map(function(){return [now]}));
    }
    if(d.type==='memory')return out(mergeMemory(d));
    if(d.type==='state'&&typeof d.state==='string'){
      var old=readState();
      if(typeof d.base!=='number'||old.savedAt!==d.base)return out({ok:false,error:'stale',savedAt:old.savedAt});
      // The copy about to be replaced goes into the history first (at most once an hour, always when asked). A chosen
      // overwrite whose copy could not be kept does not overwrite.
      var last=Number(props().getProperty('LAST_VERSION'))||0,kept=false;
      var want=old.state&&old.state!==d.state&&(d.snapshot===true||Date.now()-last>3600000);
      if(want){try{keepVersion('progress',old.state,old.savedAt);props().setProperty('LAST_VERSION',String(Date.now()));kept=true}catch(err){}}
      if(want&&!kept&&d.snapshot===true)return out({ok:false,error:'history'});
      var savedAt=Math.max(Date.now(),old.savedAt+1);
      var written=false;try{written=writeState(d.state,savedAt)}catch(err){written=false}
      if(!written)return out({ok:false,error:'write'});
      return out({ok:true,state:true,history:true,kept:kept,savedAt:savedAt,url:ss.getUrl()});
    }
    return out({ok:true,url:ss.getUrl()});
  }finally{lock.releaseLock()}
}
`
