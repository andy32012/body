import { useEffect, useRef, useState } from 'react'
import { cloudScope, driveForSyncCode, driveReadyEvent, importSyncCode, readyCloudScope } from '../lib/drive'
import { keepThisCopy, settleProgress, stamp, takeCloudCopy } from '../lib/cloudSync'
import { useModal } from '../lib/modal'
import './pair.css'

type Phase = 'busy' | 'pulled' | 'pushed' | 'same' | 'conflict' | 'chosen' | 'error'

/** On a phone or iPad: opened from the QR code on a connected device; connects to Google Drive by itself. */
export default function SyncReceive({ code, signal, onDone }: { code: string; signal: AbortSignal; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('busy')
  const [msg, setMsg] = useState('')
  const [conflict, setConflict] = useState<{ scope: string; remoteAt: number } | null>(null)
  const veil = useRef<HTMLDivElement>(null)
  const ran = useRef(false)
  const inFlight = useRef(false)
  useModal(veil, () => { if (phase !== 'busy') onDone() }, { initial: () => veil.current?.querySelector('button') ?? null, fallback: () => document.getElementById('content') })

  async function run() {
    if (inFlight.current || signal.aborted) return
    inFlight.current = true
    setPhase('busy'); setMsg('')
    try {
      const current = driveForSyncCode(code)
      const scope = (current && cloudScope(current)) ?? (await importSyncCode(code, signal)).scope
      const r = await settleProgress({ scope, signal })
      if (signal.aborted) return
      if (r.kind === 'conflict') {
        setConflict({ scope, remoteAt: r.remoteAt })
        setPhase('conflict')
      }
      else setPhase(r.kind === 'none' ? 'same' : r.kind)
    } catch (e) {
      if (signal.aborted) return
      if (readyCloudScope()) window.dispatchEvent(new Event(driveReadyEvent))
      setMsg(e instanceof Error ? e.message : String(e)); setPhase('error')
    } finally {
      inFlight.current = false
    }
  }
  async function choose(pick: typeof takeCloudCopy) {
    if (!conflict || inFlight.current || signal.aborted) return
    inFlight.current = true
    setPhase('busy')
    try {
      const message = await pick({ ...conflict, signal })
      if (!signal.aborted) { setMsg(message); setPhase('chosen') }
    } catch (e) {
      if (!signal.aborted) { setMsg(e instanceof Error ? e.message : String(e)); setPhase('error') }
    } finally {
      inFlight.current = false
    }
  }
  // Runs once (React may mount twice while developing; the ref keeps it to one connection).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ran.current) return; ran.current = true; void run() }, [])

  const title = { busy: '正在確認雲端學習進度……', pulled: '這台已連上 ✓', pushed: '這台已連上 ✓', same: '這台已連上 ✓', conflict: '請選擇要使用的學習進度', chosen: '好了 ✓', error: '同步未完成' }[phase]
  return <div className="pair-veil" ref={veil} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sync-title" aria-busy={phase === 'busy'}>
    <div className="pair-box">
      <h2 id="sync-title">{title}</h2>
      {phase === 'busy' && <p>正在跟你的 Google 雲端硬碟拿學習進度，等幾秒。</p>}
      {phase === 'pulled' && <p>已經換成雲端硬碟裡最新的學習進度。之後在這台上課，也會自動存回雲端硬碟，換哪一台都接得上。</p>}
      {phase === 'pushed' && <p>已把這台的學習進度存到雲端硬碟。</p>}
      {phase === 'same' && <p>雲端硬碟已連接，目前沒有需要同步的學習進度。</p>}
      {phase === 'conflict' && conflict && <p>雲端硬碟裡的進度是 {stamp(conflict.remoteAt)} 存的，這台也有自己的學習進度。選定其中一份前，另一份會先下載成備份檔。</p>}
      {phase !== 'error' && phase !== 'chosen' && <p>學習進度包含學校與班級、課程作答和程度測驗的口說逐字稿。問問 Claude 和英文口說的對話逐字稿由設定中的開關管理。</p>}
      {phase === 'chosen' && <p>{msg}</p>}
      {phase === 'error' && <p className="pair-err" role="alert">{msg}</p>}
      <div className="set-actions">
        {phase === 'conflict' ? <>
          <button type="button" autoFocus onClick={() => choose(takeCloudCopy)}>用雲端那份</button>
          <button type="button" onClick={() => choose(keepThisCopy)}>用這台這份</button>
          <button type="button" onClick={onDone}>先不要</button>
        </> : phase === 'error' ? <>
          <button type="button" autoFocus onClick={() => void run()}>重新確認連線與進度</button>
          <button type="button" onClick={onDone}>取消</button>
        </> : phase !== 'busy' && <button type="button" autoFocus onClick={onDone}>開始用</button>}
      </div>
    </div>
  </div>
}
