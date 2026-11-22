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
export function readDeleted(notes: Record<string, string>): string[] {
  try {
    const list = JSON.parse(notes[memoryDeletedKey] || '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
/** Writes the list and records what disappeared from it as deleted; a note written again is no longer deleted. */
export function replaceMemory(notes: Record<string, string>, next: string[]) {
  const before = readMemory(notes)
  const gone = before.filter(n => !next.includes(n))
  const deleted = [...new Set([...readDeleted(notes).filter(n => !next.includes(n)), ...gone])].slice(-200)
  return { ...writeMemory(notes, next), [memoryDeletedKey]: JSON.stringify(deleted) }
}
/** Merges the cloud copy: notes from both sides, minus anything deleted on either side. */
export function mergeMemory(local: string[], localDeleted: string[], remote: string[], remoteDeleted: string[]) {
  const deleted = [...new Set([...localDeleted, ...remoteDeleted])]
  const keep = (n: string) => !deleted.includes(n)
  return { notes: applyMemory(local.filter(keep), remote.filter(keep), []), deleted: deleted.slice(-200) }
}

export function memoryPrompt(list: string[]) {
  return [
    '',
    '【你記得的事】（之前聊天時記下來的，回答時自然用上，不要逐條唸出來）',
    ...(list.length ? list.map(n => '- ' + n) : ['- 目前還沒有']),
    '',
    '【記憶規則】如果他這次說了值得長期記住的事（例如考試或重要日期、常搞錯的字或文法、喜歡或討厭的東西、目標、心情狀況），在回覆的最後另起一行，寫「[記住] 一句話的內容」，可以寫好幾行。已經記過的不要重複。他說「忘掉某件事」時，寫「[忘記] 那件事的關鍵字」。這幾行他看不到。',
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
