type UnfinishedSlot = { id: string; updatedAt?: number; closed?: true }

function slot(raw: string | undefined): UnfinishedSlot | null {
  try {
    const value = JSON.parse(raw ?? 'null') as UnfinishedSlot | null
    return value && typeof value.id === 'string' ? value : null
  } catch { return null }
}

const stampOf = (value: UnfinishedSlot | null) =>
  typeof value?.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0

/** Drafts saved before the change used a single key. Prefer the per-item version, even when it was closed. */
export function unfinishedItems<T extends UnfinishedSlot>(notes: Record<string, string>, key: string, valid: (value: UnfinishedSlot) => value is T): T[] {
  const prefix = key + '.'
  const records = new Map<string, UnfinishedSlot>()
  const old = slot(notes[key])
  if (old) records.set(old.id, old)
  for (const [name, raw] of Object.entries(notes)) {
    if (!name.startsWith(prefix)) continue
    const value = slot(raw)
    if (value && name === prefix + value.id) records.set(value.id, value)
  }
  return [...records.values()].filter((value): value is T => !value.closed && valid(value))
    .sort((a, b) => stampOf(b) - stampOf(a))
}

/** Closing a draft leaves a small marker so a stale device's copy cannot reopen it when synced. */
export function writeUnfinished<T extends UnfinishedSlot>(notes: Record<string, string>, key: string, id: string, draft: T | null) {
  const name = key + '.' + id
  const stamp = Math.max(Date.now(), stampOf(slot(notes[name])) + 1)
  const value = draft ? { ...draft, id, updatedAt: stamp } : { id, updatedAt: stamp, closed: true }
  return { ...notes, [name]: JSON.stringify(value) }
}

/** Newest edit to the same item wins regardless of unrelated activity on either device. */
export function mergeUnfinished(older: string, newer: string): string {
  const a = slot(older), b = slot(newer)
  if (!a) return newer
  if (!b) return older
  const order = stampOf(a) - stampOf(b)
  return order > 0 || (order === 0 && a.closed && !b.closed) ? older : newer
}
