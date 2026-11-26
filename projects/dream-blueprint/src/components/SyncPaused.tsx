import { useEffect, useState } from 'react'
import { CloudAlert } from 'lucide-react'
import { cloudConflict, driveConnected } from '../lib/drive'
import { mergeWithCloud, stamp } from '../lib/cloudSync'
import './sync-paused.css'

/** On every page while syncing is paused because two devices both changed the progress: one tap merges both. Before
 *  this, the pause was only mentioned inside Settings, so progress could sit on one device unnoticed. */
export default function SyncPaused() {
  const [conflict, setConflict] = useState(cloudConflict)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const on = () => setConflict(cloudConflict())
    window.addEventListener('dream-blueprint:cloud', on)
    window.addEventListener('storage', on)
    window.addEventListener('focus', on)
    return () => {
      window.removeEventListener('dream-blueprint:cloud', on)
      window.removeEventListener('storage', on)
      window.removeEventListener('focus', on)
    }
  }, [])
  if (message) return <p className="sync-paused sync-done" role="status">{message}<button type="button" onClick={() => setMessage('')}>好</button></p>
  if (!conflict || !driveConnected()) return null
  async function merge() {
    setBusy(true)
    // Read again afterwards: a merge that kept meeting newer saves stays paused and merges again later.
    try { setMessage(await mergeWithCloud()); setConflict(cloudConflict()) }
    catch (e) { setMessage('合併失敗：' + (e instanceof Error ? e.message : String(e)) + '。網路好了再按一次，兩份都還在。') }
    finally { setBusy(false) }
  }
  return <section className="sync-paused" role="alert">
    <CloudAlert size={20} aria-hidden="true" />
    <div>
      <b>雲端同步暫停了</b>
      <small>另一台裝置在 {stamp(conflict.remoteAt)} 存了進度，這台也有改動。按「兩份合併」會保留兩台的作答和應補強的課程。</small>
    </div>
    <button type="button" className="sync-merge" disabled={busy} onClick={() => void merge()}>{busy ? '合併中……' : '兩份合併'}</button>
  </section>
}
