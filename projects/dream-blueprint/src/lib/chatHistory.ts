import type { TutorTurn } from './tutor'

export type ChatTurn = TutorTurn & { id: string }
export type ChatExchange = { id: string; question: string; reply: string }
export type ChatHistory = { generation: string; turns: ChatTurn[] }

const legacy = 'legacy'
const generationKey = (key: string) => key + '.generation'
const exchangePrefix = (key: string) => key + '.exchanges.'
const generationPrefix = (key: string, generation: string) => exchangePrefix(key) + generation + '/'
const newId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
export const emptyChat: ChatHistory = { generation: legacy, turns: [] }

export const chatGeneration = (key: string) => localStorage.getItem(generationKey(key)) ?? legacy
export const isChatChange = (key: string, changed: string | null) =>
  changed === null || changed === key || changed === generationKey(key) || changed.startsWith(exchangePrefix(key))

function readJSON(key: string): unknown {
  const raw = localStorage.getItem(key)
  try { return raw ? JSON.parse(raw) : null } catch { return null }
}
function oldTurns(key: string): ChatTurn[] {
  const saved = readJSON(key)
  if (!Array.isArray(saved)) return []
  return saved.flatMap((turn, index) => {
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string') return []
    return [{ role: turn.role, content: turn.content, id: 'old-' + index }]
  })
}
export function createChatExchange(question: string, reply: string): ChatExchange {
  return { id: Date.now().toString().padStart(16, '0') + '-' + newId(), question, reply }
}
export function exchangeTurns({ id, question, reply }: ChatExchange): ChatTurn[] {
  return [{ id: id + '/q', content: question, role: 'user' }, { id: id + '/a', content: reply, role: 'assistant' }]
}

function historyFor(key: string, generation: string): ChatHistory {
  const prefix = generationPrefix(key, generation)
  const exchanges = Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort().slice(-20)
  const turns = generation === legacy && exchanges.length < 20 ? oldTurns(key) : []
  for (const file of exchanges) {
    const saved = readJSON(file) as Partial<ChatExchange> | null
    if (typeof saved?.question === 'string' && typeof saved.reply === 'string') {
      turns.push(...exchangeTurns({ id: file.slice(prefix.length), question: saved.question, reply: saved.reply }))
    }
  }
  return { generation, turns: turns.slice(-40) }
}
export function readChatHistory(key: string): ChatHistory {
  const generation = chatGeneration(key)
  const history = historyFor(key, generation)
  const latest = chatGeneration(key)
  return latest === generation ? history : historyFor(key, latest)
}

/** Write one exchange without replacing another tab's conversation. A concurrent clear starts a new generation. */
export function appendChatExchange(key: string, generation: string, entry: ChatExchange): boolean {
  if (chatGeneration(key) !== generation) return false
  const prefix = generationPrefix(key, generation)
  const itemKey = prefix + entry.id
  localStorage.setItem(itemKey, JSON.stringify({ question: entry.question, reply: entry.reply }))
  if (chatGeneration(key) !== generation) {
    try { localStorage.removeItem(itemKey) } catch { /* The cleared generation stays hidden. */ }
    return false
  }
  // The item has been saved even if housekeeping later fails.
  try {
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort().slice(0, -20)
    for (const oldKey of oldKeys) localStorage.removeItem(oldKey)
    if (oldKeys.length && generation === legacy) localStorage.removeItem(key)
  } catch { /* Leave cleanup for a later write. */ }
  return true
}

export function clearChatHistory(key: string): ChatHistory {
  const generation = newId()
  const oldKeys = Object.keys(localStorage).filter(k => k === key || k.startsWith(exchangePrefix(key)))
  localStorage.setItem(generationKey(key), generation)
  // Only records already present before the new generation was published can be removed.
  try {
    for (const oldKey of oldKeys) localStorage.removeItem(oldKey)
  } catch { /* The older generation is no longer displayed. */ }
  return { generation, turns: [] }
}
