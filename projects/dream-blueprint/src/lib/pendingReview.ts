export interface ReviewReply { reply: string; rewrite?: string }
type Requesting = { state: 'requesting'; token: string; until: number }
type Received = { state: 'received'; token: string; value: ReviewReply }
type SavedReview = Requesting | Received | { state: 'uncertain'; token: string }
type Claim = Requesting | Received | { state: 'busy' } | { state: 'confirm' } | { state: 'unconfigured' }

export const reviewTimeout = 120_000
let connection: Promise<IDBDatabase> | undefined
function reviewDatabase() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('IndexedDB unavailable')); return }
      const request = indexedDB.open('dream-blueprint-reviews', 1)
      let blocked = false
      request.onblocked = () => { blocked = true; reject(new Error('Review database blocked')) }
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => request.result.createObjectStore('checks')
      request.onsuccess = () => {
        const db = request.result
        if (blocked) { db.close(); return }
        db.onversionchange = () => { db.close(); connection = undefined }
        db.onclose = () => { connection = undefined }
        resolve(db)
      }
    }).catch(error => { connection = undefined; throw error })
  }
  return connection
}

/** A read/write transaction claims the same answer across tabs, including browsers without Web Locks. */
async function editReview<T>(id: string, edit: (record: SavedReview | undefined) => { result: T; next?: SavedReview | null }): Promise<T> {
  const db = await reviewDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('checks', 'readwrite')
    const checks = transaction.objectStore('checks')
    const request = checks.get(id)
    let result: T
    request.onsuccess = () => {
      try {
        const changed = edit(request.result as SavedReview | undefined)
        result = changed.result
        if (changed.next === null) checks.delete(id)
        else if (changed.next !== undefined) checks.put(changed.next, id)
      } catch (error) {
        reject(error)
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () => reject(transaction.error ?? new Error('Review database write aborted'))
  })
}

export function claimReview(id: string, confirmed: boolean, allowRequest: boolean) {
  return editReview<Claim>(id, current => {
    if (current?.state === 'received') return { result: current }
    if (current?.state === 'requesting' && current.until > Date.now()) return { result: { state: 'busy' } }
    if (!allowRequest) return { result: { state: 'unconfigured' } }
    if (current && !confirmed) return { result: { state: 'confirm' } }
    const token = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)
    const request: Requesting = { state: 'requesting', token, until: Date.now() + reviewTimeout + 30_000 }
    return { result: request, next: request }
  })
}

export function receiveReview(id: string, token: string, value: ReviewReply) {
  return editReview(id, current => current?.state === 'requesting' && current.token === token
    ? { result: true, next: { state: 'received', token, value } } : { result: false })
}

export function closeReview(id: string, token: string, uncertain = false) {
  return editReview(id, current => ({
    result: undefined, next: current?.token === token ? (uncertain ? { state: 'uncertain', token } : null) : undefined,
  }))
}
