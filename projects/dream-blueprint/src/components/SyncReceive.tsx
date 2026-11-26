import { useEffect, useRef, useState } from 'react'
import { driveReadyEvent, importSyncCode, readyCloudScope, sameDrive } from '../lib/drive'
import { keepThisCopy, settleProgress, stamp, takeCloudCopy, type Settled } from '../lib/cloudSync'
import { useModal } from '../lib/modal'
import './pair.css'

type Phase = 'busy' | 'pulled' | 'pushed' | 'same' | 'conflict' | 'chosen' | 'error'

/** On a phone or iPad: opened from the QR code on a connected device; connects to Google Drive by itself. */
export default function SyncReceive({ code, onDone }: { code: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('busy')
  const [msg, setMsg] = useState('')
  const [remoteAt, setRemoteAt] = useState(0)
  const veil = useRef<HTMLDivElement>(null)
  const ran = useRef(false)
  useModal(veil, () => { if (phase !== 'busy') onDone() }, { initial: () => veil.current?.querySelector('button') ?? null, fallback: () => document.getElementById('content') })

  async function run() {
    setPhase('busy'); setMsg('')
    try {
      // Already connected with this code: keep its sync state (connecting again would reset it), just catch up.
      if (!sameDrive(code)) await importSyncCode(code)
      const r: Settled = await settleProgress()
      if (r.kind === 'conflict') { setRemoteAt(r.remoteAt); setPhase('conflict') }
      else setPhase(r.kind === 'none' ? 'same' : r.kind)
    } catch (e) {
      if (readyCloudScope()) window.dispatchEvent(new Event(driveReadyEvent))
      setMsg(e instanceof Error ? e.message : String(e)); setPhase('error')
    }
  }
  async function choose(pick: () => Promise<string>) {
    setPhase('busy')
    try { setMsg(await pick()); setPhase('chosen') } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setPhase('error') }
  }
  // Runs once (React may mount twice while developing; the ref keeps it to one connection).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ran.current) return; ran.current = true; void run() }, [])

  const title = { busy: '連接雲端硬碟中……', pulled: '這台也連上了 ✓', pushed: '連上了 ✓', same: '這台本來就連上了 ✓', conflict: '這台本來也有自己的進度', chosen: '好了 ✓', error: '沒連上' }[phase]
  return <div className="pair-veil" ref={veil} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sync-title" aria-busy={phase === 'busy'}>
    <div className="pair-box">
      <h2 id="sync-title">{title}</h2>
      {phase === 'busy' && <p>正在跟你的 Google 雲端硬碟拿學習進度，等幾秒。</p>}
      {phase === 'pulled' && <p>已經換成雲端硬碟裡最新的學習進度。之後在這台上課，也會自動存回雲端硬碟，換哪一台都接得上。</p>}
      {phase === 'pushed' && <p>雲端硬碟裡還沒有學習進度，已經把這台的進度存上去了。</p>}
      {phase === 'same' && <p>學習進度已經是最新的，直接用就好。</p>}
      {phase === 'conflict' && <p>雲端硬碟裡的進度是 {stamp(remoteAt)} 存的，在別台上過的課都在那一份，通常選它就對了。這台原本的進度會先下載成備份檔（跳出下載就按下載），不會不見。</p>}
      {phase === 'chosen' && <p>{msg}</p>}
      {phase === 'error' && <p className="pair-err" role="alert">{msg}</p>}
      <div className="set-actions">
        {phase === 'conflict' ? <>
          <button type="button" autoFocus onClick={() => choose(takeCloudCopy)}>用雲端那份（建議）</button>
          <button type="button" onClick={() => choose(keepThisCopy)}>用這台這份</button>
          <button type="button" onClick={onDone}>先不要</button>
        </> : phase === 'error' ? <>
          <button type="button" autoFocus onClick={() => void run()}>再試一次</button>
          <button type="button" onClick={onDone}>取消</button>
        </> : phase !== 'busy' && <button type="button" autoFocus onClick={onDone}>開始用</button>}
      </div>
    </div>
  </div>
}
