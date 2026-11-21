import { useState } from 'react'
import { applyMemory, useMemory } from '../lib/memory'
import { localModified, restoreBackup } from '../lib/store'
import { cloudStatus, loadDriveState, noteSynced, connectDrive, disconnectDrive, driveConfig, importSyncCode, syncCode } from '../lib/drive'

export default function MemoryPanel() {
  const { notes, update, remove, clear } = useMemory()
  const [drive, setDrive] = useState(driveConfig())
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')

  async function connect(fn: () => Promise<string[] | null>) {
    setStatus('連接中……')
    try {
      const list = await fn()
      if (list) update(applyMemory([], list, []).filter(n => !notes.includes(n)), [])
      setDrive(driveConfig())
      const remote = await loadDriveState().catch(() => null)
      if (remote?.state && remote.savedAt > localModified()) {
        restoreBackup(remote.state, remote.savedAt)
        noteSynced('已從雲端硬碟載入最新的學習進度')
        setStatus('連上了！已經換成雲端硬碟裡最新的學習進度。')
      } else setStatus('連上了！之後的對話、記憶和學習進度都會存進雲端硬碟。')
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(syncCode()); setStatus('同步碼已複製，貼到手機的這一格就能連上同一份記憶。') }
    catch { setStatus('複製失敗，請手動選取下面的同步碼。') }
  }

  return <>
    <p>你在「問問 Claude」或英文口說裡講到重要的事，她們會自己記在這裡，之後每次聊天都會先看過。不想被記得的，按「刪掉」就好。</p>
    {notes.length ? <div className="set-list">
      {notes.map((n, i) => <div key={i + n}><span>{n}</span><button type="button" onClick={() => remove(i)}>刪掉</button></div>)}
    </div> : <p>目前還沒有記住任何事。</p>}
    {notes.length > 0 && <div className="set-actions"><button type="button" onClick={() => clear()}>全部清空</button></div>}

    <h3 className="set-subhead">雲端硬碟</h3>
    {drive ? <>
      <p>已連上。雲端硬碟的「夢想藍圖・記憶」試算表裡：「對話紀錄」是每一句對話，「記憶」是她們記住的事，「進度」是整份學習進度（課表、單字、複習卡、勾選），有變動 5 秒後自動存上去，換手機也會自動接上。</p>
      {(() => { const c = cloudStatus(); return c ? <p className={c.ok ? 'set-ok' : 'set-warn'}>{c.message}（{new Date(c.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）</p> : <p>學習進度還沒同步過。</p> })()}
      {drive.sheet && <p><a href={drive.sheet} target="_blank" rel="noreferrer">打開雲端硬碟裡的試算表</a></p>}
      <div className="set-actions">
        <button type="button" onClick={copyCode}>複製同步碼（給手機用）</button>
        <button type="button" onClick={() => { disconnectDrive(); setDrive(null); setStatus('這台裝置已中斷雲端硬碟。') }}>這台裝置中斷連線</button>
      </div>
      <textarea readOnly rows={2} value={syncCode()} aria-label="同步碼" onFocus={e => e.target.select()} />
    </> : <>
      <p>連上之後，你說的話、記住的事和整份學習進度會自動存進你自己的 Google 雲端硬碟，電腦和手機會共用同一份。</p>
      <label className="set-field">網頁應用程式網址<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
      <div className="set-actions"><button type="button" disabled={!url.trim()} onClick={() => connect(() => connectDrive(url))}>連接雲端硬碟</button></div>
      <label className="set-field">已經在別台裝置連過？貼上同步碼<input value={code} onChange={e => setCode(e.target.value)} placeholder="同步碼" /></label>
      <div className="set-actions"><button type="button" disabled={!code.trim()} onClick={() => connect(() => importSyncCode(code))}>用同步碼連接</button></div>
    </>}
    <small role="status">{status}</small>
  </>
}
