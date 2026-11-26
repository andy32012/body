/**
 * Which progress a device uses after connecting to Google Drive, shared by Settings and the scan-to-connect dialog.
 * When the learner chooses to replace a copy, keep the copy that is being replaced first.
 */
import { exportBackup, importBackup, localModified, readStoreForCloud, recordCloudSave, replaceIfUnchanged, restoreBackup, updateStoreNow } from './store'
import { mergeStates } from './merge'
import { mergeMemory, readDeleted, readMemory, readMemoryTimes, writeMemoryRecords, type MemoryRecords } from './memory'
import {
  addHistory, clearConflict, cloudConflict, cloudScope, driveConfig, driveReadyEvent, loadDriveMemory, loadDriveState, loadHistoryVersion,
  markConflict, markMergeWaiting, noteSynced, sameConnection, saveDriveMemory, saveDriveState, syncDecision, type DriveMemory,
} from './drive'

export const stamp = (at: number) => new Date(at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const backupName = (which: 'this-device' | 'cloud') =>
  'dream-blueprint-backup-' + which + '-' + new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '-').replace(':', '') + '.json'

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Connection = NonNullable<ReturnType<typeof driveConfig>>
type Progress = Awaited<ReturnType<typeof readStoreForCloud>>
function requireConnection(d: Connection | null): Connection {
  if (!d || !sameConnection(d)) throw new Error('雲端連線已經中斷或切換。')
  return d
}

// Resolve, merge, and save at most one progress copy at a time per browser, including its other tabs.
let progressWork: Promise<unknown> = Promise.resolve()
function withProgress<T>(action: (d: Connection) => Promise<T>): Promise<T> {
  const d = driveConfig()
  const work = () => action(requireConnection(d))
  const next = progressWork.then(() => navigator.locks ? navigator.locks.request('dream-blueprint.cloud-progress', work) : work())
  progressWork = next.catch(() => {})
  return next
}

async function push(d: Connection, snapshot: Progress, base: number, backup = false) {
  if (!snapshot.persisted) throw new Error('本機有尚未存下的進度。請保留目前頁面，先到設定匯出備份。')
  const result = await saveDriveState({ state: JSON.stringify(snapshot.state), modified: snapshot.modified, base, backup }, d)
  requireConnection(d)
  if (result.kind === 'saved') {
    if (!await recordCloudSave(result.savedAt, snapshot.modified, snapshot.base, snapshot.scope)) {
      throw new Error('雲端已收到上次的存檔，本機另有更新，尚待再次同步。')
    }
    clearConflict()
    noteSynced('學習進度已存到雲端硬碟')
  }
  return result
}

export type Settled = { kind: 'pulled' | 'pushed' | 'none' } | { kind: 'conflict'; remoteAt: number }
export async function settleProgress(): Promise<Settled> {
  try {
    return await withProgress(async d => {
      const remote = await loadDriveState(d)
      const seen = await readStoreForCloud()
      requireConnection(d)
      const decision = syncDecision(remote?.state ? remote.savedAt : null, seen.base, seen.modified)
      if (decision === 'pull' && remote?.state) {
        if (await replaceIfUnchanged(remote.state, remote.savedAt, seen.modified, seen.base, seen.scope)) {
          clearConflict()
          noteSynced('已從雲端硬碟載入最新的學習進度')
          return { kind: 'pulled' }
        }
        markConflict(remote.savedAt, false)
        return { kind: 'conflict', remoteAt: remote.savedAt }
      }
      if (decision === 'conflict' && remote) {
        markConflict(remote.savedAt, false)
        return { kind: 'conflict', remoteAt: remote.savedAt }
      }
      if (decision === 'push') {
        const result = await push(d, seen, remote?.savedAt ?? 0)
        if (result.kind === 'saved') return { kind: 'pushed' }
        markConflict(result.savedAt, false)
        return { kind: 'conflict', remoteAt: result.savedAt }
      }
      return { kind: 'none' }
    })
  } finally {
    window.dispatchEvent(new Event(driveReadyEvent))
  }
}

/** Replace this device's progress only if its copy is still the one that was backed up. */
export function takeCloudCopy() {
  return withProgress(async d => {
    const remote = await loadDriveState(d)
    if (!remote?.state) throw new Error('雲端硬碟裡沒有進度可以載入。')
    const seen = await readStoreForCloud()
    download(backupName('this-device'), exportBackup(seen.state))
    requireConnection(d)
    await restoreBackup(remote.state, remote.savedAt, { cloudBase: remote.savedAt, expected: seen.state, scope: cloudScope(d) })
    clearConflict()
    noteSynced('已換成雲端硬碟的進度（這台原本的進度已下載成備份檔）')
    return '已換成雲端硬碟的進度。這台原本的進度下載成備份檔了，需要時可以到「備份」匯入。'
  })
}

export const mergeRounds = 4
let merging: Promise<string> | null = null
export function mergeWithCloud(quiet = false): Promise<string> {
  if (!merging) merging = withProgress(d => mergeNow(d, quiet)).finally(() => { merging = null })
  return merging
}
async function mergeNow(d: Connection, quiet: boolean) {
  const first = await loadDriveState(d)
  if (!first?.state) throw new Error('雲端硬碟裡沒有進度可以合併。')
  let remote = { state: first.state, savedAt: first.savedAt }
  const initial = await readStoreForCloud()
  if (!quiet || !(await addHistory(JSON.stringify(initial.state), initial.modified || Date.now(), 'before-merge', d))) {
    download(backupName('this-device'), exportBackup(initial.state))
  }
  for (let round = 1; ; round++) {
    const theirs = importBackup(remote.state)
    requireConnection(d)
    await updateStoreNow(prev => {
      requireConnection(d)
      return importBackup(JSON.stringify(mergeStates(prev, theirs, localModified() >= remote.savedAt)))
    })
    const merged = await readStoreForCloud()
    const result = await push(d, merged, remote.savedAt)
    if (result.kind === 'saved') {
      noteSynced('兩份進度已合併，也存到雲端硬碟了')
      const c = merged.state.curriculum
      return '兩份合併好了：兩台做過的都留著，課表接在單元 ' + c.unit + ' 第 ' + c.day + ' 天。' + (quiet ? '' : '這台原本的進度也下載成備份檔了。')
    }
    if (round >= mergeRounds) {
      markMergeWaiting(result.savedAt)
      return '另一台裝置一直有新進度存進雲端，這次合併好的先留在這台（兩台做過的都在），等一下會自己再合併一次。'
    }
    const again = await loadDriveState(d)
    if (!again?.state) throw new Error('雲端進度已變更，這台合併好的進度已保留。')
    remote = { state: again.state, savedAt: again.savedAt }
  }
}

export function keepThisCopy() {
  return withProgress(async d => {
    const remote = await loadDriveState(d)
    const snapshot = await readStoreForCloud()
    if (remote?.state) download(backupName('cloud'), remote.state)
    const result = await push(d, snapshot, remote?.savedAt ?? 0, true)
    if (result.kind === 'stale') {
      markConflict(result.savedAt, false)
      throw new Error('雲端已有新進度，請先重新確認要使用的版本。兩份都已保留。')
    }
    return remote?.state
      ? '已用這台裝置的進度更新雲端。雲端原本的進度已下載成備份檔。'
      : '已把這台裝置的進度存到雲端。'
  })
}

export function restoreVersion(id: string) {
  return withProgress(async d => {
    const version = await loadHistoryVersion(id, d)
    importBackup(version.state)
    const remote = await loadDriveState(d)
    const before = await readStoreForCloud()
    const kept = await addHistory(JSON.stringify(before.state), before.modified || Date.now(), 'before-restore', d)
    if (!kept) download(backupName('this-device'), exportBackup(before.state))
    requireConnection(d)
    await restoreBackup(version.state, undefined, { expected: before.state, scope: cloudScope(d) })
    const restored = await readStoreForCloud()
    const result = await push(d, restored, remote?.savedAt ?? 0, true)
    if (result.kind === 'stale') {
      markConflict(result.savedAt, false)
      return '已先還原至本機。雲端另有新進度，兩份都已保留，請在設定確認要使用的版本。'
    }
    return '已經還原到 ' + stamp(version.savedAt || Date.now()) + ' 那份進度。還原前的進度已' + (kept ? '存進歷史版本。' : '下載成備份檔。')
  })
}

export function settleAction(decision: ReturnType<typeof syncDecision>, paused: boolean): 'pull' | 'merge' | 'push' | 'none' {
  if (paused || decision === 'conflict') return 'merge'
  return decision
}
let settling: Promise<'pull' | 'merge' | 'push' | 'none'> | null = null
export function autoSettle() {
  if (!driveConfig()) return Promise.resolve('none' as const)
  if (!settling) settling = withProgress(settleNow).finally(() => { settling = null })
  return settling
}
async function settleNow(d: Connection): Promise<'pull' | 'merge' | 'push' | 'none'> {
  if (cloudConflict()?.auto === false) return 'none'
  const remote = await loadDriveState(d)
  const seen = await readStoreForCloud()
  const action = settleAction(syncDecision(remote?.state ? remote.savedAt : null, seen.base, seen.modified), !!remote?.state && !!cloudConflict())
  requireConnection(d)
  if (action === 'pull' && remote?.state) {
    if (await replaceIfUnchanged(remote.state, remote.savedAt, seen.modified, seen.base, seen.scope)) {
      clearConflict()
      noteSynced('已從雲端硬碟載入最新的學習進度')
    } else {
      await mergeNow(d, true)
      return 'merge'
    }
  } else if (action === 'merge' && remote?.state) {
    await mergeNow(d, true)
  } else if (action === 'push') {
    const result = await push(d, seen, remote?.savedAt ?? 0)
    if (result.kind === 'stale') markConflict(result.savedAt)
  }
  return action
}

function sameMemoryList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every(n => b.includes(n))
}
function sameMemory(a: MemoryRecords, b: MemoryRecords) {
  const times = Object.entries(a.updated ?? {})
  return sameMemoryList(a.notes, b.notes) && sameMemoryList(a.deleted, b.deleted)
    && times.length === Object.keys(b.updated ?? {}).length && times.every(([n, time]) => b.updated?.[n] === time)
}
function memoryFrom(notes: Record<string, string>): MemoryRecords {
  return { notes: readMemory(notes), deleted: readDeleted(notes), updated: readMemoryTimes(notes) }
}
function combineMemory(a: MemoryRecords, b: MemoryRecords) {
  return mergeMemory(a.notes, a.deleted, b.notes, b.deleted, a.updated, b.updated)
}

let memoryWork: Promise<void> = Promise.resolve()
/** Carry additions and deletion records both ways; a notebook left open can never send its stale copy over the cloud. */
export function syncDriveMemory() {
  const d = driveConfig()
  if (!d) return Promise.resolve()
  const sync = () => syncMemoryNow(requireConnection(d))
  const next = memoryWork.then(() => navigator.locks ? navigator.locks.request('dream-blueprint.cloud-memory', sync) : sync())
  memoryWork = next.catch(() => {})
  return next
}
async function syncMemoryNow(d: Connection) {
  let remote = await loadDriveMemory(d)
  for (let round = 0; remote && round < mergeRounds; round++) {
    const old = remote
    const local = await readStoreForCloud()
    if (!local.persisted) throw new Error('本機助教記憶尚未存下，請先保留或匯出這台的資料。')
    const merged = combineMemory(memoryFrom(local.state.notes), old)
    const unchanged = old.revision === null ? sameMemoryList(merged.notes, old.notes) && sameMemoryList(merged.deleted, old.deleted) : sameMemory(merged, old)
    if (unchanged) {
      await applyDriveMemory(d, old)
      return
    }
    const result = await saveDriveMemory(merged, old.revision, d)
    if (result?.stale) { remote = result.memory; continue }
    await applyDriveMemory(d, result?.memory ?? { ...merged, revision: old.revision })
    return
  }
  if (remote) throw new Error('另一台裝置也在更新助教記憶，本機的改動仍已保留。')
}
async function applyDriveMemory(d: Connection, remote: DriveMemory) {
  await updateStoreNow(state => {
    requireConnection(d)
    const before = memoryFrom(state.notes)
    const merged = combineMemory(before, remote)
    if (sameMemory(before, merged)) return state
    return { ...state, notes: writeMemoryRecords(state.notes, merged) }
  })
}
