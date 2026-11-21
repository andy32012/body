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
  if (!json.ok) throw new Error(json.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。' : '雲端硬碟回傳錯誤')
  if (json.url && json.url !== d.sheet) write({ ...d, sheet: json.url })
  return json
}

export async function connectDrive(url: string, token = randomToken()) {
  const clean = url.trim()
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(clean)) throw new Error('網址格式不對，要是 https://script.google.com/macros/s/…/exec')
  write({ url: clean, token })
  try { return await loadDriveMemory() } catch (e) { write(null); throw e }
}

export async function loadDriveMemory(): Promise<string[] | null> {
  const d = read()
  if (!d) return null
  const res = await fetch(d.url + '?token=' + encodeURIComponent(d.token))
  const json = await res.json()
  if (!json.ok) throw new Error(json.error === 'token' ? '雲端硬碟拒絕連線：同步碼不對。' : '雲端硬碟回傳錯誤')
  if (json.url && json.url !== d.sheet) write({ ...d, sheet: json.url })
  return Array.isArray(json.notes) ? json.notes.map(String) : []
}

export function saveDriveMemory(notes: string[]) {
  if (!read()) return
  post({ type: 'memory', notes }).catch(() => { /* offline: next change retries */ })
}

export function driveLog(source: string, rows: { role: string; text: string }[]) {
  const clean = rows.filter(r => r.text.trim())
  if (!read() || !clean.length) return
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

/** Whole progress, stored in chunks on the 「進度」 sheet. */
export async function loadDriveState(): Promise<{ state: string | null; savedAt: number } | null> {
  const d = read()
  if (!d) return null
  const res = await fetch(d.url + '?type=state&token=' + encodeURIComponent(d.token))
  const json = await res.json()
  if (!json.ok) throw new Error(json.error === 'token' ? '同步碼不對' : '雲端硬碟回傳錯誤')
  return { state: typeof json.state === 'string' && json.state ? json.state : null, savedAt: Number(json.savedAt) || 0 }
}
export async function saveDriveState(state: string, savedAt: number) {
  if (!read()) return
  try {
    const json = await post({ type: 'state', state, savedAt })
    if (!json || json.state !== true) throw new Error('雲端小程式還是舊版，需要更新部署')
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
export async function importSyncCode(code: string) {
  let v: { u?: string; t?: string }
  try { v = JSON.parse(atob(code.trim())) } catch { throw new Error('同步碼看不懂，整段重新複製一次。') }
  if (!v.u || !v.t) throw new Error('同步碼不完整。')
  return connectDrive(v.u, v.t)
}

export const appsScriptCode = `// 夢想藍圖・雲端記憶（貼到 script.google.com 新專案，部署成網頁應用程式）
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
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function tab(name){var ss=book();return ss.getSheetByName(name)||ss.insertSheet(name)}
function doGet(e){
  if(!allowed(e.parameter.token))return out({ok:false,error:'token'});
  if(e.parameter.type==='state'){
    var p=tab('進度'),rows=p.getLastRow()-1;
    var parts=rows>0?p.getRange(2,1,rows,1).getValues().map(function(r){return String(r[0]).slice(1)}):[];
    return out({ok:true,state:parts.join('')||null,savedAt:Number(p.getRange(1,2).getValue())||0});
  }
  var ss=book(),sh=ss.getSheetByName('記憶'),n=sh.getLastRow()-1;
  var notes=n>0?sh.getRange(2,1,n,1).getValues().map(function(r){return String(r[0])}).filter(String):[];
  return out({ok:true,notes:notes,url:ss.getUrl()});
}
function doPost(e){
  var d=JSON.parse((e.postData&&e.postData.contents)||'{}');
  if(!allowed(d.token))return out({ok:false,error:'token'});
  var ss=book();
  if(d.type==='log'&&d.rows&&d.rows.length){
    var sh=ss.getSheetByName('對話紀錄'),now=new Date();
    sh.getRange(sh.getLastRow()+1,1,d.rows.length,4).setValues(d.rows.map(function(r){return [now,String(d.source||''),String(r.role||''),String(r.text||'').slice(0,5000)]}));
  }
  if(d.type==='memory'){
    var m=ss.getSheetByName('記憶');
    if(m.getLastRow()>1)m.getRange(2,1,m.getLastRow()-1,1).clearContent();
    var rows=(d.notes||[]).map(function(x){return [String(x)]});
    if(rows.length)m.getRange(2,1,rows.length,1).setValues(rows);
  }
  if(d.type==='state'&&typeof d.state==='string'){
    var p=tab('進度');p.clear();
    p.getRange(1,1,1,2).setValues([['學習進度（網站自動同步，請勿手動修改）',Number(d.savedAt)||Date.now()]]);
    var chunks=[];for(var i=0;i<d.state.length;i+=45000)chunks.push(['~'+d.state.slice(i,i+45000)]);
    if(chunks.length)p.getRange(2,1,chunks.length,1).setNumberFormat('@').setValues(chunks);
    return out({ok:true,state:true,url:ss.getUrl()});
  }
  return out({ok:true,url:ss.getUrl()});
}
`
