import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode } from 'lucide-react'
import { useMemory } from '../lib/memory'
import {
  appsScriptCode, appsScriptVersion, archiveConnectionProblem, archiveFolderUrl, cloudArchive, cloudConflict, cloudScope, cloudScriptVersion, cloudStatus,
  connectDrive, disconnectDrive, driveConfig, driveLogsOn, driveReadyEvent, driveStorageChanged, importSyncCode, loadHistory, setDriveLogs, syncCode, syncLink, type HistoryEntry,
} from '../lib/drive'
import { keepThisCopy, mergeWithCloud, restoreVersion, settleProgress, stamp, takeCloudCopy } from '../lib/cloudSync'
import './pair.css'

/** On a connected device: a QR code that connects a phone or iPad in one scan. */
function SyncQr() {
  const [qr, setQr] = useState('')
  async function show() {
    try { setQr(await QRCode.toDataURL(syncLink(), { margin: 1, width: 280, errorCorrectionLevel: 'L' })) } catch { setQr('') }
  }
  return <div className="pair">
    <strong><QrCode size={15} aria-hidden="true" /> 手機、iPad 掃一下就連上</strong>
    {!qr ? <>
      <p>按下面的按鈕，用手機或 iPad 的相機對著 QR code 掃，點跳出來的連結就會自動連上，學習進度也會一起載入。</p>
      <div className="set-actions"><button type="button" onClick={show}>顯示連接用 QR code</button></div>
    </> : <>
      <img className="pair-qr" src={qr} alt="連接雲端硬碟用的 QR code，用手機或 iPad 的相機掃描" width={280} height={280} />
      <p>用手機或 iPad 的相機對著它，點跳出來的連結。</p>
      <small>這個 QR code 跟同步碼一樣，掃到的人就能看、也能改你的進度，不要給別人掃。</small>
      <div className="set-actions"><button type="button" onClick={() => setQr('')}>關掉</button></div>
    </>}
  </div>
}

/** The versions the cloud script keeps (v3): up to 30, newest first, each one can be restored. */
function CloudHistory({ onStatus }: { onStatus: (message: string) => void }) {
  // undefined: not asked yet; null: the script is older than v3.
  const [list, setList] = useState<HistoryEntry[] | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  async function load() {
    setBusy(true)
    try { setList(await loadHistory()) } catch (e) { onStatus(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function restore(id: string) {
    setBusy(true)
    try { onStatus(await restoreVersion(id)); setPick(null); setList(await loadHistory()) }
    catch (e) { onStatus(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const label = (h: HistoryEntry) => stamp(h.at) + (h.name.startsWith('before-restore') ? '（還原前自動留的）' : '')
  return <details className="set-details" onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && list === undefined) void load() }}>
    <summary>雲端歷史版本（顯示最近 30 份，可以還原）</summary>
    <p>雲端的進度要被蓋掉之前，雲端小程式會先把舊的那份留下來（最多每小時一份，兩台選版本或還原時一定會留）。不小心選錯、資料怪怪的，就從這裡回到之前的某一份。</p>
    {busy && <p>處理中……</p>}
    {list === null && <p className="set-warn">你的雲端小程式還是舊版。請照下面的步驟更新到 v{appsScriptVersion}，之後就會保留歷史版本。</p>}
    {list && !list.length && <p>還沒有歷史版本：下次雲端的進度被更新時，會開始留。</p>}
    {list && list.length > 0 && <div className="set-list">{list.map(h => <div key={h.id}>
      <span>{label(h)}<small> · {Math.max(1, Math.round(h.size / 1024))} KB</small></span>
      {pick === h.id
        ? <span className="set-actions"><button type="button" disabled={busy} onClick={() => void restore(h.id)}>確定還原</button><button type="button" disabled={busy} onClick={() => setPick(null)}>取消</button></span>
        : <button type="button" disabled={busy} onClick={() => setPick(h.id)}>還原這一份</button>}
    </div>)}</div>}
    {pick && <small>還原會把這台裝置和雲端都換成那一份；換之前，現在的進度會先存進歷史版本。</small>}
    {list !== undefined && <div className="set-actions"><button type="button" disabled={busy} onClick={() => void load()}>重新整理</button></div>}
  </details>
}

export default function MemoryPanel() {
  const { notes, remove, clear } = useMemory()
  const [drive, setDrive] = useState(driveConfig())
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')
  const [conflict, setConflict] = useState(cloudConflict())
  const [logs, setLogs] = useState(driveLogsOn())
  const [busy, setBusy] = useState(false)
  const archiveProblem = archiveConnectionProblem()
  useEffect(() => {
    const on = () => { setConflict(cloudConflict()); setDrive(driveConfig()) }
    const storage = (e: StorageEvent) => { if (driveStorageChanged(e)) on() }
    window.addEventListener('dream-blueprint:cloud', on)
    window.addEventListener(driveReadyEvent, on)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('dream-blueprint:cloud', on)
      window.removeEventListener(driveReadyEvent, on)
      window.removeEventListener('storage', storage)
    }
  }, [])

  async function connect(establish?: () => Promise<unknown>) {
    setBusy(true)
    setStatus('連接中……')
    try {
      if (establish) await establish()
      setDrive(driveConfig())
      setKey(''); setCode('')
      try {
        const r = await settleProgress()
        setStatus(r.kind === 'pulled' ? '連上了！已經換成雲端硬碟裡最新的學習進度。'
          : r.kind === 'conflict' ? '連上了。這台和雲端都有進度，請在下面選擇合併或使用其中一份。'
            : '連上了！之後記住的事和學習進度都會存進雲端硬碟。')
      } catch (e) { setStatus('連線設定已保存，請再確認學習進度（' + (e instanceof Error ? e.message : String(e)) + '）。') }
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(syncCode()); setStatus('同步碼已複製，貼到手機的這一格就能連上同一份記憶。') }
    catch { setStatus('複製失敗，請手動選取下面的同步碼。') }
  }
  async function copyScript() {
    try { await navigator.clipboard.writeText(appsScriptCode); setStatus('雲端小程式已複製。') }
    catch { setStatus('複製失敗，請手動選取下面的程式碼。') }
  }
  /** Pick one copy when both changed (the other one is downloaded as a backup first). */
  async function choose(pick: () => Promise<string>) {
    setBusy(true)
    try { setStatus(await pick()) } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) } finally { setDrive(driveConfig()); setBusy(false) }
  }

  return <>
    <p>你在「問問 Claude」或英文口說裡講到重要的事，她們會自己記在這裡，之後每次聊天都會先看過。不想被記得的，可以按「刪掉」。雲端小程式會合併各裝置新增或刪除的記憶。</p>
    {notes.length ? <div className="set-list">
      {notes.map((n, i) => <div key={i + n}><span>{n}</span><button type="button" onClick={() => remove(i)}>刪掉</button></div>)}
    </div> : <p>目前還沒有記住任何事。</p>}
    {notes.length > 0 && <div className="set-actions"><button type="button" onClick={() => clear()}>全部清空</button></div>}

    <h3 className="set-subhead">雲端硬碟</h3>
    {drive ? <>
      {drive.settled === false ? <div className="set-warn" role="status">
        <p>連線設定已保存。確認學習進度後，同一瀏覽器的分頁就會接續自動同步。</p>
        {!conflict && <button type="button" disabled={busy} onClick={() => void connect()}>確認學習進度</button>}
      </div> : <p>已連上。你自己雲端硬碟裡的「夢想藍圖・記憶」試算表會存助教記憶和學習進度。有變動 5 秒後會自動存上去，換手機也會接上。對話逐字稿只有打開下面的開關才會存。</p>}
      <p>手機只留最近的紀錄：太舊的複習紀錄、每天的小紀錄、舊課的批改全文，會先存進雲端硬碟的「夢想藍圖・封存」資料夾，存好了才從手機拿掉，封存的檔案不會被刪{cloudArchive() ? '。' : '（雲端小程式要 v4 以上，照下面「更新雲端小程式」做一次）。'}{archiveFolderUrl() && <> <a href={archiveFolderUrl()} target="_blank" rel="noreferrer">打開封存資料夾</a></>}</p>
      {conflict && <div className="set-warn" role="alert">
        <p><b>兩台裝置的進度不一樣，先暫停同步。</b>雲端硬碟裡有另一台裝置在 {stamp(conflict.remoteAt)} 存的進度，這台裝置也有自己的改動。按「兩份合併」會保留兩台的作答和應補強的課程，也可以選擇其中一份。</p>
        <div className="set-actions">
          <button type="button" disabled={busy} onClick={() => choose(mergeWithCloud)}>兩份合併（建議）</button>
          <button type="button" disabled={busy} onClick={() => choose(takeCloudCopy)}>用雲端那份（這台的先下載成備份）</button>
          <button type="button" disabled={busy} onClick={() => choose(keepThisCopy)}>用這台這份（雲端的先下載成備份）</button>
        </div>
      </div>}
      {(() => { const c = cloudStatus(); return c ? <p className={c.ok ? 'set-ok' : 'set-warn'}>{c.message}（{stamp(c.at)}）</p> : <p>學習進度還沒同步過。</p> })()}
      {archiveProblem && <div className="set-warn" role="status">
        <p>{archiveProblem} 舊紀錄仍保留在這台。</p>
        <button type="button" disabled={busy} onClick={() => void connect()}>重新確認雲端連線</button>
      </div>}
      {drive.sheet && <p><a href={drive.sheet} target="_blank" rel="noreferrer">打開雲端硬碟裡的試算表</a></p>}
      <label className="set-check"><input type="checkbox" checked={logs} onChange={e => { setDriveLogs(e.target.checked); setLogs(e.target.checked) }} />
        這台裝置也把對話逐字稿（問問 Claude、英文口說）存進試算表的「對話紀錄」（預設關）</label>
      <SyncQr key={cloudScope(drive)} />
      <p>掃了沒反應，或是用加到主畫面的 App 開的？就改用同步碼：按下面的按鈕複製，用 LINE 傳給自己，貼到那台的「貼上同步碼」。</p>
      <div className="set-actions">
        <button type="button" onClick={copyCode}>複製同步碼（給手機用）</button>
        <button type="button" disabled={busy} onClick={() => { void disconnectDrive().then(() => { setDrive(driveConfig()); setStatus('這台裝置已中斷雲端硬碟。') }, (e: unknown) => setStatus(String(e))) }}>這台裝置中斷連線</button>
      </div>
      <textarea readOnly rows={2} value={syncCode()} aria-label="同步碼" onFocus={e => e.target.select()} />
      <CloudHistory key={cloudScope(drive)} onStatus={setStatus} />
      <details className="set-details">
        <summary>{cloudScriptVersion() >= appsScriptVersion ? `雲端小程式 v${appsScriptVersion}` : `更新雲端小程式到 v${appsScriptVersion}（同步、對話與封存）`}</summary>
        <ol>
          <li>打開 script.google.com 裡原本的「夢想藍圖」專案，把程式碼全部換成下面這段，按儲存。</li>
          <li>如果舊專案尚未設定同步密鑰，在函式選單選「setupHistory」，按「執行」，照畫面允許存取雲端硬碟。已設定過的專案可直接更新部署。</li>
          <li>右上選「部署」→「管理部署作業」→ 鉛筆圖示 → 版本選「新版本」→「部署」。原本網址和同步碼可繼續使用。</li>
        </ol>
        <div className="set-actions"><button type="button" onClick={copyScript}>複製雲端小程式</button></div>
        <textarea readOnly rows={6} value={appsScriptCode} aria-label="雲端小程式程式碼" onFocus={e => e.target.select()} />
      </details>
    </> : <>
      <p>連上之後，記住的事和整份學習進度會存進你自己的 Google 雲端硬碟，電腦和手機共用同一份。對話逐字稿預設不存。</p>
      <label className="set-field">網頁應用程式網址<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
      <label className="set-field">同步密鑰<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="Apps Script 執行記錄中的密鑰" /></label>
      <div className="set-actions"><button type="button" disabled={busy || !url.trim() || !key.trim()} onClick={() => void connect(() => connectDrive(url, key))}>連接雲端硬碟</button></div>
      <label className="set-field">已經在別台裝置連過？貼上同步碼<input value={code} onChange={e => setCode(e.target.value)} placeholder="同步碼" /></label>
      <div className="set-actions"><button type="button" disabled={busy || !code.trim()} onClick={() => void connect(() => importSyncCode(code))}>用同步碼連接</button></div>
      <details className="set-details">
        <summary>查看雲端小程式 v{appsScriptVersion}（新設定或更新部署）</summary>
        <p>已有專案時，把下方程式碼貼回原專案。從「部署 → 管理部署作業」編輯原部署，選「新版本」並部署，沿用原網址和同步密鑰。</p>
        <p>第一次設定：</p>
        <ol>
          <li>到 script.google.com 開一個新專案，把下面的程式碼全部貼上，按儲存。</li>
          <li>上面的函式選單選「setupHistory」，按「執行」，照畫面允許存取雲端硬碟。到執行記錄複製「同步密鑰」並貼到上方。</li>
          <li>「部署」→「新增部署作業」→ 類型選「網頁應用程式」，執行身分選自己、存取權選「所有人」→ 部署，把網址貼到上方，再按「連接雲端硬碟」。</li>
        </ol>
        <div className="set-actions"><button type="button" onClick={copyScript}>複製雲端小程式</button></div>
        <textarea readOnly rows={6} value={appsScriptCode} aria-label="雲端小程式程式碼" onFocus={e => e.target.select()} />
      </details>
    </>}
    <small role="status">{status}</small>
  </>
}
