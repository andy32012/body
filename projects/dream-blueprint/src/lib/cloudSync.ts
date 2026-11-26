/**
 * Which progress a device uses after connecting to Google Drive, shared by Settings and the scan-to-connect dialog.
 * Nothing is thrown away: when one copy replaces the other, the replaced copy is downloaded as a backup file first.
 */
import { exportBackup, getSnapshot, importBackup, localModified, replaceIfUnchanged, restoreBackup, setLocalModified, updateStoreNow } from './store'
import { mergeStates } from './merge'
import {
  addHistory, clearConflict, cloudBase, cloudConflict, cloudStatus, driveConnected, driveReadyEvent, loadDriveState, loadHistoryVersion, markConflict, markMergeWaiting, noteSynced, saveDriveState, setCloudBase, syncDecision,
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
    const seen = localModified()
    const decision = syncDecision(remote?.state ? remote.savedAt : null, cloudBase(), seen)
    if (decision === 'pull' && remote?.state) {
      // Only if nothing changed here while the cloud was being read; otherwise both are kept (merged).
      if (await replaceIfUnchanged(remote.state, remote.savedAt, seen)) {
        setCloudBase(remote.savedAt)
        noteSynced('已從雲端硬碟載入最新的學習進度')
        return { kind: 'pulled' }
      }
      await mergeWithCloud(true)
      return { kind: 'pushed' }
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
/** How many times a merge is saved, each save checked against the cloud copy it merged, before it stops and waits. */
export const mergeRounds = 4
let merging: Promise<string> | null = null
/** Keep both: this device's progress and the cloud copy merged into one, saved here and to the cloud. This device's copy
 *  is downloaded first and the cloud copy goes into the cloud history, so nothing can be lost. One merge runs at a time:
 *  the banner's button and the automatic catch-up pressed together share the same merge. */
export function mergeWithCloud(quiet = false): Promise<string> {
  if (!merging) merging = mergeNow(quiet).finally(() => { merging = null })
  return merging
}
async function mergeNow(quiet: boolean) {
  const first = await loadDriveState()
  if (!first?.state) throw new Error('雲端硬碟裡沒有進度可以合併。')
  let remote = { state: first.state, savedAt: first.savedAt }
  const mine = getSnapshot().state
  // A merge done by itself keeps this device's copy in the cloud history instead of a download (a download only when
  // the script cannot keep history).
  if (!quiet || !(await addHistory(JSON.stringify(mine), localModified() || Date.now(), 'before-merge'))) download(backupName('this-device'), exportBackup(mine))
  let merged = mine
  for (let round = 1; ; round++) {
    const theirs = importBackup(remote.state)
    const mineNewer = localModified() >= remote.savedAt
    const now = Date.now()
    // Merged into the progress as it is when the store writes it, so a step finished while the cloud was being read
    // stays; checked as a progress file before it replaces anything.
    merged = await updateStoreNow(prev => importBackup(JSON.stringify(mergeStates(prev, theirs, mineNewer))), now)
    clearConflict()
    const since = Date.now()
    // Saved only if the cloud still holds the copy just merged; when another device saved meanwhile, that copy is
    // merged too. Never forced: a cloud copy this device has not merged in is never overwritten.
    await saveDriveState(JSON.stringify(merged), now, remote.savedAt)
    const refused = cloudConflict()
    if (!refused) { failedSince(since); break }
    if (round >= mergeRounds) {
      // Still racing another device: keep the merged progress here and merge again later, instead of overwriting.
      markMergeWaiting(refused.remoteAt)
      return '另一台裝置一直有新進度存進雲端，這次合併好的先留在這台（兩台做過的都在），等一下會自己再合併一次。'
    }
    const again = await loadDriveState()
    if (!again?.state) { failedSince(since); break }
    remote = { state: again.state, savedAt: again.savedAt }
  }
  noteSynced('兩份進度已合併，也存到雲端硬碟了')
  const c = merged.curriculum
  return '兩份合併好了：兩台做過的都留著，課表接在單元 ' + c.unit + ' 第 ' + c.day + ' 天。' + (quiet ? '' : '這台原本的進度也下載成備份檔了。')
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

/** Go back to a version kept in the cloud history. This device's progress goes into the history first (or, with a
 *  script that cannot, is downloaded), so going back can itself be undone; the cloud copy is kept by the script too. */
export async function restoreVersion(id: string) {
  const version = await loadHistoryVersion(id)
  // Checked before anything changes: a version that does not read as progress is not restored.
  const state = importBackup(version.state)
  const mine = JSON.stringify(getSnapshot().state)
  if (!(await addHistory(mine, localModified() || Date.now(), 'before-restore'))) download(backupName('this-device'), exportBackup(getSnapshot().state))
  const now = Date.now()
  restoreBackup(version.state, now)
  clearConflict()
  const since = Date.now()
  await saveDriveState(JSON.stringify(state), now, cloudBase(), true)
  failedSince(since)
  return '已經還原到 ' + stamp(version.savedAt || now) + ' 那份進度。還原前的進度存進了歷史版本，想反悔可以再還原回去。'
}

/** What to do when the app opens or comes back to the screen: take the cloud copy when only the cloud changed, merge
 *  when both changed (or a pause is still recorded), save when only this device changed. Pure, for testing. */
export function settleAction(decision: ReturnType<typeof syncDecision>, paused: boolean): 'pull' | 'merge' | 'push' | 'none' {
  if (paused || decision === 'conflict') return 'merge'
  return decision
}
/** Keeps the devices in step without a button: run on opening and whenever the app comes back to the screen, so a
 *  device left open sees what another device did, and two devices that both changed are merged by themselves. */
export async function autoSettle(): Promise<'pull' | 'merge' | 'push' | 'none'> {
  if (!driveConnected()) return 'none'
  const remote = await loadDriveState()
  const seen = localModified()
  const action = settleAction(syncDecision(remote?.state ? remote.savedAt : null, cloudBase(), seen), !!cloudConflict())
  if (action === 'pull' && remote?.state) {
    // Only if nothing changed here while the cloud was being read (also in another tab); otherwise both are merged.
    if (await replaceIfUnchanged(remote.state, remote.savedAt, seen)) {
      setCloudBase(remote.savedAt)
      noteSynced('已從雲端硬碟載入最新的學習進度')
    } else await mergeWithCloud(true)
  } else if (action === 'merge' && remote?.state) {
    await mergeWithCloud(true)
  } else if (action === 'push') {
    const at = localModified() || Date.now(); setLocalModified(at)
    await saveDriveState(JSON.stringify(getSnapshot().state), at)
  }
  return action
}
