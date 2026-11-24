/**
 * Google Drive memory through the learner's own Apps Script web app.
 * The script saves conversations and memory notes into a spreadsheet in their Drive.
 * The web app URL and a random token stay in this browser; the script trusts the first token it sees.
 */
const KEY = 'dream-blueprint.drive'
type Drive = { url: string; token: string; sheet?: string }

function read(): Drive | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.url && v.token ? v : null } catch { return null }
}
function write(v: Drive | null) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* private mode */ }
}
export const driveConfig = read
export const driveConnected = () => !!read()
export function disconnectDrive() { write(null) }

function randomToken() {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

async function post(body: object) {
  const d = read()
  if (!d) return null
  const res = await fetch(d.url, { method: 'POST', body: JSON.stringify({ ...body, token: d.token }) })
  const json = await res.json()
  // "stale" is an answer, not a failure: the cloud has a newer snapshot than the one this device started from.
  if (!json.ok && json.error !== 'stale') throw new Error(json.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。' : '雲端硬碟回傳錯誤')
  if (json.url && json.url !== d.sheet) write({ ...d, sheet: json.url })
  if (json.cas) markCas()
  return json
}
/** Reads go by POST so the sync token is never in a URL; an older script that only reads by GET still works. */
async function get(type: 'state' | 'memory') {
  const d = read()
  if (!d) return null
  const json = await post({ type: type + '-get' })
  if (json && (type === 'state' ? 'state' in json : Array.isArray(json.notes))) return json
  const res = await fetch(d.url + (type === 'state' ? '?type=state&' : '?') + 'token=' + encodeURIComponent(d.token))
  const old = await res.json()
  if (!old.ok) throw new Error(old.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。' : '雲端硬碟回傳錯誤')
  if (old.url && old.url !== d.sheet) write({ ...d, sheet: old.url })
  return old
}

export async function connectDrive(url: string, token = randomToken()) {
  const clean = url.trim()
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(clean)) throw new Error('網址格式不對，要是 https://script.google.com/macros/s/…/exec')
  write({ url: clean, token })
  setCloudBase(0); clearConflict()
  try { return await loadDriveMemory() } catch (e) { write(null); throw e }
}

export type DriveMemory = { notes: string[]; deleted: string[] }
export async function loadDriveMemory(): Promise<DriveMemory | null> {
  const json = await get('memory')
  if (!json) return null
  return { notes: Array.isArray(json.notes) ? json.notes.map(String) : [], deleted: Array.isArray(json.deleted) ? json.deleted.map(String) : [] }
}

/** Deleted notes travel too, so a note removed on one device does not come back from another. */
export function saveDriveMemory(notes: string[], deleted: string[] = []) {
  if (!read()) return
  post({ type: 'memory', notes, deleted }).catch(() => { /* offline: next change retries */ })
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
}

/** The cloud snapshot this device last loaded or saved (its savedAt). A save says which snapshot it started from;
 *  if the cloud has moved on since, nothing is overwritten and both copies are kept until the learner chooses. */
const BASE = 'dream-blueprint.cloud-base'
const CONFLICT = 'dream-blueprint.cloud-conflict'
const CAS = 'dream-blueprint.cloud-cas'
export function cloudBase() { try { return Number(localStorage.getItem(BASE)) || 0 } catch { return 0 } }
export function setCloudBase(at: number) { try { localStorage.setItem(BASE, String(at)) } catch { /* optional */ } }
export type CloudConflict = { remoteAt: number; found: number }
export function cloudConflict(): CloudConflict | null { try { return JSON.parse(localStorage.getItem(CONFLICT) || 'null') } catch { return null } }
export function markConflict(remoteAt: number) {
  try { localStorage.setItem(CONFLICT, JSON.stringify({ remoteAt, found: Date.now() })) } catch { /* optional */ }
  setStatus(false, '雲端硬碟有另一台裝置存的新進度，這台也有改動：先暫停同步、兩份都保留，請到設定 → 雲端硬碟選要留哪一份。')
  window.dispatchEvent(new Event('dream-blueprint:cloud'))
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
export async function loadHistoryVersion(id: string): Promise<{ state: string; savedAt: number }> {
  let json: { state?: unknown; savedAt?: unknown } | null
  try { json = await post({ type: 'history-get', id }) } catch { json = null }
  if (!json || typeof json.state !== 'string' || !json.state) throw new Error('這個版本讀不到了，換另一份試試。')
  return { state: json.state, savedAt: Number(json.savedAt) || 0 }
}
/** Puts a copy into the history without changing the current cloud progress. False when the script cannot. */
export async function addHistory(state: string, savedAt: number, label: string) {
  try { const json = await post({ type: 'history-add', state, savedAt, label }); return json?.added === true } catch { return false }
}

/** What to do when the app opens: take the cloud copy, push this one, or stop because both changed. Pure, for testing. */
export function syncDecision(remoteAt: number | null, base: number, localAt: number): 'pull' | 'push' | 'conflict' | 'none' {
  if (remoteAt !== null && remoteAt > base) return localAt > base ? 'conflict' : 'pull'
  return remoteAt === null || localAt > base ? 'push' : 'none'
}

/** Whole progress, stored in chunks on the 「進度」 sheet. */
export async function loadDriveState(): Promise<{ state: string | null; savedAt: number } | null> {
  const json = await get('state')
  if (!json) return null
  return { state: typeof json.state === 'string' && json.state ? json.state : null, savedAt: Number(json.savedAt) || 0 }
}
/** Saves only if the cloud still holds the snapshot this device started from (`base`), unless `force` (a chosen overwrite). */
export async function saveDriveState(state: string, savedAt: number, base = cloudBase(), force = false) {
  if (!read()) return
  if (cloudConflict() && !force) return
  try {
    // An older script cannot check `base` itself, so look first.
    if (!force && !cloudCas()) {
      const remote = await loadDriveState()
      if (remote?.state && remote.savedAt > base) { markConflict(remote.savedAt); return }
    }
    // A chosen overwrite asks the script to keep the cloud copy in its history first (v3; older scripts ignore it).
    const json = await post({ type: 'state', state, savedAt, ...(force ? { snapshot: true } : { base }) })
    if (json?.history === true) markHistory()
    if (json?.error === 'stale') { markConflict(Number(json.savedAt) || 0); return }
    if (!json || json.state !== true) throw new Error('雲端小程式還是舊版，需要更新部署')
    setCloudBase(savedAt)
    setStatus(true, '學習進度已存到雲端硬碟')
  } catch (e) {
    setStatus(false, '同步失敗：' + (e instanceof Error ? e.message : String(e)) + '，下次有變動會再試')
  }
}
export function noteSynced(message: string) { setStatus(true, message) }

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

export const appsScriptCode = `// 夢想藍圖・雲端記憶 v3（貼到 script.google.com 的專案，部署成網頁應用程式）
// v2：存進度前會檢查雲端是不是已經有另一台裝置存的新版本，不會互相蓋掉；刪掉的記憶也會同步刪除。
// v3：每次蓋掉雲端的進度之前，最多每小時把舊的那份存進雲端硬碟的「夢想藍圖・歷史版本」資料夾，留最新 30 份，可以在網站還原。
// 第一次換成 v3：上面選 setupHistory，按「執行」，照畫面允許存取雲端硬碟，再部署新版本。
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
function allowed(t){
  if(!t)return false;
  var saved=props().getProperty('TOKEN');
  if(!saved){props().setProperty('TOKEN',t);return true}
  return saved===t;
}
function out(o){o.cas=true;return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function tab(name){var ss=book();return ss.getSheetByName(name)||ss.insertSheet(name)}
function column(name){var sh=tab(name),n=sh.getLastRow()-1;return n>0?sh.getRange(2,1,n,1).getValues().map(function(r){return String(r[0])}).filter(String):[]}
function setColumn(name,head,list){var sh=tab(name);sh.clear();sh.getRange(1,1).setValue(head);var rows=(list||[]).map(function(x){return [String(x)]});if(rows.length)sh.getRange(2,1,rows.length,1).setValues(rows)}
function readState(){
  var p=tab('進度'),rows=p.getLastRow()-1;
  var parts=rows>0?p.getRange(2,1,rows,1).getValues().map(function(r){return String(r[0]).slice(1)}):[];
  return {ok:true,state:parts.join('')||null,savedAt:Number(p.getRange(1,2).getValue())||0};
}
function readMemory(){return {ok:true,notes:column('記憶'),deleted:column('已刪除的記憶'),url:book().getUrl()}}
function historyFolder(){
  var id=props().getProperty('HISTORY');
  if(id){try{var f=DriveApp.getFolderById(id);if(!f.isTrashed())return f}catch(e){}}
  var folder=DriveApp.createFolder('夢想藍圖・歷史版本');
  props().setProperty('HISTORY',folder.getId());
  return folder;
}
function setupHistory(){historyFolder()}
function stampName(prefix,at){return prefix+'-'+Utilities.formatDate(new Date(at||Date.now()),Session.getScriptTimeZone(),'yyyy-MM-dd-HHmmss')+'.json'}
function keepVersion(prefix,state,savedAt){
  var folder=historyFolder();
  folder.createFile(stampName(prefix,Date.now()),JSON.stringify({savedAt:savedAt||0,state:state}),MimeType.PLAIN_TEXT);
  var files=[],it=folder.getFiles();while(it.hasNext())files.push(it.next());
  files.sort(function(a,b){return b.getDateCreated().getTime()-a.getDateCreated().getTime()});
  for(var i=30;i<files.length;i++)files[i].setTrashed(true);
}
function listHistory(){
  var folder=historyFolder(),list=[],it=folder.getFiles();
  while(it.hasNext()){var f=it.next();list.push({id:f.getId(),name:f.getName(),at:f.getDateCreated().getTime(),size:f.getSize()})}
  list.sort(function(a,b){return b.at-a.at});
  return {ok:true,history:list.slice(0,30)};
}
function readVersion(id){
  var folder=historyFolder(),f;
  try{f=DriveApp.getFileById(String(id))}catch(e){return {ok:false,error:'missing'}}
  var inside=false,ps=f.getParents();while(ps.hasNext())if(ps.next().getId()===folder.getId())inside=true;
  if(!inside)return {ok:false,error:'missing'};
  var d=JSON.parse(f.getBlob().getDataAsString());
  return {ok:true,state:String(d.state||''),savedAt:Number(d.savedAt)||0};
}
function doGet(e){
  if(!allowed(e.parameter.token))return out({ok:false,error:'token'});
  return out(e.parameter.type==='state'?readState():readMemory());
}
function doPost(e){
  var d=JSON.parse((e.postData&&e.postData.contents)||'{}');
  if(!allowed(d.token))return out({ok:false,error:'token'});
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var ss=book();
    if(d.type==='state-get')return out(readState());
    if(d.type==='memory-get')return out(readMemory());
    if(d.type==='history-list')return out(listHistory());
    if(d.type==='history-get')return out(readVersion(d.id));
    if(d.type==='history-add'&&typeof d.state==='string'&&d.state){keepVersion(String(d.label||'saved').replace(/[^a-z-]/g,''),d.state,Number(d.savedAt)||0);return out({ok:true,added:true})}
    if(d.type==='log'&&d.rows&&d.rows.length){
      var sh=ss.getSheetByName('對話紀錄'),now=new Date();
      sh.getRange(sh.getLastRow()+1,1,d.rows.length,4).setValues(d.rows.map(function(r){return [now,String(d.source||''),String(r.role||''),String(r.text||'').slice(0,5000)]}));
    }
    if(d.type==='memory'){setColumn('記憶','記住的事',d.notes);setColumn('已刪除的記憶','刪掉的記憶（別台裝置不會再加回來）',d.deleted)}
    if(d.type==='state'&&typeof d.state==='string'){
      var p=tab('進度'),current=Number(p.getRange(1,2).getValue())||0;
      if(typeof d.base==='number'&&current>d.base)return out({ok:false,error:'stale',savedAt:current});
      // The copy about to be replaced goes into the history first (at most once an hour, always when asked).
      var old=readState(),last=Number(props().getProperty('LAST_VERSION'))||0;
      if(old.state&&old.state!==d.state&&(d.snapshot===true||Date.now()-last>3600000)){
        try{keepVersion('progress',old.state,old.savedAt);props().setProperty('LAST_VERSION',String(Date.now()))}catch(err){}
      }
      p.clear();
      p.getRange(1,1,1,2).setValues([['學習進度（網站自動同步，請勿手動修改）',Number(d.savedAt)||Date.now()]]);
      var chunks=[];for(var i=0;i<d.state.length;i+=45000)chunks.push(['~'+d.state.slice(i,i+45000)]);
      if(chunks.length)p.getRange(2,1,chunks.length,1).setNumberFormat('@').setValues(chunks);
      return out({ok:true,state:true,history:true,url:ss.getUrl()});
    }
    return out({ok:true,url:ss.getUrl()});
  }finally{lock.releaseLock()}
}
`
