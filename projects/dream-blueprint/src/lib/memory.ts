import { createContext, useContext } from 'react'

/** Long-term notes the assistant keeps about the learner. Stored in state.notes so they go into the backup file. */
export const memoryNoteKey = 'ai.memory'
export const MAX_MEMORY = 60

export function readMemory(notes: Record<string, string>): string[] {
  try {
    const list = JSON.parse(notes[memoryNoteKey] || '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
export function writeMemory(notes: Record<string, string>, list: string[]) {
  return { ...notes, [memoryNoteKey]: JSON.stringify(list.slice(-MAX_MEMORY)) }
}

/** Notes the learner deleted (or asked to forget), kept so a synced copy from another device cannot bring them back. */
export const memoryDeletedKey = 'ai.memory.deleted'
export const memoryTimesKey = 'ai.memory.updated'
export function readDeleted(notes: Record<string, string>): string[] {
  try {
    const list = JSON.parse(notes[memoryDeletedKey] || '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
export function memoryTimes(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, number] =>
    typeof pair[1] === 'number' && Number.isSafeInteger(pair[1]) && pair[1] > 0))
}
export function readMemoryTimes(notes: Record<string, string>) {
  try { return memoryTimes(JSON.parse(notes[memoryTimesKey] || '{}')) } catch { return {} }
}
export type MemoryRecords = { notes: string[]; deleted: string[]; updated?: Record<string, number> }
export function writeMemoryRecords(notes: Record<string, string>, memory: MemoryRecords) {
  return { ...writeMemory(notes, memory.notes), [memoryDeletedKey]: JSON.stringify(memory.deleted),
    ...(memory.updated || memoryTimesKey in notes ? { [memoryTimesKey]: JSON.stringify(memory.updated ?? {}) } : {}) }
}
function keepTimes(list: string[], deleted: string[], updated: Record<string, number>) {
  return Object.fromEntries([...list, ...deleted].filter(n => Object.hasOwn(updated, n)).map(n => [n, updated[n]]))
}
/** Writes the list and records what disappeared from it as deleted; a note written again is no longer deleted. */
export function replaceMemory(notes: Record<string, string>, next: string[]) {
  const before = readMemory(notes)
  const gone = before.filter(n => !next.includes(n))
  const deleted = [...new Set([...readDeleted(notes).filter(n => !next.includes(n)), ...gone])].slice(-200)
  const updated = readMemoryTimes(notes)
  const at = Object.values(updated).reduce((latest, t) => Math.max(latest, t + 1), Date.now())
  const changed = [...gone, ...next.filter(n => !before.includes(n))]
  return writeMemoryRecords(notes, { notes: next, deleted,
    updated: keepTimes(next, deleted, { ...updated, ...Object.fromEntries(changed.map(n => [n, at])) }) })
}
/** Prefer the latest individual edit. A legacy or concurrent tie keeps a deletion. */
export function mergeMemory(local: string[], localDeleted: string[], remote: string[], remoteDeleted: string[],
  localTimes: Record<string, number> = {}, remoteTimes: Record<string, number> = {}): MemoryRecords {
  const active = [...new Set([...local, ...remote])]
  const removed = [...new Set([...localDeleted, ...remoteDeleted])]
  const presentHere = new Set(local), presentThere = new Set(remote)
  const removedHere = new Set(localDeleted), removedThere = new Set(remoteDeleted)
  const mergedTimes = new Map<string, number>()
  const gone = new Set<string>()
  for (const n of new Set([...active, ...removed])) {
    const myTime = (presentHere.has(n) || removedHere.has(n)) && Object.hasOwn(localTimes, n) ? localTimes[n] : 0
    const theirTime = (presentThere.has(n) || removedThere.has(n)) && Object.hasOwn(remoteTimes, n) ? remoteTimes[n] : 0
    if ((myTime >= theirTime && removedHere.has(n)) || (theirTime >= myTime && removedThere.has(n))) gone.add(n)
    if (myTime || theirTime) mergedTimes.set(n, Math.max(myTime, theirTime))
  }
  const byTime = (a: string, b: string) => (mergedTimes.get(a) ?? 0) - (mergedTimes.get(b) ?? 0)
  const notes = active.filter(n => !gone.has(n)).sort(byTime).slice(-MAX_MEMORY)
  const deleted = removed.filter(n => gone.has(n)).sort(byTime).slice(-200)
  const updated = keepTimes(notes, deleted, Object.fromEntries(mergedTimes))
  return { notes, deleted, ...(Object.keys(updated).length ? { updated } : {}) }
}
export function mergeMemoryNotes(local: Record<string, string>, remote: Record<string, string>) {
  const records = mergeMemory(readMemory(local), readDeleted(local), readMemory(remote), readDeleted(remote),
    readMemoryTimes(local), readMemoryTimes(remote))
  // A separate mapping keeps stale metadata from a key already copied into the merged progress.
  return { [memoryNoteKey]: JSON.stringify(records.notes), [memoryDeletedKey]: JSON.stringify(records.deleted),
    [memoryTimesKey]: JSON.stringify(records.updated ?? {}) }
}

export function memoryPrompt(list: string[], canUpdate = true) {
  return [
    '',
    '【你記得的事】（之前聊天時記下來的，回答時自然用上，不要逐條唸出來）',
    ...(list.length ? list.map(n => '- ' + n) : ['- 目前還沒有']),
    '',
    canUpdate
      ? '【記憶規則】如果他這次說了值得長期記住的事（例如考試或重要日期、常搞錯的字或文法、喜歡或討厭的東西、目標、心情狀況），在回覆的最後另起一行，寫「[記住] 一句話的內容」，可以寫好幾行。已經記過的不要重複。他說「忘掉某件事」時，寫「[忘記] 那件事的關鍵字」。這幾行他看不到。'
      : '這段是題目討論，只能使用已有的記憶，請勿新增或刪除長期記憶。',
  ].join('\n')
}

/** Pulls "[記住] …" and "[忘記] …" lines out of a reply. */
export function extractMemory(text: string) {
  const remember: string[] = []
  const forget: string[] = []
  const clean = text.split('\n').filter(line => {
    const m = line.trim().match(/^\[(記住|忘記)\]\s*(.+)$/)
    if (!m) return true
    ;(m[1] === '記住' ? remember : forget).push(m[2].trim())
    return false
  }).join('\n').trim()
  return { clean, remember, forget }
}

export function applyMemory(list: string[], remember: string[], forget: string[]) {
  let next = list.filter(n => !forget.some(f => f && n.includes(f)))
  for (const r of remember) if (!next.includes(r)) next = [...next, r]
  return next.slice(-MAX_MEMORY)
}

export type MemoryApi = { notes: string[]; update: (remember: string[], forget: string[]) => void; remove: (index: number) => void; clear: () => void }
export const MemoryContext = createContext<MemoryApi>({ notes: [], update() {}, remove() {}, clear() {} })
export const useMemory = () => useContext(MemoryContext)
