/** Keep the existing numeric note for older tabs. The companion array also survives their generic list merge. */
type DailyCount = { legacy: number; ids: string[] }

const itemsPrefix = 'daily-count.items.'
const itemsKey = (key: string) => itemsPrefix + key

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function read(notes: Record<string, string>, key: string): DailyCount {
  const total = count(Number(notes[key]))
  const ids = new Set<string>()
  let legacy = 0
  try {
    const entries: unknown = JSON.parse(notes[itemsKey(key)] ?? '[]')
    if (Array.isArray(entries)) for (const entry of entries) {
      if (typeof entry === 'string' && entry.trim()) ids.add(entry)
      else legacy = Math.max(legacy, count(entry))
    }
  } catch { /* The numeric note still works if the companion list cannot be read. */ }
  return { legacy: Math.max(legacy, total - ids.size), ids: [...ids] }
}

function write(notes: Record<string, string>, key: string, legacy: number, ids: string[]) {
  const distinct = [...new Set(ids)].sort()
  notes[key] = String(legacy + distinct.length)
  notes[itemsKey(key)] = JSON.stringify([legacy, ...distinct])
}

export function readDailyCount(notes: Record<string, string>, key: string) {
  const { legacy, ids } = read(notes, key)
  return legacy + ids.length
}

export function recordDailyItem(notes: Record<string, string>, key: string, id: string) {
  const { legacy, ids } = read(notes, key)
  if (ids.includes(id)) return notes
  const next = { ...notes }
  write(next, key, legacy, [...ids, id])
  return next
}

/** Normalize each copy before merging. A legacy number has no item identities, so keep its largest known amount once. */
export function reconcileIdentifiedCounts(notes: Record<string, string>, ...copies: Record<string, string>[]) {
  for (const ledger of Object.keys(notes)) {
    if (!/^daily-count\.items\.(?:vocab-screen|word-part\.day|review\.sentences)\.\d{4}-\d{2}-\d{2}$/.test(ledger)) continue
    const key = ledger.slice(itemsPrefix.length)
    const counts = copies.map(copy => read(copy, key))
    write(notes, key, Math.max(0, ...counts.map(result => result.legacy)), counts.flatMap(result => result.ids))
  }
}

export const screeningLimit = 50
export const screeningKey = (day: string) => 'vocab-screen.' + day
