/**
 * Which progress a device uses after connecting to Google Drive, shared by Settings and the scan-to-connect dialog.
 * Nothing is thrown away: when one copy replaces the other, the replaced copy is downloaded as a backup file first.
 */
import { exportBackup, getSnapshot, localModified, restoreBackup, setLocalModified } from './store'
import {
  clearConflict, cloudBase, cloudStatus, driveReadyEvent, loadDriveState, markConflict, noteSynced, saveDriveState, setCloudBase, syncDecision,
} from './drive'

export const stamp = (at: number) => new Date(at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Backup file names stay ASCII: some browsers fall back to a bare "download" for other characters. */
const backupName = (which: 'this-device' | 'cloud') =>
  'dream-blueprint-backup-' + which + '-' + new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '-').replace(':', '') + '.json'

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  // Some browsers only honour the file name for a link that is in the page.
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A save reports through the cloud status line; turn a failure written since `since` into an error. */
function failedSince(since: number) {
  const s = cloudStatus()
  if (s && !s.ok && s.at >= since) throw new Error(s.message)
}

export type Settled = { kind: 'pulled' | 'pushed' | 'none' } | { kind: 'conflict'; remoteAt: number }
/** Take the cloud copy, push this one, or stop and ask when both changed since this device last synced. */
export async function settleProgress(): Promise<Settled> {
  try {
    const remote = await loadDriveState()
    const decision = syncDecision(remote?.state ? remote.savedAt : null, cloudBase(), localModified())
    if (decision === 'pull' && remote?.state) {
      restoreBackup(remote.state, remote.savedAt); setCloudBase(remote.savedAt)
      noteSynced('已從雲端硬碟載入最新的學習進度')
      return { kind: 'pulled' }
    }
    if (decision === 'conflict' && remote) { markConflict(remote.savedAt); return { kind: 'conflict', remoteAt: remote.savedAt } }
    if (decision === 'push') {
      const since = Date.now()
      const at = localModified() || since; setLocalModified(at)
      await saveDriveState(JSON.stringify(getSnapshot().state), at)
      failedSince(since)
      return { kind: 'pushed' }
    }
    return { kind: 'none' }
  } finally {
    // From here on, changes on this device are saved to the cloud (a save still checks the cloud first).
    window.dispatchEvent(new Event(driveReadyEvent))
  }
}

/** Use the cloud copy here; this device's progress is downloaded first so nothing is lost. */
export async function takeCloudCopy() {
  const remote = await loadDriveState()
  if (!remote?.state) throw new Error('雲端硬碟裡沒有進度可以載入。')
  download(backupName('this-device'), exportBackup(getSnapshot().state))
  restoreBackup(remote.state, remote.savedAt); setCloudBase(remote.savedAt); clearConflict()
  noteSynced('已換成雲端硬碟的進度（這台原本的進度已下載成備份檔）')
  return '已換成雲端硬碟的進度。這台原本的進度下載成備份檔了，需要時可以到「備份」匯入。'
}
/** Keep this device's copy; the cloud copy is downloaded first, then overwritten on purpose. */
export async function keepThisCopy() {
  const remote = await loadDriveState()
  if (remote?.state) download(backupName('cloud'), remote.state)
  clearConflict()
  const since = Date.now()
  await saveDriveState(JSON.stringify(getSnapshot().state), localModified() || since, remote?.savedAt ?? 0, true)
  failedSince(since)
  return '已用這台裝置的進度蓋掉雲端那份。雲端原本的進度下載成備份檔了。'
}
